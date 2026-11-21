import { Router, type Response } from 'express';
import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { collectionRecipes, collections, cookLogs, people, recipeNotes, recipes, users } from '../db/schema.js';
import { requireRole } from '../auth/session.js';
import { invalidateSearchIndex, getSearchIndex } from '../searchIndex.js';
import { hasRole } from '../../shared/auth.js';
import { slugify } from '../../shared/parse.js';
import type { CollectionDetail, CollectionListResponse, CollectionSummary } from '../../shared/types.js';
import { toCard } from './recipes.js';

// Milestone 9: "made it" logs, family notes, and collections. Reading is
// public (it shows on recipe and collection pages); writing is family only.
export const familyRouter = Router();

function bad(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

const idParam = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function recipeId(slug: unknown): Promise<number | null> {
  if (typeof slug !== 'string') return null;
  const [row] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.slug, slug)).limit(1);
  return row?.id ?? null;
}

/** May this user change something they (or someone else) wrote? Your own, or anything if you're an editor. */
const mayChange = (me: { id: number; role: 'owner' | 'editor' | 'contributor' }, authorId: number | null) =>
  hasRole(me.role, 'editor') || (authorId != null && authorId === me.id);

// ---------- made it ----------

/** The people row a signed-in user cooks as (made on first use, by name). */
async function personFor(userId: number): Promise<number | null> {
  const [u] = await db.select({ personId: users.personId, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
  if (u.personId) return u.personId;
  const [p] = await db
    .insert(people)
    .values({ name: u.name })
    .onConflictDoUpdate({ target: people.name, set: { name: sql`excluded.name` } })
    .returning({ id: people.id });
  await db.update(users).set({ personId: p.id }).where(eq(users.id, userId));
  return p.id;
}

// POST /api/recipes/:slug/made { cookedOn: "2026-11-21", rating?: 1–5, note? }
familyRouter.post('/recipes/:slug/made', requireRole('contributor'), async (req, res) => {
  const id = await recipeId(req.params.slug);
  if (!id) return bad(res, 404, 'Recipe not found');
  const cookedOn = typeof req.body?.cookedOn === 'string' ? req.body.cookedOn : '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(cookedOn) ? new Date(`${cookedOn}T12:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime()) || day.getTime() > Date.now() + 2 * 86_400_000 || day.getUTCFullYear() < 1950) {
    return bad(res, 400, 'Pick the day you made it');
  }
  const rating = req.body?.rating == null || req.body.rating === '' ? null : Number(req.body.rating);
  if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return bad(res, 400, 'Ratings go from 1 to 5 stars');
  const me = res.locals.user!;
  await db.insert(cookLogs).values({
    recipeId: id,
    personId: await personFor(me.id),
    userId: me.id,
    cookedOn,
    rating,
    note: clean(req.body?.note, 1000) || null,
  });
  invalidateSearchIndex();
  res.status(201).json({ ok: true });
});

// DELETE /api/made/:id
familyRouter.delete('/made/:id', requireRole('contributor'), async (req, res) => {
  const id = idParam(req.params.id);
  const [log] = id ? await db.select({ userId: cookLogs.userId }).from(cookLogs).where(eq(cookLogs.id, id)).limit(1) : [];
  if (!log) return bad(res, 404, 'Not found');
  if (!mayChange(res.locals.user!, log.userId)) return bad(res, 403, 'Only the person who logged it (or an editor) can remove it');
  await db.delete(cookLogs).where(eq(cookLogs.id, id!));
  invalidateSearchIndex();
  res.json({ ok: true });
});

// ---------- notes ----------

// POST /api/recipes/:slug/notes { text }
familyRouter.post('/recipes/:slug/notes', requireRole('contributor'), async (req, res) => {
  const id = await recipeId(req.params.slug);
  if (!id) return bad(res, 404, 'Recipe not found');
  const text = clean(req.body?.text, 2000);
  if (!text) return bad(res, 400, 'Write a note first');
  await db.insert(recipeNotes).values({ recipeId: id, userId: res.locals.user!.id, text });
  res.status(201).json({ ok: true });
});

// PUT /api/notes/:id { text }
familyRouter.put('/notes/:id', requireRole('contributor'), async (req, res) => {
  const id = idParam(req.params.id);
  const [note] = id ? await db.select({ userId: recipeNotes.userId }).from(recipeNotes).where(eq(recipeNotes.id, id)).limit(1) : [];
  if (!note) return bad(res, 404, 'Note not found');
  if (!mayChange(res.locals.user!, note.userId)) return bad(res, 403, 'Only the person who wrote it (or an editor) can change it');
  const text = clean(req.body?.text, 2000);
  if (!text) return bad(res, 400, "A note can't be empty");
  await db.update(recipeNotes).set({ text, updatedAt: new Date() }).where(eq(recipeNotes.id, id!));
  res.json({ ok: true });
});

// DELETE /api/notes/:id
familyRouter.delete('/notes/:id', requireRole('contributor'), async (req, res) => {
  const id = idParam(req.params.id);
  const [note] = id ? await db.select({ userId: recipeNotes.userId }).from(recipeNotes).where(eq(recipeNotes.id, id)).limit(1) : [];
  if (!note) return bad(res, 404, 'Note not found');
  if (!mayChange(res.locals.user!, note.userId)) return bad(res, 403, 'Only the person who wrote it (or an editor) can remove it');
  await db.delete(recipeNotes).where(eq(recipeNotes.id, id!));
  res.json({ ok: true });
});

// ---------- collections ----------

async function summaries(where?: ReturnType<typeof eq>): Promise<(CollectionSummary & { id: number })[]> {
  const rows = await db
    .select({
      id: collections.id,
      slug: collections.slug,
      name: collections.name,
      description: collections.description,
      creatorId: users.id,
      creatorName: users.name,
      recipeCount: sql<number>`(select count(*)::int from ${collectionRecipes} where ${collectionRecipes.collectionId} = ${collections.id})`,
    })
    .from(collections)
    .leftJoin(users, eq(collections.createdByUserId, users.id))
    .where(where)
    .orderBy(asc(collections.name));
  if (!rows.length) return [];
  const photoRows = await db
    .select({ collectionId: collectionRecipes.collectionId, photoUrl: recipes.photoUrl })
    .from(collectionRecipes)
    .innerJoin(recipes, eq(collectionRecipes.recipeId, recipes.id))
    .where(and(inArray(collectionRecipes.collectionId, rows.map((r) => r.id)), sql`${recipes.photoUrl} is not null`))
    .orderBy(desc(collectionRecipes.addedAt));
  const photos = new Map<number, string[]>();
  for (const p of photoRows) {
    const list = photos.get(p.collectionId) ?? [];
    if (list.length < 4 && p.photoUrl) list.push(p.photoUrl);
    photos.set(p.collectionId, list);
  }
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    recipeCount: r.recipeCount,
    photos: photos.get(r.id) ?? [],
    createdBy: r.creatorId ? { id: r.creatorId, name: r.creatorName! } : null,
  }));
}

