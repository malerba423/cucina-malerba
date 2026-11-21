import { parseIngredientLine } from './parse.js';
import type { SourceType } from './types.js';

// Shared by the import page (pasted text) and the server (social captions and
// pages without recipe data). Everything here is plain rule-based reading: no
// AI, no network.

/** What an import hands to the recipe form. Lists are one entry per line. */
export type RecipeDraft = {
  title: string;
  description: string;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl: string;
  sourceNote: string;
  servings: number | null;
  yieldLabel: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  /** A photo on the other site. It's copied into the box only when the recipe is saved. */
  imageUrl: string | null;
  tags: string[];
  /** Group headers end in ":", like the form's ingredient box. */
  ingredients: string[];
  steps: string[];
};

export type ImportResult = {
  draft: RecipeDraft;
  /** recipe: the page had real recipe data; text: we read it from a caption or page text; little: only a title and photo. */
  found: 'recipe' | 'text' | 'little';
  notes: string[];
  duplicate: { slug: string; title: string } | null;
};

export function emptyDraft(): RecipeDraft {
  return {
    title: '',
    description: '',
    sourceType: 'other',
    sourceName: '',
    sourceUrl: '',
    sourceNote: '',
    servings: null,
    yieldLabel: null,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    imageUrl: null,
    tags: [],
    ingredients: [],
    steps: [],
  };
}

// ---------- links ----------

const SOCIAL: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(facebook\.com|fb\.watch)$/, 'Facebook'],
  [/(^|\.)pinterest\.[a-z.]+$|(^|\.)pin\.it$/, 'Pinterest'],
  [/(^|\.)(twitter\.com|x\.com)$/, 'X'],
  [/(^|\.)threads\.(net|com)$/, 'Threads'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
];

/** "Instagram" for instagram.com links, null for ordinary websites. */
export function socialPlatform(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  for (const [re, name] of SOCIAL) if (re.test(host)) return name;
  return null;
}

const TRACKING = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|igsh|igshid|si|_r|ref_src|share_id)$/i;

