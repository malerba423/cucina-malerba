import { Router, type Response } from 'express';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { invites, recipeIngredients, recipes, recipeSteps, sessions, users } from '../db/schema.js';
import { detectTimer, parseIngredientLine } from '../../shared/parse.js';
import { invalidateSearchIndex } from '../searchIndex.js';
import { isRole, looksLikeEmail, normalizeEmail, type PeopleAdminResponse } from '../../shared/auth.js';
import { sendInvite } from '../auth/accounts.js';
import { requireRole } from '../auth/session.js';

// Everything here is owner-only: the "Who can add recipes" screen.
export const adminRouter = Router();
adminRouter.use('/admin', requireRole('owner'));

function idParam(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function bad(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

async function otherActiveOwners(excludingUserId: number): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, 'owner'), isNull(users.removedAt), ne(users.id, excludingUserId)));
  return n;
}

// GET /api/admin/people
adminRouter.get('/admin/people', async (_req, res) => {
  const me = res.locals.user!;
  const [userRows, inviteRows] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
        lastSeenAt: users.lastSeenAt,
        recipeCount: count(recipes.id),
      })
      .from(users)
      .leftJoin(recipes, eq(recipes.addedByUserId, users.id))
      .where(isNull(users.removedAt))
      .groupBy(users.id)
      .orderBy(asc(users.createdAt)),
    db.select().from(invites).orderBy(asc(invites.createdAt)),
  ]);

  const body: PeopleAdminResponse = {
    users: userRows.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      isYou: u.id === me.id,
    })),
    invites: inviteRows.map((i) => ({
      id: i.id,
      email: i.email,
      name: i.name,
      role: i.role,
      createdAt: i.createdAt.toISOString(),
      lastSentAt: i.lastSentAt?.toISOString() ?? null,
    })),
  };
  res.json(body);
});

// POST /api/admin/invites { email, name, role }
// Adds someone who may sign in. No email goes out here: the owner sends the
// invite from their row when ready (they can also just go to /signin).
adminRouter.post('/admin/invites', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
  const role = req.body?.role;
  if (!looksLikeEmail(email)) return bad(res, 400, "That doesn't look like an email address");
  if (!name) return bad(res, 400, 'Add a name, the way the family would say it ("Mom", "Sam")');
  if (!isRole(role)) return bad(res, 400, 'Pick what they can do');

  const [existing] = await db.select({ removedAt: users.removedAt }).from(users).where(eq(users.email, email)).limit(1);
  if (existing && !existing.removedAt) return bad(res, 409, 'That person can already sign in');

  const [invite] = await db
    .insert(invites)
    .values({ email, name, role, invitedByUserId: res.locals.user!.id, lastSentAt: null })
    .onConflictDoUpdate({ target: invites.email, set: { name, role } })
    .returning({ id: invites.id });

  res.status(201).json({ ok: true, id: invite.id });
});

// POST /api/admin/invites/:id/send: emails (or re-emails) the invite.
adminRouter.post(['/admin/invites/:id/send', '/admin/invites/:id/resend'], async (req, res) => {
  const id = idParam(String(req.params.id));
  const [invite] = id ? await db.select().from(invites).where(eq(invites.id, id)).limit(1) : [];
  if (!invite) return bad(res, 404, 'Invite not found');
  try {
    await sendInvite(invite, res.locals.user!.name);
  } catch (err) {
    console.error('invite email failed', err);
    return bad(res, 502, 'The email could not be sent. Try again in a minute.');
  }
  await db.update(invites).set({ lastSentAt: new Date() }).where(eq(invites.id, invite.id));
  res.json({ ok: true });
});

// DELETE /api/admin/invites/:id
adminRouter.delete('/admin/invites/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return bad(res, 404, 'Invite not found');
  await db.delete(invites).where(eq(invites.id, id));
  res.json({ ok: true });
});

// PATCH /api/admin/users/:id { role?, name? }
adminRouter.patch('/admin/users/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const [user] = id ? await db.select().from(users).where(and(eq(users.id, id), isNull(users.removedAt))).limit(1) : [];
  if (!user) return bad(res, 404, 'Person not found');

  const changes: { role?: 'owner' | 'editor' | 'contributor'; name?: string } = {};
  if (req.body?.role !== undefined) {
    if (!isRole(req.body.role)) return bad(res, 400, 'Unknown role');
    if (user.role === 'owner' && req.body.role !== 'owner' && (await otherActiveOwners(user.id)) === 0) {
      return bad(res, 409, 'There must always be at least one owner');
    }
    changes.role = req.body.role;
  }
  if (req.body?.name !== undefined) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
    if (!name) return bad(res, 400, "Name can't be empty");
    changes.name = name;
  }
  if (Object.keys(changes).length) await db.update(users).set(changes).where(eq(users.id, user.id));
  res.json({ ok: true });
});

// DELETE /api/admin/users/:id: removes sign-in access; their recipes stay credited to them.
adminRouter.delete('/admin/users/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return bad(res, 404, 'Person not found');
  if (id === res.locals.user!.id) return bad(res, 409, "You can't remove yourself");
  const [user] = await db.select().from(users).where(and(eq(users.id, id), isNull(users.removedAt))).limit(1);
  if (!user) return bad(res, 404, 'Person not found');
  if (user.role === 'owner' && (await otherActiveOwners(user.id)) === 0) return bad(res, 409, 'There must always be at least one owner');

  await db.update(users).set({ removedAt: new Date() }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  res.json({ ok: true });
});

// POST /api/admin/reparse: reads every saved ingredient and step again with the
// current rules (parser fixes only reach recipes saved after them otherwise).
// The text people typed never changes; only how it's read. Exact gram weights stay.
adminRouter.post('/admin/reparse', async (_req, res) => {
  const [ingredientRows, stepRows] = await Promise.all([
    db
      .select({
        id: recipeIngredients.id,
        rawText: recipeIngredients.rawText,
        quantity: recipeIngredients.quantity,
        quantityMax: recipeIngredients.quantityMax,
        unit: recipeIngredients.unit,
        item: recipeIngredients.item,
        note: recipeIngredients.note,
      })
      .from(recipeIngredients),
    db.select({ id: recipeSteps.id, text: recipeSteps.text, timerSeconds: recipeSteps.timerSeconds }).from(recipeSteps),
  ]);

  let ingredientsChanged = 0;
  let stepsChanged = 0;
  await db.transaction(async (tx) => {
    for (const row of ingredientRows) {
      const p = parseIngredientLine(row.rawText);
      const next = { quantity: p.quantity, quantityMax: p.quantityMax, unit: p.unit, item: p.item, note: p.note };
      if (next.quantity === row.quantity && next.quantityMax === row.quantityMax && next.unit === row.unit && next.item === row.item && next.note === row.note) continue;
      await tx.update(recipeIngredients).set(next).where(eq(recipeIngredients.id, row.id));
      ingredientsChanged++;
    }
    for (const row of stepRows) {
      const timer = detectTimer(row.text);
      if (timer === row.timerSeconds) continue;
      await tx.update(recipeSteps).set({ timerSeconds: timer }).where(eq(recipeSteps.id, row.id));
      stepsChanged++;
    }
  });
  invalidateSearchIndex();
  res.json({ ingredients: ingredientRows.length, ingredientsChanged, steps: stepRows.length, stepsChanged });
});
