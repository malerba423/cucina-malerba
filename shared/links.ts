// Web addresses inside recipe text (steps, descriptions, notes), and the
// "Helpful links" list. Plain text stays plain; only http(s) links and bare
// www. addresses become links.

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

export type TextPart = string | { url: string; label: string };

/** "https://www.youtube.com/watch?v=…" → "YouTube video"; other sites → "seriouseats.com/how-to-make-a-r…" */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, '');
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') return 'YouTube video';
    if (host === 'vimeo.com') return 'Vimeo video';
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    const full = host + path;
    return full.length > 34 ? `${full.slice(0, 33)}…` : full;
  } catch {
    return url;
  }
}

export function isVideo(url: string): boolean {
  return /^(?:https?:\/\/)?(?:www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)\b/i.test(url);
}

/** Splits text into plain pieces and links. Trailing punctuation ("…watch?v=x).") stays text. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[0];
    // Leave sentence punctuation and an unmatched closing bracket outside the link.
    while (/[.,!?;:]$/.test(raw) || (raw.endsWith(')') && (raw.match(/\(/g)?.length ?? 0) < (raw.match(/\)/g)?.length ?? 0))) {
      raw = raw.slice(0, -1);
    }
    const start = m.index!;
    const url = raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw;
    if (start > at) parts.push(text.slice(at, start));
    parts.push({ url, label: linkLabel(url) });
    at = start + raw.length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts.length ? parts : [text];
}
