import { createHash, randomBytes } from 'node:crypto';

/** A URL-safe random token: 32 bytes = 256 bits. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database stores instead of the token itself. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
