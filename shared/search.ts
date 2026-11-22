import type { SearchField, SourceType } from './types.js';

// Recipe search and fridge matching, in plain code instead of SQL: the whole
// box is a few hundred recipes, so the server loads them once (cached briefly)
// and matching here is both fast and easy to make forgiving.

/** One recipe as search sees it. */
export type SearchDoc = {
  id: number;
  slug: string;
  title: string;
  description: string;
  sourceType: SourceType;
  sourceName: string;
  sourceNote: string;
  personId: number | null;
  personName: string;
  addedByUserId: number | null;
  createdAt: number; // ms
  totalMinutes: number | null;
  photoUrl: string | null;
  madeCount: number;
  avgRating: number | null;
  tags: string[];
  ingredients: { item: string | null; rawText: string; groupLabel: string | null; note: string | null }[];
};

// ---------- words ----------

const STOP = new Set(['a', 'an', 'and', 'the', 'of', 'with', 'for', 'in', 'on', 'or', 'to', 'from', 'my', 'our', 'its']);

/**
 * Folds plurals so "eggs" = "egg", "tomatoes" = "tomato", "berries" = "berry",
 * "cookies" = "cookie". Not real English stemming; it only has to treat both
 * sides of a comparison the same way.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}i`;
  else if (w.length > 4 && w.endsWith('oes')) w = w.slice(0, -2);
  else if (w.length > 4 && /(ches|shes|xes|sses|zes)$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 2 && w.endsWith('y')) w = `${w.slice(0, -1)}i`;
  else if (w.length > 3 && w.endsWith('ie')) w = w.slice(0, -1);
  return w;
}

/** Lowercase, accents off ("jalapeño" → "jalapeno"), split into folded words, minus filler words. */
export function words(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

// ---------- search ----------

export type SearchParams = {
  q: string;
  by: SearchField;
  source: SourceType | 'all';
  personId: number | null;
  /** Inclusive ms range on createdAt; null means open-ended. */
  addedFrom: number | null;
  addedTo: number | null;
  quick: Set<string>;
  tags: string[];
  /** "Mine": recipes this person added, or originals credited to them. */
  mine?: Mine | null;
};

type Field = { words: string[]; weight: number };

function fieldsFor(doc: SearchDoc, by: SearchField): Field[] {
  const title = { words: words(doc.title), weight: 10 };
  const source = { words: words(`${doc.sourceName} ${doc.personName} ${doc.sourceNote}`), weight: 5 };
  const ingredients = { words: doc.ingredients.flatMap((i) => words(i.item ?? i.rawText)), weight: 4 };
  const ingredientText = { words: doc.ingredients.flatMap((i) => words(i.rawText)), weight: 2 };
  if (by === 'name') return [title];
  if (by === 'source') return [source];
  if (by === 'ingredient') return [ingredients, ingredientText];
  return [title, { words: doc.tags.flatMap((t) => words(t)), weight: 6 }, source, ingredients, ingredientText, { words: words(doc.description), weight: 1 }];
}

/** Every word the cookbook knows, so a finished word ("egg") matches exactly and a half-typed one ("lem") matches as a prefix. */
export function vocabulary(docs: SearchDoc[]): Set<string> {
  const vocab = new Set<string>();
  for (const d of docs) for (const f of fieldsFor(d, 'any')) for (const w of f.words) vocab.add(w);
  return vocab;
}

/** A typed word: what was typed (for "No match for: …") and its folded form (for matching). */
export type QueryTerm = { typed: string; word: string };

export function queryTerms(q: string): QueryTerm[] {
  const seen = new Set<string>();
  const out: QueryTerm[] = [];
  for (const typed of q.toLowerCase().split(/[^\p{L}\p{N}'’]+/u)) {
    const [word] = words(typed);
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push({ typed: typed.replace(/['’]/g, ''), word });
  }
  return out;
}

/** Relevance of a doc, and which typed words it didn't match. */
export function scoreDoc(
  doc: SearchDoc,
  terms: QueryTerm[],
  by: SearchField,
  vocab: Set<string>,
  phrase: string,
): { score: number; missed: string[] } {
  const fields = fieldsFor(doc, by);
  let score = 0;
  const missed: string[] = [];
  for (const { typed, word: q } of terms) {
    const exactOnly = vocab.has(q) || q.length < 2;
    let best = 0;
    for (const f of fields) {
      if (f.weight <= best) continue;
      if (f.words.includes(q)) best = f.weight;
      else if (!exactOnly && f.words.some((w) => w.startsWith(q))) best = Math.max(best, f.weight * 0.6);
    }
    if (best) score += best;
    else missed.push(typed);
  }
  // Whole query appearing in the name, in order, beats scattered words.
  if (phrase && !missed.length && (by === 'any' || by === 'name') && words(doc.title).join(' ').includes(phrase)) score += 8;
  return { score, missed };
}

/** Whose "Mine" this is: their account, the person their originals are credited to, and recipes they've added to their own. */
export type Mine = { userId: number; personId: number | null; savedIds: Set<number> };

/** Shared it, created it, or added it to "my recipes". */
export function isMine(doc: SearchDoc, me: Mine): boolean {
  return (
    doc.addedByUserId === me.userId ||
    (doc.sourceType === 'original' && me.personId != null && doc.personId === me.personId) ||
    me.savedIds.has(doc.id)
  );
}

export function filterDoc(doc: SearchDoc, p: SearchParams): boolean {
  if (p.source !== 'all' && doc.sourceType !== p.source) return false;
  if (p.personId != null && doc.personId !== p.personId) return false;
  if (p.mine && !isMine(doc, p.mine)) return false;
  if (p.addedFrom != null && doc.createdAt < p.addedFrom) return false;
  if (p.addedTo != null && doc.createdAt > p.addedTo) return false;
  if (p.quick.has('under30') && !(doc.totalMinutes != null && doc.totalMinutes <= 30)) return false;
  if (p.quick.has('never-made') && doc.madeCount > 0) return false;
  if (p.quick.has('rated4') && !(doc.avgRating != null && doc.avgRating >= 4)) return false;
  if (p.quick.has('made-often') && doc.madeCount < 3) return false;
  for (const t of p.tags) if (!doc.tags.includes(t)) return false;
  return true;
}

export type SearchHit = { doc: SearchDoc; score: number; missed: string[] };

/**
 * Filters and scores. Source searches need every word ("Mom" means Mom).
 * Name, ingredient and anything searches also return partial matches (at
 * least half the words), which callers list after the full matches.
 */
export function searchDocs(docs: SearchDoc[], p: SearchParams, vocab = vocabulary(docs)): SearchHit[] {
  const terms = queryTerms(p.q);
  const phrase = terms.length > 1 ? words(p.q).join(' ') : '';
  const needed = p.by === 'source' ? terms.length : Math.max(1, Math.ceil(terms.length / 2));
  const out: SearchHit[] = [];
  for (const doc of docs) {
    if (!filterDoc(doc, p)) continue;
    if (!terms.length) {
      out.push({ doc, score: 0, missed: [] });
      continue;
    }
    const { score, missed } = scoreDoc(doc, terms, p.by, vocab, phrase);
    if (terms.length - missed.length >= needed) out.push({ doc, score, missed });
  }
  return out;
}

/** "2026-03" → first ms of March 2026 (UTC); with end=true, the last ms of that month. */
export function monthBound(value: unknown, end = false): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11 || year < 2000 || year > 2100) return null;
  return end ? Date.UTC(year, month + 1, 1) - 1 : Date.UTC(year, month, 1);
}

// ---------- fridge ----------

export const DEFAULT_STAPLES = ['salt', 'pepper', 'water', 'olive oil', 'vegetable oil', 'sugar', 'flour'];

// Describing words that don't change what the ingredient is, for fridge matching.
const MODIFIERS = new Set(
  [
    'fresh', 'freshly', 'ground', 'kosher', 'sea', 'fine', 'finely', 'coarse', 'coarsely', 'flaky', 'black', 'extra', 'virgin',
    'table', 'granulated', 'all', 'purpose', 'neutral', 'cold', 'warm', 'hot', 'boiling', 'lukewarm', 'large', 'medium', 'small',
    'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'crushed', 'unsalted', 'salted', 'raw', 'dried', 'roughly',
    'thinly', 'softened', 'melted', 'room', 'temperature', 'plain', 'white', 'good', 'quality', 'organic', 'whole', 'some', 'about',
    'cup', 'canola', 'avocado', 'light', 'mild', 'optional', 'taste', 'needed', 'more', 'serving', 'divided', 'packed', 'level', 'heaping',
  ].map(stem),
);

/** The words that say what an ingredient is ("freshly ground black pepper" → pepper). */
export const coreWords = (text: string) => words(text).filter((w) => !MODIFIERS.has(w) && !/^\d/.test(w));
const core = coreWords;

/** Lines a recipe doesn't really need: garnishes, "to serve", "optional". */
export function isOptional(i: SearchDoc['ingredients'][number]): boolean {
  if (i.groupLabel && /serv|garnish|topping|optional/i.test(i.groupLabel)) return true;
  return /\boptional\b|for garnish|to garnish|to serve|for serving/i.test(`${i.rawText} ${i.note ?? ''}`);
}

export type FridgeLists = { have: string[]; staples: string[] };

/**
 * Whether an ingredient line is covered. Your own items match loosely
 * ("chicken" covers "boneless chicken thighs"); staples match strictly, so
 * "pepper" covers "freshly ground black pepper" but not "red bell pepper".
 */
export function covers(line: string, lists: { have: string[][]; staples: string[][] }): 'have' | 'staple' | null {
  const item = core(line);
  if (!item.length) return 'staple'; // nothing left but describing words ("Salt, to taste" minus salt…)
  for (const h of lists.have) if (h.length && h.every((w) => item.includes(w))) return 'have';
  const set = new Set(item);
  for (const s of lists.staples) if (s.length === set.size && s.every((w) => set.has(w))) return 'staple';
  // "salt and pepper": every word is a one-word staple
  const single = new Set(lists.staples.filter((s) => s.length === 1).map((s) => s[0]));
  if (item.every((w) => single.has(w))) return 'staple';
  return null;
}

export type FridgeMatch = { doc: SearchDoc; matched: number; missing: string[] };

export function fridgeMatches(docs: SearchDoc[], lists: FridgeLists, maxMissing = 2): FridgeMatch[] {
  const prepared = {
    have: lists.have.map(core).filter((h) => h.length),
    staples: lists.staples.map(core).filter((s) => s.length),
  };
  if (!prepared.have.length) return [];
  const out: FridgeMatch[] = [];
  for (const doc of docs) {
    const needed = doc.ingredients.filter((i) => !isOptional(i));
    if (!needed.length) continue;
    let matched = 0;
    const missing: string[] = [];
    for (const i of needed) {
      const c = covers(i.item ?? i.rawText, prepared);
      if (c === 'have') matched++;
      else if (!c) missing.push(i.rawText);
      if (missing.length > maxMissing) break;
    }
    if (matched > 0 && missing.length <= maxMissing) out.push({ doc, matched, missing });
  }
  return out.sort((a, b) => a.missing.length - b.missing.length || b.matched - a.matched || a.doc.title.localeCompare(b.doc.title));
}
