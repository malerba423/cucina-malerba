import { Router } from 'express';
import { and, asc, desc, eq, exists, gte, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cookLogs, people, recipeIngredients, recipes } from '../db/schema.js';
import {
  ADDED_RANGES,
  SEARCH_FIELDS,
  SORTS,
  SOURCE_TYPES,
  type AddedRange,
  type BrowseResponse,
  type RecipeCard,
  type RecipeDetail,
  type RecipeListResponse,
  type SearchField,
  type Sort,
  type SourceType,
} from '../../shared/types.js';

export const recipesRouter = Router();

// Computed per recipe from the cook log.
const madeCount = sql<number>`(select count(*)::int from ${cookLogs} where ${cookLogs.recipeId} = ${recipes.id})`;
const avgRating = sql<number | null>`(select round(avg(${cookLogs.rating})::numeric, 1)::float8 from ${cookLogs} where ${cookLogs.recipeId} = ${recipes.id} and ${cookLogs.rating} is not null)`;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

// User text goes into ILIKE as a bound parameter; escape its wildcards so
// "50%" means the characters 5, 0, %.
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// GET /api/recipes?q=&by=any|name|ingredient|source&source=&person=&added=&quick=&sort=
recipesRouter.get('/recipes', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const by = pick<SearchField>(req.query.by, SEARCH_FIELDS, 'any');
  const source = pick<SourceType | 'all'>(req.query.source, [...SOURCE_TYPES, 'all'], 'all');
  const added = pick<AddedRange>(req.query.added, ADDED_RANGES, 'any');
  const sort = pick<Sort>(req.query.sort, SORTS, 'newest');
  const personId = Number(req.query.person);
  const quick = new Set(typeof req.query.quick === 'string' ? req.query.quick.split(',') : []);

  const where: SQL[] = [];

  if (q) {
    const pattern = likePattern(q);
    const byName = ilike(recipes.title, pattern);
    const bySource = or(ilike(recipes.sourceName, pattern), ilike(people.name, pattern), ilike(recipes.sourceNote, pattern))!;
    const byIngredient = exists(
      db
        .select({ one: sql`1` })
        .from(recipeIngredients)
        .where(
          and(
            eq(recipeIngredients.recipeId, recipes.id),
            or(ilike(recipeIngredients.item, pattern), ilike(recipeIngredients.rawText, pattern)),
          ),
        ),
    );
    where.push(
      by === 'name' ? byName : by === 'ingredient' ? byIngredient : by === 'source' ? bySource : or(byName, bySource, byIngredient)!,
    );
  }

  if (source !== 'all') where.push(eq(recipes.sourceType, source));
  if (Number.isInteger(personId) && personId > 0) where.push(eq(recipes.sourcePersonId, personId));

  if (added !== 'any') {
    const since = new Date();
    since.setMonth(since.getMonth() - (added === 'month' ? 1 : 12));
    where.push(gte(recipes.createdAt, since));
  }

  if (quick.has('under30')) where.push(sql`${recipes.totalMinutes} <= 30`);
  if (quick.has('never-made')) where.push(sql`${madeCount} = 0`);
  if (quick.has('rated4')) where.push(sql`${avgRating} >= 4`);

  const order =
    sort === 'oldest'
      ? [asc(recipes.createdAt)]
      : sort === 'name'
        ? [asc(recipes.title)]
        : sort === 'most-made'
          ? [desc(madeCount), desc(recipes.createdAt)]
          : [desc(recipes.createdAt)];

  const rows = await db
    .select({
      slug: recipes.slug,
      title: recipes.title,
      sourceType: recipes.sourceType,
      sourceName: recipes.sourceName,
      personName: people.name,
      createdAt: recipes.createdAt,
      totalMinutes: recipes.totalMinutes,
      photoUrl: recipes.photoUrl,
      madeCount,
      avgRating,
    })
    .from(recipes)
    .leftJoin(people, eq(recipes.sourcePersonId, people.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(...order)
    .limit(200);

  const body: RecipeListResponse = {
    total: rows.length,
    recipes: rows.map(
      (r): RecipeCard => ({
        slug: r.slug,
        title: r.title,
        sourceType: r.sourceType,
        source: r.personName ?? r.sourceName,
        createdAt: r.createdAt.toISOString(),
        totalMinutes: r.totalMinutes,
        photoUrl: r.photoUrl,
        madeCount: r.madeCount,
        avgRating: r.avgRating,
      }),
    ),
  };
  res.json(body);
});

// GET /api/browse: counts for the sidebar drawers and the "who it came from" list.
recipesRouter.get('/browse', async (_req, res) => {
  const [sources, peopleRows, [{ total }]] = await Promise.all([
    db
      .select({ sourceType: recipes.sourceType, count: sql<number>`count(*)::int` })
      .from(recipes)
      .groupBy(recipes.sourceType),
    db
      .select({ id: people.id, name: people.name, count: sql<number>`count(${recipes.id})::int` })
      .from(people)
      .innerJoin(recipes, eq(recipes.sourcePersonId, people.id))
      .groupBy(people.id, people.name)
      .orderBy(desc(sql`count(${recipes.id})`), asc(people.name)),
    db.select({ total: sql<number>`count(*)::int` }).from(recipes),
  ]);

  const body: BrowseResponse = { total, sources, people: peopleRows };
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
    },
  });

  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const ratings = recipe.cookLogs.map((c) => c.rating).filter((r): r is number => r != null);
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
      cookedOn: c.cookedOn,
      rating: c.rating,
      note: c.note,
    })),
    madeCount: recipe.cookLogs.length,
    avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
  };
  res.json(body);
});
