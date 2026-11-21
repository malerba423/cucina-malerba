import { Router } from 'express';
import { eq, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { recipes } from '../db/schema.js';
import { requireRole } from '../auth/session.js';
import { createRateLimiter } from '../auth/rateLimit.js';
import { extractFromHtml } from '../import/extract.js';
import { decodeHtml, FetchError, safeFetch } from '../import/safeFetch.js';
import { normalizeSourceUrl, parseLink, type ImportResult } from '../../shared/importText.js';

// Import from a link. Family only, like everything that adds recipes.
// Nothing is saved here: the result fills in the recipe form, and the person
// checks it and saves.
export const importRouter = Router();

const HOUR = 60 * 60 * 1000;
const pagesPerUser = createRateLimiter(40, HOUR);
const imagesPerUser = createRateLimiter(60, HOUR);

function friendly(err: unknown): string {
  if (!(err instanceof FetchError)) return "Something went wrong reading that page.";
  if (err.kind === 'status') {
    if (err.status === 404 || err.status === 410) return "That page wasn't found. Check the link.";
    if (err.status === 401 || err.status === 403 || err.status === 429 || err.status === 503) {
      return "That site wouldn't let us read the page (it blocks automatic visits). Copy the recipe and use Paste text instead.";
    }
    return `That site answered with an error (${err.status}). Try again later, or use Paste text.`;
  }
  return err.message;
}

// POST /api/import/url { url }
importRouter.post('/import/url', requireRole('contributor'), async (req, res) => {
  if (!pagesPerUser.take(String(res.locals.user!.id))) {
    res.status(429).json({ error: 'Too many imports for now. Try again in a bit.' });
    return;
  }
  const raw = typeof req.body?.url === 'string' ? req.body.url : '';
  const link = parseLink(raw);
  if (!link) {
    res.status(400).json({ error: 'Paste a full web link', fields: { url: 'Paste a full web link, like https://…' } });
    return;
  }

  let html: string;
  let pageUrl: string;
  try {
    const page = await safeFetch(link, {
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      maxBytes: 3 * 1024 * 1024,
      truncate: true,
    });
    if (page.contentType && !/html|xml/.test(page.contentType)) {
      res.status(422).json({ error: "That link isn't a web page (it's a file). Open it and use Paste text instead." });
      return;
    }
    html = decodeHtml(page);
    pageUrl = page.url;
  } catch (err) {
    res.status(422).json({ error: friendly(err) });
    return;
  }

  const result = extractFromHtml(html, pageUrl);
  // Keep the link they pasted (minus tracking bits), not where it redirected:
  // social sites often redirect automatic visits to a login page.
  result.draft.sourceUrl = normalizeSourceUrl(link);

  const [dupe] = await db
    .select({ slug: recipes.slug, title: recipes.title })
    .from(recipes)
    .where(or(eq(recipes.sourceUrl, result.draft.sourceUrl), eq(recipes.sourceUrl, link.href)))
    .limit(1);

  const body: ImportResult = { ...result, duplicate: dupe ?? null };
  res.json(body);
});

// GET /api/import/image?url=… : the page's photo, passed through so the browser
// can resize it and upload it like any other photo (other sites don't allow
// cross-site reads). Family only, so this can't be used as an open proxy.
const IMAGE_TYPES: [string, (b: Buffer) => boolean][] = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/webp', (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
  ['image/gif', (b) => b.subarray(0, 4).toString('latin1') === 'GIF8'],
  ['image/avif', (b) => b.subarray(4, 12).toString('latin1') === 'ftypavif'],
];

importRouter.get('/import/image', requireRole('contributor'), async (req, res) => {
  if (!imagesPerUser.take(String(res.locals.user!.id))) {
    res.status(429).json({ error: 'Too many photos for now. Try again in a bit.' });
    return;
  }
  const link = parseLink(typeof req.query.url === 'string' ? req.query.url : '');
  if (!link) {
    res.status(400).json({ error: 'Missing photo link' });
    return;
  }
  try {
    const img = await safeFetch(link, { accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', maxBytes: 15 * 1024 * 1024 });
    const type = IMAGE_TYPES.find(([, test]) => test(img.body))?.[0];
    if (!type) {
      res.status(415).json({ error: "The page's photo isn't a kind we can use. Add your own instead." });
      return;
    }
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(img.body);
  } catch (err) {
    res.status(422).json({ error: err instanceof FetchError && err.kind === 'too-big' ? "The page's photo is too big." : "Couldn't get the page's photo." });
  }
});
