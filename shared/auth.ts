// Roles and permission rules, shared so the UI hides what the server would refuse.
// The server is the one that enforces them.

export const ROLES = ['contributor', 'editor', 'owner'] as const; // lowest → highest
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Add & edit anything',
  contributor: 'Add & edit own',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** True when `role` is at least `minimum` (owner ⊃ editor ⊃ contributor). */
export function hasRole(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) return false;
  return ROLES.indexOf(role) >= ROLES.indexOf(minimum);
}

/** Owners and editors can edit any recipe; contributors only the ones they added. */
export function canEditRecipe(user: { id: number; role: Role } | null | undefined, addedByUserId: number | null): boolean {
  if (!user) return false;
  if (hasRole(user.role, 'editor')) return true;
  return addedByUserId != null && addedByUserId === user.id;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Deliberately simple: one @, something on each side, a dot in the domain.
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export type Me = { id: number; email: string; name: string; role: Role };
export type MeResponse = { user: Me | null };

export type PeopleAdminResponse = {
  users: { id: number; email: string; name: string; role: Role; createdAt: string; lastSeenAt: string | null; recipeCount: number; isYou: boolean }[];
  invites: { id: number; email: string; name: string; role: Role; createdAt: string; lastSentAt: string }[];
};
