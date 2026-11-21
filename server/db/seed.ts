// Loads (or removes) the sample recipes.
//   npm run db:seed               add samples that aren't there yet
//   npm run db:seed -- --remove   delete every sample recipe
// Uses DATABASE_URL, so it targets whichever database .env points at.
import { inArray, sql } from 'drizzle-orm';
import { db, pool } from './client.js';
import { cookLogs, people, recipeIngredients, recipeSteps, recipeTags, recipes, tags } from './schema.js';
import { SAMPLE_RECIPES } from './sampleRecipes.js';

const DAY = 24 * 60 * 60 * 1000;

// Everything for one recipe runs on the transaction's own connection. (Looking
// people up on a second connection deadlocks: the transaction holds locks on
// rows it references, and the second connection waits on them forever.)
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function personId(tx: Tx, name: string): Promise<number> {
  const [row] = await tx
    .insert(people)
    .values({ name })
    .onConflictDoUpdate({ target: people.name, set: { name: sql`excluded.name` } })
    .returning({ id: people.id });
  return row.id;
}

async function tagId(tx: Tx, name: string): Promise<number> {
  const [row] = await tx
    .insert(tags)
    .values({ name })
    .onConflictDoUpdate({ target: tags.name, set: { name: sql`excluded.name` } })
    .returning({ id: tags.id });
  return row.id;
}

async function add() {
  const existing = await db.select({ slug: recipes.slug }).from(recipes);
  const have = new Set(existing.map((r) => r.slug));
  let added = 0;

  for (const s of SAMPLE_RECIPES) {
    if (have.has(s.slug)) continue;
    const createdAt = new Date(Date.now() - s.addedDaysAgo * DAY);

    await db.transaction(async (tx) => {
      const [recipe] = await tx
        .insert(recipes)
        .values({
          slug: s.slug,
          title: s.title,
          description: s.description,
          sourceType: s.sourceType,
          sourcePersonId: s.sourcePerson ? await personId(tx, s.sourcePerson) : null,
          sourceName: s.sourceName ?? null,
          sourceUrl: s.sourceUrl ?? null,
          sourceNote: s.sourceNote ?? null,
          servings: s.servings,
          yieldLabel: s.yieldLabel,
          prepMinutes: s.prepMinutes ?? null,
          cookMinutes: s.cookMinutes ?? null,
          totalMinutes: s.totalMinutes ?? null,
          createdAt,
          updatedAt: createdAt,
        })
        .returning({ id: recipes.id });

      await tx.insert(recipeIngredients).values(
        s.ingredients.map((i, position) => ({
          recipeId: recipe.id,
          position,
          groupLabel: i.group ?? null,
          rawText: i.raw,
          quantity: i.qty ?? null,
          quantityMax: i.max ?? null,
          unit: i.unit ?? null,
          item: i.item,
          note: i.note ?? null,
        })),
      );

      await tx.insert(recipeSteps).values(
        s.steps.map((step, position) => ({
          recipeId: recipe.id,
          position,
          text: step.text,
          timerSeconds: step.timerSeconds ?? null,
        })),
      );

      for (const name of s.tags) {
        await tx.insert(recipeTags).values({ recipeId: recipe.id, tagId: await tagId(tx, name) });
      }

      for (const log of s.cookLogs) {
        await tx.insert(cookLogs).values({
          recipeId: recipe.id,
          personId: await personId(tx, log.person),
          cookedOn: new Date(Date.now() - log.daysAgo * DAY).toISOString().slice(0, 10),
          rating: log.rating ?? null,
          note: log.note ?? null,
        });
      }
    });
    added++;
  }

  console.log(`Added ${added} sample recipe(s); ${SAMPLE_RECIPES.length - added} were already there.`);
}

async function remove() {
  const slugs = SAMPLE_RECIPES.map((s) => s.slug);
  const deleted = await db.delete(recipes).where(inArray(recipes.slug, slugs)).returning({ id: recipes.id });
  console.log(`Removed ${deleted.length} sample recipe(s). People and tags are left in place.`);
}

try {
  await (process.argv.includes('--remove') ? remove() : add());
} finally {
  await pool.end();
}
