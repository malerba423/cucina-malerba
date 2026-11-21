import {
  draftFromText,
  emptyDraft,
  parseDurationMinutes,
  parseYield,
  siteNameFromHost,
  socialPlatform,
  splitRecipeText,
  type ImportResult,
  type RecipeDraft,
} from '../../shared/importText.js';
import { LIMITS } from '../../shared/recipeInput.js';

// Reads a fetched page. Most recipe sites publish schema.org "Recipe" data for
// search engines (JSON-LD in a <script> tag), which gives clean ingredients and
// steps. Social posts don't, so for those we read the caption from the page's
// preview tags and split it with the same rules as pasted text.

type Json = unknown;
type Obj = Record<string, Json>;
const isObj = (v: Json): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------- HTML helpers (regex is enough: we only need a few tags) ----------

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔', frac18: '⅛', deg: '°', rsquo: '’',
  lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', times: '×', eacute: 'é', egrave: 'è',
  agrave: 'à', ntilde: 'ñ', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', iuml: 'ï', ecirc: 'ê', reg: '®', copy: '©', trade: '™',
};

export function decodeEntities(s: string): string {
  // Twice, because some sites double-encode ("&amp;frac12;").
  for (let i = 0; i < 2; i++) {
    s = s.replace(/&(#x[\da-f]+|#\d+|[a-z\d]+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
      }
      return NAMED[code.toLowerCase()] ?? whole;
    });
  }
  return s;
}

/** HTML → plain text. Block tags become line breaks when keepLines is set. */
export function htmlToText(s: string, keepLines = false): string {
  let t = s.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
  if (keepLines) t = t.replace(/<br\s*\/?>|<\/(p|li|div|h\d|tr)>/gi, '\n');
  t = decodeEntities(t.replace(/<[^>]+>/g, ' '));
  if (keepLines) {
    return t
      .split('\n')
      .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }
  return t.replace(/\s+/g, ' ').trim();
}

/** <meta property|name="…" content="…"> → map (first one wins). */
export function readMeta(html: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
    }
    const key = (attrs.get('property') ?? attrs.get('name') ?? attrs.get('itemprop'))?.toLowerCase();
    const content = attrs.get('content');
    if (key && content && !meta.has(key)) meta.set(key, decodeEntities(content).trim());
  }
  return meta;
}

function readJsonLd(html: string): Json[] {
  const out: Json[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    try {
      out.push(JSON.parse(body));
    } catch {
      try {
        out.push(JSON.parse(body.replace(/[\u0000-\u001f]+/g, ' '))); // raw newlines inside strings
      } catch {
        // unreadable block: skip it
      }
    }
  }
  return out;
}

const hasType = (o: Obj, type: string) => {
  const t = o['@type'];
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => typeof x === 'string' && x.replace(/^.*[/:]/, '').toLowerCase() === type.toLowerCase());
};