const publicSummary = ({ id: _id, ...rest }: CollectionSummary & { id: number }): CollectionSummary => rest;

async function loadCollection(slug: unknown) {
  if (typeof slug !== 'string') return null;
  const [row] = await db.select().from(collections).where(eq(collections.slug, slug)).limit(1);
  return row ?? null;
}

// GET /api/collections
familyRouter.get('/collections', async (_req, res) => {
  const body: CollectionListResponse = { collections: (await summaries()).map(publicSummary) };
  res.json(body);
});

// GET /api/collections/:slug
familyRouter.get('/collections/:slug', async (req, res) => {
  const c = await loadCollection(req.params.slug);
  if (!c) return bad(res, 404, 'Collection not found');
  const [summary] = await summaries(eq(collections.id, c.id));
  const members = await db
    .select({ recipeId: collectionRecipes.recipeId })
    .from(collectionRecipes)
    .where(eq(collectionRecipes.collectionId, c.id))
    .orderBy(desc(collectionRecipes.addedAt));
  const { docs } = await getSearchIndex();
  const byId = new Map(docs.map((d) => [d.id, d]));
  const body: CollectionDetail = {
    ...publicSummary(summary),
    recipes: members.map((m) => byId.get(m.recipeId)).filter((d) => d != null).map(toCard),
  };
  res.json(body);
});

