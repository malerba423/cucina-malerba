// Firebase Hosting forwards only a cookie named "__session" to Cloud Run and
// drops every other cookie, so the session must use exactly this name.
export const SESSION_COOKIE = '__session';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie('', 0, secure);
}