/** Adds https:// when missing; returns null for anything that isn't an http(s) link. */
export function parseLink(raw: string): URL | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(t) ? t : `https://${t}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url;
  } catch {
    return null;
  }
}

/** Drops tracking parameters and the #fragment, so the same recipe link compares equal. */
export function normalizeSourceUrl(url: URL): string {
  const u = new URL(url.href);
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  u.hostname = u.hostname.toLowerCase();
  return u.href;
}

export function siteNameFromHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

// ---------- times and yields ----------

/** "PT1H30M" (recipe data) or "1 hr 30 mins" → 90. Null when there's no time in it. */
export function parseDurationMinutes(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  const iso = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(s);
  if (iso) {
    const [, d, h, m, sec] = iso.map((x) => (x ? Number(x) : 0));
    const total = Math.round(d * 1440 + h * 60 + m + sec / 60);
    return total > 0 ? total : null;
  }
  let total = 0;
  let found = false;
  for (const match of s.matchAll(/(\d+(?:\.\d+)?)\s*(days?|hours?|hrs?|h\b|minutes?|mins?|m\b)/gi)) {
    found = true;
    const n = Number(match[1]);
    const unit = match[2].toLowerCase();
    total += unit.startsWith('d') ? n * 1440 : unit.startsWith('h') ? n * 60 : n;
  }
  return found && total > 0 ? Math.round(total) : null;
}

/** "Makes 24 cookies" → { 24, "cookies" }, "4-6 servings" → { 4, "servings" }, 8 → { 8, "servings" }. */
export function parseYield(value: unknown): { servings: number | null; label: string | null } {
  const candidates = (Array.isArray(value) ? value : [value]).filter((v) => typeof v === 'string' || typeof v === 'number');
  // Prefer an entry that says what the number counts ("8 servings" over "8").
  const sorted = [...candidates].sort((a, b) => Number(/[a-z]/i.test(String(b))) - Number(/[a-z]/i.test(String(a))));
  for (const v of sorted) {
    if (typeof v === 'number') return v > 0 ? { servings: v, label: 'servings' } : { servings: null, label: null };
    const m = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*([a-z][a-z\s-]{0,30})?/i.exec(v);
    if (!m) continue;
    const label = (m[2] ?? '')
      .trim()
      .replace(/^(people|persons?|portions?)$/i, 'servings')
      .replace(/\s+/g, ' ');
    return { servings: Number(m[1]), label: label || 'servings' };
  }
  return { servings: null, label: null };
}

// ---------- free text ----------

const PICTO = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;
const BULLET = /^[\s•·▪▫◦‣⁃●○■□▢✓✔☐✅➡→>*–—-]+/u;
const STEP_NUMBER = /^(?:step\s*)?\d{1,2}\s*[.):-]\s*|^step\s*\d{1,2}\s*/i;

const ING_HEADING = /^(ingredients?|ingredient list|what you(?:'|’)?ll need|you(?:'|’)?ll need|you will need|shopping list)$/i;
const STEP_HEADING = /^(instructions?|directions?|method|steps|preparation|prep|how to make( it| them)?|how to|to make)$/i;
const NOTE_HEADING = /^(notes?|tips?|recipe notes?|chef(?:'|’)?s notes?)$/i;

type Kind = 'ingredients' | 'steps' | 'notes';

function headingKind(line: string): Kind | null {
  const t = line
    .replace(PICTO, '')
    .replace(/[:.!\s]+$/, '')
    .replace(/^[#*\s]+/, '')
    .trim();
  if (t.length > 40) return null;
  if (ING_HEADING.test(t)) return 'ingredients';
  if (STEP_HEADING.test(t)) return 'steps';
  if (NOTE_HEADING.test(t)) return 'notes';
  return null;
}

function cleanLine(line: string): string {
  return line.replace(BULLET, '').replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u, '').trim();
}

/** "TO SERVE", "Broth:" or "For the sauce" inside an ingredient list → a group header ("To serve:"). */
function asGroupHeader(line: string): string | null {
  const t = line.replace(PICTO, '').trim();
  if (t.length > 32 || /\d/.test(t) || parseIngredientLine(t).quantity != null) return null;
  const bare = t.replace(/:$/, '').trim();
  const letters = bare.replace(/[^\p{L}]/gu, '');
  const allCaps = letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  if (allCaps || /^for (the |a |an )?\p{L}/iu.test(bare) || t.endsWith(':')) return `${sentenceCase(bare)}:`;
  return null;
}

/** "FIRECRACKER RAMEN" → "Firecracker Ramen"; mixed-case text is left alone. */
function titleCase(s: string): string {
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (letters.length < 3 || letters !== letters.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, pre: string, ch: string) => pre + ch.toUpperCase());
}

function sentenceCase(s: string): string {
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (letters !== letters.toUpperCase()) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const isHashtagLine = (line: string) => /^([#@][\p{L}\p{N}_.]+[\s,]*)+$/u.test(line.trim());
const looksIngredient = (line: string) => line.length <= 90 && parseIngredientLine(line).quantity != null && !/\.\s*$/.test(line);
const isNumberedStep = (line: string) => STEP_NUMBER.test(line) && line.replace(STEP_NUMBER, '').length > 12;

export type SplitText = {
  title: string | null;
  description: string | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
  servings: number | null;
  yieldLabel: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  /** True when the text had "Ingredients" / "Instructions" headings; the split is much more reliable then. */
  usedHeadings: boolean;
};

/** Splits a caption or pasted recipe into a title, ingredients and steps. */
export function splitRecipeText(text: string): SplitText {
  const tags = [...new Set([...text.matchAll(/#([\p{L}][\p{L}\p{N}_]{1,29})/gu)].map((m) => m[1].toLowerCase()))].slice(0, 8);
  const rawLines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !isHashtagLine(l))
    .map((l) => l.replace(/(\s+#[\p{L}\p{N}_]+)+\s*$/u, '').trim())
    .filter(Boolean);

  const yieldInfo = findYield(text);
  const times = {
    prepMinutes: findTime(text, 'prep'),
    cookMinutes: findTime(text, 'cook|bake'),
    totalMinutes: findTime(text, 'total|ready in'),
  };

  const intro: string[] = [];
  const ingredients: string[] = [];
  const steps: string[] = [];
  const notes: string[] = [];
  const usedHeadings = rawLines.some((l) => headingKind(l) === 'ingredients') && rawLines.some((l) => headingKind(l) === 'steps');

  if (usedHeadings) {
    let section: Kind | 'intro' = 'intro';
    for (const raw of rawLines) {
      const kind = headingKind(raw);
      if (kind) {
        section = kind;
        continue;
      }
      const line = cleanLine(raw);
      if (!line) continue;
      if (section === 'intro') intro.push(line);
      else if (section === 'ingredients') ingredients.push(asGroupHeader(line) ?? line);
      else if (section === 'steps') steps.push(line.replace(STEP_NUMBER, '').trim());
      else notes.push(line);
    }
  } else {
    // No headings: decide line by line. Ingredients are short and start with an
    // amount (or a bullet); steps are numbered or read like sentences.
    for (const raw of rawLines) {
      const bulleted = BULLET.test(raw) && !/^\s*-?\d/.test(raw);
      const line = cleanLine(raw);
      if (!line) continue;
      const header = ingredients.length && !steps.length ? asGroupHeader(line) : null;
      if (header) {
        ingredients.push(header);
      } else if (isNumberedStep(line)) {
        steps.push(line.replace(STEP_NUMBER, '').trim());
      } else if (steps.length === 0 && (looksIngredient(line) || (bulleted && line.length <= 60))) {
        ingredients.push(line);
      } else if (steps.length === 0 && ingredients.length > 0 && line.length <= 40 && !/[.!?]$/.test(line)) {
        ingredients.push(line); // "Salt and pepper", "Fresh basil"
      } else if (ingredients.length > 0 || steps.length > 0) {
        steps.push(line);
      } else {
        intro.push(line);
      }
    }
  }

  // The first short line before the recipe is usually its name.
  let title: string | null = null;
  if (intro.length && intro[0].length <= 80 && !/[.!?]$/.test(intro[0].replace(PICTO, '').trim())) {
    title = titleCase(intro.shift()!.replace(PICTO, '').replace(/\s+/g, ' ').trim()) || null;
  }
  const descriptionLines = [...intro, ...notes].filter((l) => !/^(serves|servings?|makes|yield|prep|cook|total)\b/i.test(l));

  return {
    title,
    description: descriptionLines.join('\n').trim() || null,
    ingredients,
    steps,
    tags,
    servings: yieldInfo.servings,
    yieldLabel: yieldInfo.label,
    ...times,
    usedHeadings,
  };
}

function findYield(text: string): { servings: number | null; label: string | null } {
  const m = /\b(?:serves|servings?|makes|yields?)\s*:?\s*(?:about\s+)?(\d+(?:\s*(?:-|–|to)\s*\d+)?\s*[a-z]{0,15})/i.exec(text);
  if (!m) return { servings: null, label: null };
  const y = parseYield(m[1]);
  if (/^serv/i.test(m[0]) && y.label && !/^serv/i.test(y.label)) y.label = 'servings';
  return y;
}

function findTime(text: string, word: string): number | null {
  const m = new RegExp(String.raw`\b(?:${word})(?:\s*time)?\s*:?\s*((?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b\s*)+)`, 'i').exec(text);
  return m ? parseDurationMinutes(m[1]) : null;
}

/** Fills a draft's recipe fields from free text (pasted, or a social caption). */
export function draftFromText(text: string, base: RecipeDraft = emptyDraft()): RecipeDraft {
  const split = splitRecipeText(text);
  return {
    ...base,
    title: base.title || split.title || '',
    description: base.description || split.description || '',
    servings: base.servings ?? split.servings,
    yieldLabel: base.yieldLabel ?? split.yieldLabel,
    prepMinutes: base.prepMinutes ?? split.prepMinutes,
    cookMinutes: base.cookMinutes ?? split.cookMinutes,
    totalMinutes: base.totalMinutes ?? split.totalMinutes,
    tags: base.tags.length ? base.tags : split.tags,
    ingredients: split.ingredients,
    steps: split.steps,
  };
}

/** Sets the source fields from a link: a social post or a website. */
export function sourceFromLink(url: URL): Pick<RecipeDraft, 'sourceType' | 'sourceName' | 'sourceUrl'> {
  const platform = socialPlatform(url.hostname);
  return {
    sourceType: platform ? 'social' : 'website',
    sourceName: platform ?? siteNameFromHost(url.hostname),
    sourceUrl: normalizeSourceUrl(url),
  };
}