async function uniqueCollectionSlug(name: string): Promise<string> {
  const base = slugify(name) || 'collection';
  const taken = new Set((await db.select({ slug: collections.slug }).from(collections).where(like(collections.slug, `${base}%`))).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

// POST /api/collections { name, description?, recipeSlug? }
familyRouter.post('/collections', requireRole('contributor'), async (req, res) => {
  const name = clean(req.body?.name, 80);
  if (!name) return bad(res, 400, 'Give the collection a name');
  const [dupe] = await db.select({ slug: collections.slug }).from(collections).where(sql`lower(${collections.name}) = lower(${name})`).limit(1);
  if (dupe) return bad(res, 409, 'There is already a collection with that name');
  const me = res.locals.user!;
  const [c] = await db
    .insert(collections)
    .values({ slug: await uniqueCollectionSlug(name), name, description: clean(req.body?.description, 500) || null, createdByUserId: me.id })
    .returning({ id: collections.id, slug: collections.slug });
  const rid = await recipeId(req.body?.recipeSlug);
  if (rid) await db.insert(collectionRecipes).values({ collectionId: c.id, recipeId: rid, addedByUserId: me.id }).onConflictDoNothing();
  res.status(201).json({ slug: c.slug });
});

// PATCH /api/collections/:slug { name?, description? } (the person who made it, or an editor)
familyRouter.patch('/collections/:slug', requireRole('contributor'), async (req, res) => {
  const c = await loadCollection(req.params.slug);
  if (!c) return bad(res, 404, 'Collection not found');
  if (!mayChange(res.locals.user!, c.createdByUserId)) return bad(res, 403, 'Only the person who made it (or an editor) can change it');
  const changes: { name?: string; description?: string | null } = {};
  if (req.body?.name !== undefined) {
    const name = clean(req.body.name, 80);
    if (!name) return bad(res, 400, "Name can't be empty");
    changes.name = name;
  }
  if (req.body?.description !== undefined) changes.description = clean(req.body.description, 500) || null;
  if (Object.keys(changes).length) await db.update(collections).set(changes).where(eq(collections.id, c.id));
  res.json({ ok: true });
});

// DELETE /api/collections/:slug (the recipes stay)
familyRouter.delete('/collections/:slug', requireRole('contributor'), async (req, res) => {
  const c = await loadCollection(req.params.slug);
  if (!c) return bad(res, 404, 'Collection not found');
  if (!mayChange(res.locals.user!, c.createdByUserId)) return bad(res, 403, 'Only the person who made it (or an editor) can delete it');
  await db.delete(collections).where(eq(collections.id, c.id));
  res.json({ ok: true });
});

// PUT / DELETE /api/collections/:slug/recipes/:recipeSlug: any family member can add or take out recipes.
familyRouter.put('/collections/:slug/recipes/:recipeSlug', requireRole('contributor'), async (req, res) => {
  const c = await loadCollection(req.params.slug);
  const rid = await recipeId(req.params.recipeSlug);
  if (!c || !rid) return bad(res, 404, 'Not found');
  await db.insert(collectionRecipes).values({ collectionId: c.id, recipeId: rid, addedByUserId: res.locals.user!.id }).onConflictDoNothing();
  res.json({ ok: true });
});

familyRouter.delete('/collections/:slug/recipes/:recipeSlug', requireRole('contributor'), async (req, res) => {
  const c = await loadCollection(req.params.slug);
  const rid = await recipeId(req.params.recipeSlug);
  if (!c || !rid) return bad(res, 404, 'Not found');
  await db.delete(collectionRecipes).where(and(eq(collectionRecipes.collectionId, c.id), eq(collectionRecipes.recipeId, rid)));
  res.json({ ok: true });
});
