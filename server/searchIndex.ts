import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { cookLogs, people, recipeIngredients, recipes, recipeTags, tags } from './db/schema.js';
import { vocabulary, type SearchDoc } from '../shared/search.js';

// Every recipe in the shape search and fridge mode need, loaded with three
// queries and kept for a short while. Writes on this instance clear it right
// away; the other Cloud Run instance (if one is running) catches up within
// the cache time.

const CACHE_MS = 20_000;
let cached: { at: number; docs: SearchDoc[]; vocab: Set<string> } | null = null;
let loading: Promise<{ docs: SearchDoc[]; vocab: Set<string> }> | null = null;

export function invalidateSearchIndex(): void {
  cached = null;
}

export async function getSearchIndex(): Promise<{ docs: SearchDoc[]; vocab: Set<string> }> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  // Several requests at once share one load.
  loading ??= load()
    .then((index) => {
      cached = { at: Date.now(), ...index };
      return index;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

async function load(): Promise<{ docs: SearchDoc[]; vocab: Set<string> }> {
  const madeCount = sql<number>`(select count(*)::int from ${cookLogs} where ${cookLogs.recipeId} = ${recipes.id})`;
  const avgRating = sql<number | null>`(select round(avg(${cookLogs.rating})::numeric, 1)::float8 from ${cookLogs} where ${cookLogs.recipeId} = ${recipes.id} and ${cookLogs.rating} is not null)`;

  const [rows, ingredientRows, tagRows, madeRows] = await Promise.all([
    db
      .select({
        id: recipes.id,
        slug: recipes.slug,
        title: recipes.title,
        description: recipes.description,
        sourceType: recipes.sourceType,
        sourceName: recipes.sourceName,
        sourceNote: recipes.sourceNote,
        personId: recipes.sourcePersonId,
        personName: people.name,
        addedByUserId: recipes.addedByUserId,
        createdAt: recipes.createdAt,
        totalMinutes: recipes.totalMinutes,
        photoUrl: recipes.photoUrl,
        madeCount,
        avgRating,
      })
      .from(recipes)
      .leftJoin(people, eq(recipes.sourcePersonId, people.id)),
    db
      .select({
        recipeId: recipeIngredients.recipeId,
        item: recipeIngredients.item,
        rawText: recipeIngredients.rawText,
        groupLabel: recipeIngredients.groupLabel,
        note: recipeIngredients.note,
      })
      .from(recipeIngredients)
      .orderBy(asc(recipeIngredients.recipeId), asc(recipeIngredients.position)),
    db.select({ recipeId: recipeTags.recipeId, name: tags.name }).from(recipeTags).innerJoin(tags, eq(recipeTags.tagId, tags.id)),
    db.selectDistinct({ recipeId: cookLogs.recipeId, userId: cookLogs.userId }).from(cookLogs).where(isNotNull(cookLogs.userId)),
  ]);

  const ingredientsBy = new Map<number, SearchDoc['ingredients']>();
  for (const { recipeId, ...line } of ingredientRows) {
    const list = ingredientsBy.get(recipeId) ?? [];
    list.push(line);
    ingredientsBy.set(recipeId, list);
  }
  const tagsBy = new Map<number, string[]>();
  for (const t of tagRows) tagsBy.set(t.recipeId, [...(tagsBy.get(t.recipeId) ?? []), t.name]);

  const madeBy = new Map<number, number[]>();
  for (const m of madeRows) madeBy.set(m.recipeId, [...(madeBy.get(m.recipeId) ?? []), m.userId!]);

  const docs: SearchDoc[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description ?? '',
    sourceType: r.sourceType,
    sourceName: r.sourceName ?? '',
    sourceNote: r.sourceNote ?? '',
    personId: r.personId,
    personName: r.personName ?? '',
    addedByUserId: r.addedByUserId,
    createdAt: r.createdAt.getTime(),
    totalMinutes: r.totalMinutes,
    photoUrl: r.photoUrl,
    madeCount: r.madeCount,
    madeBy: madeBy.get(r.id) ?? [],
    avgRating: r.avgRating,
    tags: (tagsBy.get(r.id) ?? []).sort(),
    ingredients: ingredientsBy.get(r.id) ?? [],
  }));
  return { docs, vocab: vocabulary(docs) };
}
