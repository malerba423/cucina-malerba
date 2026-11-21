import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { recipes, users } from '../db/schema.js';
import { getSearchIndex } from '../searchIndex.js';
import { fridgeMatches, monthBound, searchDocs, type SearchDoc, type SearchParams } from '../../shared/search.js';
import {
  ADDED_RANGES,
  SEARCH_FIELDS,
  SOURCE_TYPES,
  type AddedRange,
  type BrowseResponse,
  type FridgeHit,
  type FridgeResponse,
  type RecipeCard,
  type RecipeDetail,
  type RecipeListResponse,
  type SearchField,
  type SourceType,
} from '../../shared/types.js';

export const recipesRouter = Router();

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const listParam = (v: unknown, max: number, each = 60): string[] =>
  typeof v === 'string'
    ? [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, each)))].slice(0, max)
    : [];

export function toCard(d: SearchDoc): RecipeCard {
  return {
    slug: d.slug,
    title: d.title,
    sourceType: d.sourceType,
    source: d.personName || d.sourceName || null,
    createdAt: new Date(d.createdAt).toISOString(),
    totalMinutes: d.totalMinutes,
    photoUrl: d.photoUrl,
    madeCount: d.madeCount,
    avgRating: d.avgRating,
  };
}

// GET /api/recipes?q=&by=any|name|ingredient|source&source=&person=&added=&from=&to=&tags=&quick=
recipesRouter.get('/recipes', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const added = pick<AddedRange>(req.query.added, ADDED_RANGES, 'any');
  const personId = Number(req.query.person);

  let addedFrom: number | null = null;
  let addedTo: number | null = null;
  if (added === 'month' || added === 'year') {
    const since = new Date();
    since.setMonth(since.getMonth() - (added === 'month' ? 1 : 12));
    addedFrom = since.getTime();
  } else if (added === 'custom') {
    addedFrom = monthBound(req.query.from);
    addedTo = monthBound(req.query.to, true);
  }

  const params: SearchParams = {
    q,
    by: pick<SearchField>(req.query.by, SEARCH_FIELDS, 'any'),
    source: pick<SourceType | 'all'>(req.query.source, [...SOURCE_TYPES, 'all'], 'all'),
    personId: Number.isInteger(personId) && personId > 0 ? personId : null,
    addedFrom,
    addedTo,
    quick: new Set(listParam(req.query.quick, 5)),
    tags: listParam(req.query.tags, 10).map((t) => t.toLowerCase()),
  };

  const { docs, vocab } = await getSearchIndex();
  const hits = searchDocs(docs, params, vocab);

  // Newest first. With a search, recipes matching every word come before partial matches.
  hits.sort((a, b) => a.missed.length - b.missed.length || b.doc.createdAt - a.doc.createdAt);

  const body: RecipeListResponse = {
    total: hits.length,
    fullCount: hits.filter((h) => !h.missed.length).length,
    recipes: hits.slice(0, 200).map((h) => (h.missed.length ? { ...toCard(h.doc), missed: h.missed } : toCard(h.doc))),
  };
  res.json(body);
});

