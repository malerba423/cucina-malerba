import express, { Router } from 'express';
import { asc, eq, like, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { people, recipeIngredients, recipes, recipeSteps, recipeTags, tags } from '../db/schema.js';
import { canEditRecipe } from '../../shared/auth.js';
import { slugify } from '../../shared/parse.js';
import { validateRecipeInput, type RecipeInput } from '../../shared/recipeInput.js';
import { requireRole } from '../auth/session.js';
import { newToken } from '../auth/crypto.js';
import { createRateLimiter } from '../auth/rateLimit.js';
import { deleteByUrl, publicPrefix, putObject } from '../storage.js';
import { sniffImage } from '../imageSniff.js';
import { invalidateSearchIndex } from '../searchIndex.js';

// Adding, editing and deleting recipes, plus photo uploads. Signed-in family only.
export const recipeWriteRouter = Router();

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

async function uniqueSlug(tx: Tx, title: string): Promise<string> {
  const base = slugify(title);
  const taken = new Set((await tx.select({ slug: recipes.slug }).from(recipes).where(like(recipes.slug, `${base}%`))).map((r) => r.slug));
  taken.add('new'); // /recipes/new is the add form
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

function recipeColumns(v: RecipeInput) {
  return {
    title: v.title,
    description: v.description,
    sourceType: v.sourceType,
    sourceName: v.sourceName,
    sourceUrl: v.sourceUrl,
    sourceNote: v.sourceNote,
    servings: v.servings,
    yieldLabel: v.yieldLabel,
    prepMinutes: v.prepMinutes,
    cookMinutes: v.cookMinutes,
    totalMinutes: v.totalMinutes,
    photoUrl: v.photoUrl,
  };
}

async function writeChildren(tx: Tx, recipeId: number, v: RecipeInput) {
  await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
  await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipeId));
  await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));

  await tx.insert(recipeIngredients).values(v.ingredients.map((i, position) => ({ recipeId, position, ...i })));
  await tx.insert(recipeSteps).values(v.steps.map((s, position) => ({ recipeId, position, ...s })));
  for (const name of v.tags) await tx.insert(recipeTags).values({ recipeId, tagId: await tagId(tx, name) }).onConflictDoNothing();
}

/** Deletes a photo unless another recipe still uses it (a variation can share its original's photo). */
async function deletePhotoIfUnused(url: string | null) {
  if (!url) return;
  const [other] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.photoUrl, url)).limit(1);
  if (!other) await deleteByUrl(url);
}

async function loadForEdit(slug: string) {
  const [row] = await db
    .select({ id: recipes.id, addedByUserId: recipes.addedByUserId, photoUrl: recipes.photoUrl })
    .from(recipes)
    .where(eq(recipes.slug, slug))
    .limit(1);
  return row ?? null;
}

// GET /api/people/names: everyone a recipe can be credited to (for the form's suggestions).
recipeWriteRouter.get('/people/names', requireRole('contributor'), async (_req, res) => {
  const rows = await db.select({ name: people.name }).from(people).orderBy(asc(people.name));
  res.json({ names: rows.map((r) => r.name) });
});

// POST /api/recipes
recipeWriteRouter.post('/recipes', requireRole('contributor'), async (req, res) => {
  const result = validateRecipeInput(req.body, [publicPrefix()]);
  if (!result.ok) {
    res.status(400).json({ error: 'Some fields need attention', fields: result.errors });
    return;
  }
  const v = result.value;
  const me = res.locals.user!;
  const [parent] = v.parentSlug
    ? await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.slug, v.parentSlug)).limit(1)
    : [];

  const slug = await db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, v.title);
    const [row] = await tx
      .insert(recipes)
      .values({
        slug,
        ...recipeColumns(v),
        sourcePersonId: v.sourcePersonName ? await personId(tx, v.sourcePersonName) : null,
        addedByUserId: me.id,
        parentRecipeId: parent?.id ?? null,
      })
      .returning({ id: recipes.id });
    await writeChildren(tx, row.id, v);
    return slug;
  });
  invalidateSearchIndex();
  res.status(201).json({ slug });
});

// PUT /api/recipes/:slug: the slug stays the same even if the title changes, so links keep working.
recipeWriteRouter.put('/recipes/:slug', requireRole('contributor'), async (req, res) => {
  const existing = await loadForEdit(String(req.params.slug));
  if (!existing) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  if (!canEditRecipe(res.locals.user, existing.addedByUserId)) {
    res.status(403).json({ error: 'Only the person who added this recipe (or an editor) can change it' });
    return;
  }
  const result = validateRecipeInput(req.body, [publicPrefix()]);
  if (!result.ok) {
    res.status(400).json({ error: 'Some fields need attention', fields: result.errors });
    return;
  }
  const v = result.value;

  await db.transaction(async (tx) => {
    await tx
      .update(recipes)
      .set({
        ...recipeColumns(v),
        sourcePersonId: v.sourcePersonName ? await personId(tx, v.sourcePersonName) : null,
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, existing.id));
    await writeChildren(tx, existing.id, v);
  });
  if (existing.photoUrl && existing.photoUrl !== v.photoUrl) await deletePhotoIfUnused(existing.photoUrl);
  invalidateSearchIndex();
  res.json({ slug: String(req.params.slug) });
});

// DELETE /api/recipes/:slug
recipeWriteRouter.delete('/recipes/:slug', requireRole('contributor'), async (req, res) => {
  const existing = await loadForEdit(String(req.params.slug));
  if (!existing) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  if (!canEditRecipe(res.locals.user, existing.addedByUserId)) {
    res.status(403).json({ error: 'Only the person who added this recipe (or an editor) can delete it' });
    return;
  }
  // Variations of it stay, just no longer linked.
  await db.update(recipes).set({ parentRecipeId: null }).where(eq(recipes.parentRecipeId, existing.id));
  await db.delete(recipes).where(eq(recipes.id, existing.id));
  await deletePhotoIfUnused(existing.photoUrl);
  invalidateSearchIndex();
  res.json({ ok: true });
});

// POST /api/uploads/photo: body is the image itself (the browser resizes it first).
const uploadsPerUser = createRateLimiter(40, 60 * 60 * 1000);
recipeWriteRouter.post(
  '/uploads/photo',
  requireRole('contributor'),
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: '6mb' }),
  async (req, res) => {
    if (!uploadsPerUser.take(String(res.locals.user!.id))) {
      res.status(429).json({ error: 'Too many uploads for now. Try again in a bit.' });
      return;
    }
    const data = Buffer.isBuffer(req.body) ? req.body : null;
    const kind = data ? sniffImage(data) : null;
    if (!data || !kind) {
      res.status(400).json({ error: 'That file isn’t a JPEG, PNG or WebP image' });
      return;
    }
    const url = await putObject(`recipes/${newToken().slice(0, 22)}.${kind.ext}`, data, kind.contentType);
    res.status(201).json({ url });
  },
);
