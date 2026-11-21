// "Tidy this up" request and answer, shared by the recipe form and the server.
import { LIMITS } from './recipeInput.js';

/** What the form sends: its current text, as typed. */
export type TidyRequest = {
  title: string;
  description: string;
  servings: string;
  ingredients: string; // one per line
  steps: string; // one per line
};

export type TidyResult = {
  title: string;
  description: string;
  servings: number | null;
  yieldLabel: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
  /** Things the cook should double-check. */
  notes: string;
};

export const TIDY_MAX_CHARS = 20_000;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v) : null);
const lines = (v: unknown, maxLines: number, maxLen: number) =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxLines) : [];

/** Checks the model's answer like any other untrusted input. */
export function cleanResult(raw: unknown): TidyResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const servings = typeof r.servings === 'number' && r.servings > 0 && r.servings <= 1000 ? Math.round(r.servings * 100) / 100 : null;
  return {
    title: str(r.title, LIMITS.title),
    description: str(r.description, LIMITS.text),
    servings,
    yieldLabel: str(r.yieldLabel, 30) || null,
    prepMinutes: int(r.prepMinutes, 10_000),
    cookMinutes: int(r.cookMinutes, 10_000),
    totalMinutes: int(r.totalMinutes, 10_000),
    ingredients: lines(r.ingredients, LIMITS.ingredients, LIMITS.short),
    steps: lines(r.steps, LIMITS.steps, LIMITS.text),
    tags: [...new Set(lines(r.tags, 8, 30).map((t) => t.toLowerCase()))],
    notes: str(r.notes, 600),
  };
}

