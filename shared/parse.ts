// Turns free text into structured recipe parts. Rule-based (no AI): it handles
// the usual shapes and leaves anything else as plain text, so nothing is lost.
import { normalizeUnit } from './units.js';

export type ParsedIngredient = {
  rawText: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  item: string | null;
  note: string | null;
  /** A weight written into the line, like "2 cups (455 g) water": the exact grams. */
  weightGrams: number | null;
};

/** "(455 g)", "(455grams)", "(about 240 g)", "(1.2 kg)" */
const WEIGHT_PAREN = /\(\s*(?:about\s+|approx\.?\s+|~\s*)?(\d+(?:\.\d+)?)\s*(g|gr|grams?|kg|kilograms?)\.?\s*\)/i;

const GLYPHS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6',
};

// Counted units: scaled, never converted. Stored in the singular.
const COUNTED: Record<string, string> = {
  clove: 'clove', cloves: 'clove',
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  bunch: 'bunch', bunches: 'bunch',
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  package: 'package', packages: 'package', pkg: 'package', packet: 'package', packets: 'package',
  stick: 'stick', sticks: 'stick',
  slice: 'slice', slices: 'slice',
  sprig: 'sprig', sprigs: 'sprig',
  head: 'head', heads: 'head',
  handful: 'handful', handfuls: 'handful',
  piece: 'piece', pieces: 'piece',
  jar: 'jar', jars: 'jar',
  bottle: 'bottle', bottles: 'bottle',
  bag: 'bag', bags: 'bag',
  box: 'box', boxes: 'box',
  stalk: 'stalk', stalks: 'stalk',
  fillet: 'fillet', fillets: 'fillet',
};

const NUMBER = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;
const AMOUNT_RE = new RegExp(String.raw`^${NUMBER}(?:\s*(?:-|–|—|to)\s*${NUMBER})?`);

function toNumber(s: string): number {
  const parts = s.trim().split(/\s+/);
  return parts.reduce((sum, p) => {
    if (p.includes('/')) {
      const [n, d] = p.split('/').map(Number);
      return sum + (d ? n / d : 0);
    }
    return sum + Number(p);
  }, 0);
}

/** "1½" → "1 1/2", "½" → "1/2", and tidies whitespace. */
function normalizeText(s: string): string {
  return s
    .replace(/(\d)\s*([½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])/g, (_, d: string, g: string) => `${d} ${GLYPHS[g]}`)
    .replace(/[½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]/g, (g) => GLYPHS[g])
    .replace(/⁄/g, '/') // fraction slash
    // "1-3/4" is a mixed number (1¾), not a range: a whole number joined to a fraction smaller than 1.
    .replace(/(?<![\d/.])(\d+)\s?-\s?(\d+)\/(\d+)(?!\d)/g, (whole, w: string, n: string, d: string) =>
      Number(n) < Number(d) ? `${w} ${n}/${d}` : whole,
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function takeParenthetical(s: string): { paren: string | null; rest: string } {
  const m = /^\(([^)]*)\)\s*/.exec(s);
  return m ? { paren: m[1].trim(), rest: s.slice(m[0].length) } : { paren: null, rest: s };
}

function matchUnit(s: string): { unit: string; rest: string } | null {
  const two = /^(fl\.?\s*oz\.?|fluid\s+ounces?)\b\.?\s*/i.exec(s);
  if (two) return { unit: 'fl oz', rest: s.slice(two[0].length) };
  const one = /^([A-Za-z]+)\.?(?=\s|$|,)\s*/.exec(s);
  if (!one) return null;
  const word = one[1];
  const measure = normalizeUnit(word);
  if (measure) return { unit: measure, rest: s.slice(one[0].length) };
  const counted = COUNTED[word.toLowerCase()];
  if (counted) return { unit: counted, rest: s.slice(one[0].length) };
  return null;
}

function splitItemNote(s: string, extraNotes: string[]): { item: string | null; note: string | null } {
  let text = s.replace(/^of\s+/i, '').trim();
  const notes = [...extraNotes];
  const trailingParen = /\s*\(([^)]*)\)\s*$/.exec(text);
  if (trailingParen) {
    notes.push(trailingParen[1].trim());
    text = text.slice(0, trailingParen.index).trim();
  }
  const comma = text.indexOf(',');
  if (comma >= 0) {
    notes.push(text.slice(comma + 1).trim());
    text = text.slice(0, comma).trim();
  }
  const note = notes.filter(Boolean).join('; ');
  return { item: text || null, note: note || null };
}

