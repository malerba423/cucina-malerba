import { durationSpans } from './parse.js';
import { coreWords, words } from './search.js';

// Cook mode helpers: which ingredients a step uses, and where its times are.

/** Words too general to tie an ingredient to a step on their own ("sauce" alone shouldn't pull in soy sauce). */
const GENERIC = new Set(['sauce', 'powder', 'paste', 'juice', 'oil', 'leaf', 'seed', 'stock', 'broth', 'extract', 'zest', 'mix', 'cheese'].map((w) => words(w)[0]));

type Line = { id: number; item: string | null; rawText: string };

/**
 * The ingredients a step mentions, in recipe order. An ingredient counts when
 * the step names one of its specific words ("Add the chicken" → chicken
 * thighs), or all of its words when they're general ("Heat the oil" → oil,
 * but "Add the sauce" doesn't pull in soy sauce).
 */
export function ingredientsForStep(stepText: string, lines: Line[]): number[] {
  const step = new Set(words(stepText));
  const ids: number[] = [];
  for (const line of lines) {
    const core = coreWords(line.item ?? line.rawText);
    if (!core.length) continue;
    const specific = core.filter((w) => !GENERIC.has(w));
    const hit = specific.length ? specific.some((w) => step.has(w)) : core.every((w) => step.has(w));
    if (hit) ids.push(line.id);
  }
  return ids;
}

export type StepPart = string | { text: string; seconds: number };

/** "Bake 20 minutes, then rest 5 minutes" → ["Bake ", {20 minutes}, ", then rest ", {5 minutes}] */
export function stepParts(text: string): StepPart[] {
  const parts: StepPart[] = [];
  let at = 0;
  for (const span of durationSpans(text)) {
    if (span.start > at) parts.push(text.slice(at, span.start));
    parts.push({ text: text.slice(span.start, span.end), seconds: span.seconds });
    at = span.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
