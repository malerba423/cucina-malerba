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
