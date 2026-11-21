import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { invites, loginTokens, people, users } from '../db/schema.js';
import { env } from '../env.js';
import { linkEmail, sendEmail } from '../email.js';
import { SITE_NAME } from '../../shared/site.js';
import type { Me, Role } from '../../shared/auth.js';
import { hashToken, newToken } from './crypto.js';

const MINUTE = 60 * 1000;
export const LOGIN_LINK_MINUTES = 15;
export const INVITE_LINK_DAYS = 7;

async function ownerExists(): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(users).where(and(eq(users.role, 'owner'), isNull(users.removedAt)));
  return n > 0;
}

/** Who may receive a sign-in link: active users, invited people, and the configured owner before any owner exists. */
export async function mayRequestLink(email: string): Promise<boolean> {
  const [user] = await db.select({ removedAt: users.removedAt }).from(users).where(eq(users.email, email)).limit(1);
  if (user && !user.removedAt) return true;
  const [invite] = await db.select({ id: invites.id }).from(invites).where(eq(invites.email, email)).limit(1);
  if (invite) return true;
  return env.ownerEmail === email && !(await ownerExists());
}

async function createLinkToken(email: string, lifetimeMs: number): Promise<string> {
  const token = newToken();
  await db.insert(loginTokens).values({ email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + lifetimeMs) });
  // Tidy up old links now and then.
  await db.delete(loginTokens).where(sql`${loginTokens.expiresAt} < now() - interval '1 day'`);
  return token;
}

function verifyUrl(token: string): string {
  return `${env.appUrl}/auth/verify#token=${encodeURIComponent(token)}`;
}

export async function sendSignInLink(email: string): Promise<void> {
  const token = await createLinkToken(email, LOGIN_LINK_MINUTES * MINUTE);
  const { html, text } = linkEmail({
    heading: `Sign in to ${SITE_NAME}`,
    intro: `Use this button to sign in. It works once and expires in ${LOGIN_LINK_MINUTES} minutes.`,
    button: 'Sign in',
    url: verifyUrl(token),
    footer: "If you didn't ask to sign in, you can ignore this email.",
  });
  await sendEmail({ to: email, subject: `Your ${SITE_NAME} sign-in link`, html, text });
}

export async function sendInvite(invite: { email: string; name: string }, inviterName: string): Promise<void> {
  const token = await createLinkToken(invite.email, INVITE_LINK_DAYS * 24 * 60 * MINUTE);
  const { html, text } = linkEmail({
    heading: `${inviterName} invited you to ${SITE_NAME}`,
    intro: `Hi ${invite.name}, you can now add family recipes to ${SITE_NAME}. This button signs you in; it works once within ${INVITE_LINK_DAYS} days. After that, sign in any time from the site with your email.`,
    button: 'Accept and sign in',
    url: verifyUrl(token),
    footer: "If this doesn't look familiar, you can ignore this email.",
  });
  await sendEmail({ to: invite.email, subject: `${inviterName} invited you to ${SITE_NAME}`, html, text });
}

/** Links a user to a person row by name (so "Mom" the user and "Mom" the recipe source are the same). */
async function personFor(name: string): Promise<number> {
  const [row] = await db
    .insert(people)
    .values({ name })
    .onConflictDoUpdate({ target: people.name, set: { name: sql`excluded.name` } })
    .returning({ id: people.id });
  return row.id;
}

async function createUser(email: string, name: string, role: Role): Promise<Me> {
  const personId = await personFor(name);
  const [user] = await db
    .insert(users)
    .values({ email, name, role, personId })
    .onConflictDoUpdate({ target: users.email, set: { name, role, personId, removedAt: null } })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
  return user;
}

/**
 * Consumes a one-time link token and returns who it signs in, creating the
 * account from an invite (or the OWNER_EMAIL bootstrap) on first use.
 * Returns null when the link is unknown, used, expired, or its person was removed.
 */
export async function redeemLinkToken(token: string): Promise<Me | null> {
  const [link] = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(loginTokens.tokenHash, hashToken(token)), isNull(loginTokens.usedAt), sql`${loginTokens.expiresAt} > now()`))
    .returning({ email: loginTokens.email });
  if (!link) return null;
  const email = link.email;

  const [invite] = await db.select().from(invites).where(eq(invites.email, email)).limit(1);
  if (invite) {
    const user = await createUser(email, invite.name, invite.role);
    await db.delete(invites).where(eq(invites.id, invite.id));
    return user;
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, removedAt: users.removedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (user && !user.removedAt) return { id: user.id, email: user.email, name: user.name, role: user.role };

  if (!user && env.ownerEmail === email && !(await ownerExists())) {
    const local = email.split('@')[0];
    return createUser(email, local.charAt(0).toUpperCase() + local.slice(1), 'owner');
  }
  return null;
}
