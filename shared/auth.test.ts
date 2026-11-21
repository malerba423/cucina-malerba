import { describe, expect, it } from 'vitest';
import { canEditRecipe, hasRole, isRole, looksLikeEmail, normalizeEmail } from './auth.js';

describe('roles', () => {
  it('ranks owner above editor above contributor', () => {
    expect(hasRole('owner', 'editor')).toBe(true);
    expect(hasRole('editor', 'editor')).toBe(true);
    expect(hasRole('contributor', 'editor')).toBe(false);
    expect(hasRole(null, 'contributor')).toBe(false);
  });
  it('recognises valid roles only', () => {
    expect(isRole('editor')).toBe(true);
    expect(isRole('admin')).toBe(false);
  });
});

describe('canEditRecipe', () => {
  const mom = { id: 2, role: 'contributor' as const };
  it('lets contributors edit only their own recipes', () => {
    expect(canEditRecipe(mom, 2)).toBe(true);
    expect(canEditRecipe(mom, 3)).toBe(false);
    expect(canEditRecipe(mom, null)).toBe(false);
  });
  it('lets editors and owners edit anything', () => {
    expect(canEditRecipe({ id: 5, role: 'editor' }, 3)).toBe(true);
    expect(canEditRecipe({ id: 1, role: 'owner' }, null)).toBe(true);
  });
  it('lets nobody edit when signed out', () => {
    expect(canEditRecipe(null, 1)).toBe(false);
  });
});

describe('emails', () => {
  it('normalizes and sanity-checks addresses', () => {
    expect(normalizeEmail('  Mom@Example.COM ')).toBe('mom@example.com');
    expect(looksLikeEmail('mom@example.com')).toBe(true);
    expect(looksLikeEmail('mom@example')).toBe(false);
    expect(looksLikeEmail('not an email')).toBe(false);
  });
});