function findRecipe(node: Json, depth = 0): Obj | null {
  if (depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObj(node)) return null;
  if (hasType(node, 'Recipe')) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const found = findRecipe(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

// ---------- recipe data → draft ----------

function text(v: Json): string {
  if (typeof v === 'string') return htmlToText(v);
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.length ? text(v[0]) : '';
  if (isObj(v)) return text(v.name ?? v.text ?? v['@value'] ?? '');
  return '';
}

function absolute(url: string, base: string): string | null {
  try {
    const u = new URL(url, base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

function imageFrom(v: Json, base: string): string | null {
  if (typeof v === 'string') return absolute(decodeEntities(v.trim()), base);
  if (Array.isArray(v)) {
    for (const item of v) {
      const url = imageFrom(item, base);
      if (url) return url;
    }
    return null;
  }
  if (isObj(v)) return imageFrom(v.url ?? v.contentUrl ?? v['@id'] ?? null, base);
  return null;
}

const STEP_NUMBER = /^(?:step\s*)?\d{1,2}\s*[.):]\s*/i;

function stepsFrom(v: Json, depth = 0): string[] {
  if (depth > 5 || v == null) return [];
  if (typeof v === 'string') {
    return htmlToText(v, true)
      .split('\n')
      .map((l) => l.replace(STEP_NUMBER, '').trim())
      .filter(Boolean);
  }
  if (Array.isArray(v)) return v.flatMap((item) => stepsFrom(item, depth + 1));
  if (isObj(v)) {
    if (hasType(v, 'HowToSection') || hasType(v, 'ItemList') || Array.isArray(v.itemListElement)) {
      return stepsFrom(v.itemListElement, depth + 1);
    }
    return stepsFrom(v.text ?? v.name ?? v.description ?? null, depth + 1);
  }
  return [];
}

function listFrom(v: Json): string[] {
  if (typeof v === 'string') return v.split(',').map((s) => htmlToText(s)).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(listFrom);
  return [];
}

function tagsFrom(recipe: Obj): string[] {
  const all = [...listFrom(recipe.recipeCategory), ...listFrom(recipe.recipeCuisine), ...listFrom(recipe.keywords)]
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 2 && t.length <= 30);
  return [...new Set(all)].slice(0, 8);
}

function personName(v: Json): string {
  if (Array.isArray(v)) return v.map(personName).filter(Boolean).join(', ');
  return text(v);
}

function fromRecipeData(recipe: Obj, pageUrl: string, meta: Map<string, string>): RecipeDraft {
  const host = new URL(pageUrl).hostname;
  const y = parseYield(recipe.recipeYield ?? recipe.yield);
  const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : listOrEmpty(recipe.ingredients))
    .map((i) => text(i).replace(/^[▢☐□•\s]+/u, '').trim())
    .filter(Boolean);
  const author = personName(recipe.author);
  const publisher = text(isObj(recipe.publisher) ? recipe.publisher.name : '');
  return {
    ...emptyDraft(),
    title: text(recipe.name) || meta.get('og:title') || '',
    description: clip(text(recipe.description) || meta.get('og:description') || meta.get('description') || '', 600),
    sourceType: 'website',
    sourceName: meta.get('og:site_name') || publisher || siteNameFromHost(host),
    sourceNote: author ? `By ${author}` : '',
    servings: y.servings,
    yieldLabel: y.label,
    prepMinutes: parseDurationMinutes(recipe.prepTime),
    cookMinutes: parseDurationMinutes(recipe.cookTime),
    totalMinutes: parseDurationMinutes(recipe.totalTime),
    imageUrl: imageFrom(recipe.image, pageUrl) ?? imageFrom(meta.get('og:image') ?? null, pageUrl),
    tags: tagsFrom(recipe),
    ingredients,
    steps: stepsFrom(recipe.recipeInstructions),
  };
}

const listOrEmpty = (v: Json): Json[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : []);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Older sites mark up the page itself (microdata) instead of JSON-LD. */
function fromMicrodata(html: string): { ingredients: string[]; steps: string[] } {
  const grab = (prop: string, keepLines: boolean) =>
    [...html.matchAll(new RegExp(String.raw`<(\w+)\b[^>]*itemprop=["'](?:${prop})["'][^>]*>([\s\S]*?)<\/\1>`, 'gi'))].map((m) =>
      htmlToText(m[2], keepLines),
    );
  return {
    ingredients: grab('recipeIngredient|ingredients', false).filter(Boolean),
    steps: grab('recipeInstructions', true)
      .flatMap((s) => s.split('\n'))
      .map((s) => s.replace(STEP_NUMBER, '').trim())
      .filter(Boolean),
  };
}

// ---------- social captions ----------

/** Instagram previews look like `120 likes, 4 comments - handle on May 1, 2024: "caption…"`. */
function captionFrom(meta: Map<string, string>): { caption: string; handle: string | null } {
  const candidates = [meta.get('og:description'), meta.get('description'), meta.get('twitter:description'), meta.get('og:title')].filter(
    (s): s is string => !!s,
  );
  let best = '';
  let handle: string | null = null;
  for (const c of candidates) {
    const quoted = /:\s*["“]([\s\S]+?)["”]\.?\s*$/.exec(c);
    const caption = quoted ? quoted[1] : c;
    if (caption.length > best.length) best = caption;
    const h = /-\s*([\w.]{2,30})\s+on\s+[A-Z][a-z]+ \d/.exec(c) ?? /^([\w.]{2,30}) on (?:Instagram|TikTok)\b/.exec(c);
    if (h && !handle) handle = h[1];
  }
  return { caption: best.replace(/\\n/g, '\n'), handle };
}

function cleanSocialTitle(title: string): string {
  return title
    .replace(/\s+on (Instagram|TikTok|Threads|Facebook)\b[\s\S]*$/i, '')
    .replace(/\s*[|·-]\s*(TikTok|YouTube|Instagram|Facebook|Pinterest|Reddit)\s*$/i, '')
    .trim();
}

// ---------- entry point ----------

/** Turns a fetched page into a draft. `pageUrl` is where the page really came from (after redirects). */
export function extractFromHtml(html: string, pageUrl: string): Omit<ImportResult, 'duplicate'> {
  const meta = readMeta(html);
  const host = new URL(pageUrl).hostname;
  const platform = socialPlatform(host);
  const pageTitle = htmlToText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const ogImage = imageFrom(meta.get('og:image') ?? meta.get('twitter:image') ?? null, pageUrl);
  const notes: string[] = [];

  let recipe: Obj | null = null;
  for (const block of readJsonLd(html)) {
    recipe = findRecipe(block);
    if (recipe) break;
  }

  let draft: RecipeDraft;
  let found: ImportResult['found'];

  if (recipe) {
    draft = fromRecipeData(recipe, pageUrl, meta);
    found = draft.ingredients.length ? 'recipe' : 'little';
    if (!draft.steps.length && draft.ingredients.length) notes.push("The page's recipe data had no steps. Add them below.");
  } else if (platform) {
    const { caption, handle } = captionFrom(meta);
    draft = draftFromText(caption, {
      ...emptyDraft(),
      title: cleanSocialTitle(meta.get('og:title') ?? pageTitle),
      imageUrl: ogImage,
    });
    // The caption's own first line is a better title than "Name on Instagram".
    const split = splitRecipeText(caption);
    if (split.title) draft.title = split.title;
    if (handle) draft.sourceNote = `From @${handle}`;
    found = draft.ingredients.length ? 'text' : 'little';
    if (!draft.ingredients.length) {
      notes.push(
        `${platform} didn't share the full post with us. Open it, copy the caption (or the recipe from the comments), and use Paste text instead.`,
      );
    }
  } else {
    const micro = fromMicrodata(html);
    draft = {
      ...emptyDraft(),
      title: meta.get('og:title') || pageTitle,
      description: clip(meta.get('og:description') || meta.get('description') || '', 600),
      imageUrl: ogImage,
    };
    if (micro.ingredients.length) {
      draft.ingredients = micro.ingredients;
      draft.steps = micro.steps;
      found = 'recipe';
    } else {
      // Last try: the page's visible text, but only if it has clear headings.
      const body = /<(article|main)\b[\s\S]*?<\/\1>/i.exec(html)?.[0] ?? html;
      const split = splitRecipeText(htmlToText(body.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' '), true));
      if (split.usedHeadings && split.ingredients.length >= 2 && split.ingredients.length <= LIMITS.ingredients) {
        draft.ingredients = split.ingredients;
        draft.steps = split.steps.slice(0, LIMITS.steps);
        found = 'text';
        notes.push("This page had no recipe data, so we read its text. Check the ingredients and steps closely.");
      } else {
        found = 'little';
        notes.push("We couldn't find a recipe on that page. Copy the recipe text and use Paste text instead.");
      }
    }
  }

  draft.sourceType = platform ? 'social' : 'website';
  draft.sourceName = platform ?? (draft.sourceName || meta.get('og:site_name') || siteNameFromHost(host));
  draft.title = clip(draft.title.trim(), LIMITS.title);
  draft.ingredients = draft.ingredients.slice(0, LIMITS.ingredients);
  draft.steps = draft.steps.slice(0, LIMITS.steps);
  if (draft.ingredients.length >= LIMITS.ingredients || draft.steps.length >= LIMITS.steps) {
    notes.push('That recipe was very long, so some of it was cut off. Check the end of the lists.');
  }
  return { draft, found, notes };
}