// GET /api/browse: counts for the sidebar drawers, people and tags.
recipesRouter.get('/browse', async (_req, res) => {
  const { docs } = await getSearchIndex();
  const sources = new Map<SourceType, number>();
  const peopleCounts = new Map<number, { id: number; name: string; count: number }>();
  const tagCounts = new Map<string, number>();
  for (const d of docs) {
    sources.set(d.sourceType, (sources.get(d.sourceType) ?? 0) + 1);
    if (d.personId != null) {
      const p = peopleCounts.get(d.personId) ?? { id: d.personId, name: d.personName, count: 0 };
      p.count++;
      peopleCounts.set(d.personId, p);
    }
    for (const t of d.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const body: BrowseResponse = {
    total: docs.length,
    sources: [...sources].map(([sourceType, count]) => ({ sourceType, count })),
    people: [...peopleCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    tags: [...tagCounts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 40),
  };
  res.json(body);
});

// GET /api/fridge?have=chicken,lemon&staples=salt,pepper
// Public, and nothing is stored: the lists live in the visitor's browser.
recipesRouter.get('/fridge', async (req, res) => {
  const have = listParam(req.query.have, 40, 40);
  const staples = listParam(req.query.staples, 30, 40);
  const { docs } = await getSearchIndex();
  const matches = fridgeMatches(docs, { have, staples }, Infinity);
  const hit = (m: (typeof matches)[number]): FridgeHit => ({ recipe: toCard(m.doc), matched: m.matched, missing: m.missing });
  const body: FridgeResponse = {
    ready: matches.filter((m) => m.missing.length === 0).slice(0, 60).map(hit),
    close: matches.filter((m) => m.missing.length > 0 && m.missing.length <= 2).slice(0, 60).map(hit),
    more: matches.filter((m) => m.missing.length > 2).slice(0, 30).map(hit),
  };
  res.json(body);
});

// GET /api/recipes/:slug: everything the recipe page shows.
recipesRouter.get('/recipes/:slug', async (req, res) => {
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.slug, req.params.slug),
    with: {
      sourcePerson: true,
      addedBy: { columns: { id: true, name: true } },
      ingredients: { orderBy: (i, { asc }) => [asc(i.position)] },
      steps: { orderBy: (s, { asc }) => [asc(s.position)] },
      tags: { with: { tag: true } },
      cookLogs: { with: { person: true }, orderBy: (c, { desc }) => [desc(c.cookedOn), desc(c.id)] },
      notes: { with: { user: { columns: { name: true } } }, orderBy: (n, { asc }) => [asc(n.createdAt)] },
      collections: { with: { collection: { columns: { slug: true, name: true } } } },
    },
  });

  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const ratings = recipe.cookLogs.map((c) => c.rating).filter((r): r is number => r != null);
  const [parentRows, variationRows] = await Promise.all([
    recipe.parentRecipeId
      ? db.select({ slug: recipes.slug, title: recipes.title }).from(recipes).where(eq(recipes.id, recipe.parentRecipeId)).limit(1)
      : Promise.resolve([]),
    db
      .select({ slug: recipes.slug, title: recipes.title, addedBy: users.name })
      .from(recipes)
      .leftJoin(users, eq(recipes.addedByUserId, users.id))
      .where(eq(recipes.parentRecipeId, recipe.id))
      .orderBy(asc(recipes.createdAt)),
  ]);
  const body: RecipeDetail = {
    slug: recipe.slug,
    title: recipe.title,
    description: recipe.description,
    sourceType: recipe.sourceType,
    sourcePerson: recipe.sourcePerson?.name ?? null,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    sourceNote: recipe.sourceNote,
    servings: recipe.servings,
    yieldLabel: recipe.yieldLabel,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    totalMinutes: recipe.totalMinutes,
    photoUrl: recipe.photoUrl,
    addedBy: recipe.addedBy ? { id: recipe.addedBy.id, name: recipe.addedBy.name } : null,
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
    tags: recipe.tags.map((t) => t.tag.name).sort(),
    ingredients: recipe.ingredients.map((i) => ({
      id: i.id,
      groupLabel: i.groupLabel,
      rawText: i.rawText,
      quantity: i.quantity,
      quantityMax: i.quantityMax,
      unit: i.unit,
      item: i.item,
      note: i.note,
      weightGrams: i.weightGrams,
    })),
    steps: recipe.steps.map((s) => ({ id: s.id, text: s.text, timerSeconds: s.timerSeconds })),
    cookLogs: recipe.cookLogs.map((c) => ({
      id: c.id,
      person: c.person?.name ?? null,
      userId: c.userId,
      cookedOn: c.cookedOn,
      rating: c.rating,
      note: c.note,
    })),
    notes: recipe.notes.map((n) => ({
      id: n.id,
      text: n.text,
      author: n.user?.name ?? null,
      userId: n.userId,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    })),
    parent: parentRows[0] ?? null,
    variations: variationRows,
    collections: recipe.collections.map((c) => c.collection).sort((a, b) => a.name.localeCompare(b.name)),
    madeCount: recipe.cookLogs.length,
    avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
  };
  res.json(body);
});