/** "1 1/2 cups flour, sifted" → { quantity: 1.5, unit: 'cup', item: 'flour', note: 'sifted' }. */
export function parseIngredientLine(raw: string): ParsedIngredient {
  const rawText = raw.trim().replace(/^[-*•·]\s*/, '');
  let s = normalizeText(rawText);
  const notes: string[] = [];
  let quantity: number | null = null;
  let quantityMax: number | null = null;
  let unit: string | null = null;

  const amount = AMOUNT_RE.exec(s);
  if (amount) {
    quantity = toNumber(amount[1]);
    quantityMax = amount[2] ? toNumber(amount[2]) : null;
    s = s.slice(amount[0].length).trimStart();
  } else {
    const article = /^(an?)\s+/i.exec(s);
    if (article) {
      const afterArticle = s.slice(article[0].length);
      const u = matchUnit(afterArticle);
      if (u) {
        quantity = 1;
        s = afterArticle;
      }
    }
  }

  // A gram weight in parentheses is the exact weight, not a note.
  let weightGrams: number | null = null;
  const w = quantity != null ? WEIGHT_PAREN.exec(s) : null;
  if (w) {
    const n = Number(w[1]) * (/^k/i.test(w[2]) ? 1000 : 1);
    if (n > 0 && n < 100_000) {
      weightGrams = Math.round(n * 10) / 10;
      s = `${s.slice(0, w.index)} ${s.slice(w.index + w[0].length)}`.replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
    }
  }

  if (quantity != null) {
    let p = takeParenthetical(s);
    if (p.paren) notes.push(p.paren);
    s = p.rest;
    const u = matchUnit(s);
    if (u) {
      unit = u.unit;
      s = u.rest;
      p = takeParenthetical(s);
      if (p.paren) notes.push(p.paren);
      s = p.rest;
    }
  }

  const { item, note } = splitItemNote(s, notes);
  if (quantity != null && !item) {
    // "2 cups" with nothing after it: not useful as structure.
    return { rawText, quantity: null, quantityMax: null, unit: null, item: rawText || null, note: null, weightGrams: null };
  }
  return { rawText, quantity, quantityMax, unit, item, note, weightGrams };
}

export type ParsedIngredientList = { lines: (ParsedIngredient & { groupLabel: string | null })[] };

/**
 * One ingredient per line. A line ending in ":" ("For the crust:") or starting
 * with "#" starts a group. Blank lines are skipped.
 */
export function parseIngredientText(text: string): ParsedIngredientList {
  let group: string | null = null;
  const lines: ParsedIngredientList['lines'] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const hash = /^#+\s*(.+?)\s*$/.exec(line);
    const colon = /^(.{1,60}):$/.exec(line);
    const label = hash?.[1] ?? (colon && !AMOUNT_RE.test(normalizeText(line)) ? colon[1] : null);
    if (label) {
      group = label.trim();
      continue;
    }
    lines.push({ ...parseIngredientLine(line), groupLabel: group });
  }
  return { lines };
}

/** Turns stored ingredient lines back into editable text, with group headers. */
export function ingredientsToText(lines: { groupLabel: string | null; rawText: string }[]): string {
  const out: string[] = [];
  let group: string | null = null;
  for (const l of lines) {
    if (l.groupLabel !== group) {
      if (l.groupLabel) out.push(`${out.length ? '\n' : ''}${l.groupLabel}:`);
      group = l.groupLabel;
    }
    out.push(l.rawText);
  }
  return out.join('\n');
}

const DURATION_RE = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
const UNIT_SECONDS = (u: string) => (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1);

/** The first duration in a step, in seconds ("bake 10–12 minutes" → 720, "1 hour 15 minutes" → 4500). */
export function detectTimer(stepText: string): number | null {
  const matches = [...stepText.matchAll(DURATION_RE)];
  if (!matches.length) return null;
  const secondsOf = (m: RegExpMatchArray) => Number(m[2] ?? m[1]) * UNIT_SECONDS(m[3]);
  let total = secondsOf(matches[0]);
  const next = matches[1];
  if (next && /^h/i.test(matches[0][3]) && /^m/i.test(next[3])) {
    const between = stepText.slice(matches[0].index! + matches[0][0].length, next.index);
    if (/^\s*(and)?\s*$/i.test(between)) total += secondsOf(next);
  }
  return total > 0 && total <= 48 * 3600 ? Math.round(total) : null;
}

/** Every duration in a step, with where it sits in the text ("1 hour 15 minutes" is one span). */
export function durationSpans(stepText: string): { start: number; end: number; seconds: number }[] {
  const spans: { start: number; end: number; seconds: number }[] = [];
  const secondsOf = (m: RegExpMatchArray) => Number(m[2] ?? m[1]) * UNIT_SECONDS(m[3]);
  let prevWasHours = false;
  for (const m of stepText.matchAll(DURATION_RE)) {
    const start = m.index!;
    const end = start + m[0].length;
    const prev = spans[spans.length - 1];
    // "1 hour (and) 15 minutes" joins the previous hour span
    if (prev && prevWasHours && /^m/i.test(m[3]) && /^\s*(and)?\s*$/i.test(stepText.slice(prev.end, start))) {
      prev.end = end;
      prev.seconds += secondsOf(m);
      prevWasHours = false;
      continue;
    }
    spans.push({ start, end, seconds: secondsOf(m) });
    prevWasHours = /^h/i.test(m[3]);
  }
  return spans.filter((s) => s.seconds > 0 && s.seconds <= 48 * 3600).map((s) => ({ ...s, seconds: Math.round(s.seconds) }));
}

/** One step per line; "1." / "Step 2:" prefixes and blank lines are dropped. */
export function parseStepText(text: string): { text: string; timerSeconds: number | null }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^(step\s*)?\d+\s*[.):-]\s*/i, '').trim())
    .filter(Boolean)
    .map((t) => ({ text: t, timerSeconds: detectTimer(t) }));
}

/** "Mom's Lemon Bars!" → "moms-lemon-bars". */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'recipe';
}
