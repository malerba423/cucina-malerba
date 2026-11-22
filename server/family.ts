import { db } from './db/client.js';
import { invites, users } from './db/schema.js';

// "Family" is everyone on The family page: people with an account and people
// who've been invited (whether or not the invite has been sent). Anyone else
// (a friend, a chef) can still be credited on a recipe, but isn't family.
export async function familyMembers(): Promise<{ names: string[]; nameKeys: Set<string>; personIds: Set<number> }> {
  const [accounts, invited] = await Promise.all([
    db.select({ name: users.name, personId: users.personId }).from(users),
    db.select({ name: invites.name }).from(invites),
  ]);
  const byKey = new Map<string, string>(); // case-insensitive, first spelling wins
  for (const { name } of [...accounts, ...invited]) {
    const key = name.trim().toLowerCase();
    if (key && !byKey.has(key)) byKey.set(key, name.trim());
  }
  return {
    names: [...byKey.values()].sort((a, b) => a.localeCompare(b)),
    nameKeys: new Set(byKey.keys()),
    personIds: new Set(accounts.map((a) => a.personId).filter((id): id is number => id != null)),
  };
}
