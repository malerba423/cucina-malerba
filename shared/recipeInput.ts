// What the add/edit form sends, and the checks both sides run on it.
// The server re-runs these on every save; the form uses them to show errors early.
import { SOURCE_TYPES, type SourceType } from './types.js';

export type IngredientInput = {
  groupLabel: string | null;
  rawText: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  item: string | null;
  note: string | null;
  weightGrams: number | null;
};

export type StepInput = { text: string; timerSeconds: number | null };

export type RecipeInput = {
  title: string;
  description: string | null;
  sourceType: SourceType;
  sourcePersonName: string | null; // who it's credited to: person, original, and imports (website/social)
  sourceName: string | null; // site, @handle or book
  sourceUrl: string | null;
  sourceNote: string | null;
  servings: number | null;
  yieldLabel: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  photoUrl: string | null;
  tags: string[];
  ingredients: IngredientInput[];
  steps: StepInput[];
  /** New variations only: the recipe this is a version of. */
  parentSlug?: string | null;
};

export const LIMITS = { title: 120, text: 2000, short: 200, ingredients: 100, steps: 60, tags: 12 };

type Result = { ok: true; value: RecipeInput } | { ok: false; errors: Record<string, string> };

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const num = (v: unknown, max: number): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : NaN;
};

/** Checks and cleans an untrusted body. `photoPrefix` limits photos to our own uploads. */
export function validateRecipeInput(body: unknown, photoPrefixes: string[] = []): Result {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const title = str(b.title, LIMITS.title);
  if (!title) errors.title = 'Give the recipe a name';

  const sourceType = SOURCE_TYPES.includes(b.sourceType as SourceType) ? (b.sourceType as SourceType) : null;
  if (!sourceType) errors.sourceType = 'Pick where it came from';

  const sourcePersonName = str(b.sourcePersonName, 60);
  if (sourceType === 'person' && !sourcePersonName) errors.sourcePersonName = 'Who gave you this recipe?';

  let sourceUrl = str(b.sourceUrl, 500);
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) sourceUrl = `https://${sourceUrl}`;
  if (sourceUrl) {
    try {
      new URL(sourceUrl);
    } catch {
      errors.sourceUrl = "That link doesn't look right";
    }
  }

  const numbers = {
    servings: num(b.servings, 1000),
    prepMinutes: num(b.prepMinutes, 10_000),
    cookMinutes: num(b.cookMinutes, 10_000),
    totalMinutes: num(b.totalMinutes, 10_000),
  };
  for (const [k, v] of Object.entries(numbers)) if (Number.isNaN(v)) errors[k] = 'Use a number';
  if (numbers.servings === 0) errors.servings = 'Use a number above 0';

  const photoUrl = str(b.photoUrl, 500);
  if (photoUrl && !photoPrefixes.some((p) => photoUrl.startsWith(p))) errors.photoUrl = 'Upload the photo again';

  const tags = Array.isArray(b.tags)
    ? [...new Set(b.tags.map((t) => str(t, 30)?.toLowerCase()).filter((t): t is string => !!t))].slice(0, LIMITS.tags)
    : [];

  const ingredients: IngredientInput[] = [];
  if (Array.isArray(b.ingredients)) {
    for (const raw of b.ingredients.slice(0, LIMITS.ingredients)) {
      const i = (raw ?? {}) as Record<string, unknown>;
      const rawText = str(i.rawText, LIMITS.short);
      if (!rawText) continue;
      const quantity = num(i.quantity, 100_000);
      const quantityMax = num(i.quantityMax, 100_000);
      const weightGrams = num(i.weightGrams, 100_000);
      ingredients.push({
        groupLabel: str(i.groupLabel, 60),
        rawText,
        quantity: Number.isNaN(quantity) ? null : quantity,
        quantityMax: Number.isNaN(quantityMax) ? null : quantityMax,
        unit: str(i.unit, 20),
        item: str(i.item, LIMITS.short),
        note: str(i.note, LIMITS.short),
        weightGrams: Number.isNaN(weightGrams) || weightGrams === 0 ? null : weightGrams,
      });
    }
  }
  if (!ingredients.length) errors.ingredients = 'Add at least one ingredient';

  const steps: StepInput[] = [];
  if (Array.isArray(b.steps)) {
    for (const raw of b.steps.slice(0, LIMITS.steps)) {
      const s = (raw ?? {}) as Record<string, unknown>;
      const text = str(s.text, LIMITS.text);
      if (!text) continue;
      const timer = num(s.timerSeconds, 48 * 3600);
      steps.push({ text, timerSeconds: Number.isNaN(timer) || timer === 0 ? null : timer });
    }
  }
  if (!steps.length) errors.steps = 'Add at least one step';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title: title!,
      description: str(b.description, LIMITS.text),
      sourceType: sourceType!,
      sourcePersonName: sourceType === 'cookbook' || sourceType === 'other' ? null : sourcePersonName,
      sourceName: str(b.sourceName, LIMITS.short),
      sourceUrl,
      sourceNote: str(b.sourceNote, LIMITS.short),
      servings: numbers.servings,
      yieldLabel: str(b.yieldLabel, 30),
      prepMinutes: numbers.prepMinutes,
      cookMinutes: numbers.cookMinutes,
      totalMinutes: numbers.totalMinutes,
      photoUrl,
      tags,
      ingredients,
      steps,
      parentSlug: str(b.parentSlug, 200),
    },
  };
}
