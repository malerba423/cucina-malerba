// Scaling and unit conversion for parsed ingredient lines.
// Kitchen conventions, not lab ones: 1 cup = 240 ml, 1 tbsp = 15 ml, 1 tsp = 5 ml.
//   us      cups, spoons, oz, lb
//   metric  ml/l for volumes, g/kg for weights
//   grams   weigh everything: volumes become grams via typical densities (shown as ≈)

export type UnitSystem = 'us' | 'metric' | 'grams';
export const UNIT_SYSTEMS: UnitSystem[] = ['us', 'metric', 'grams'];

type UnitDef = { kind: 'volume' | 'weight'; system: UnitSystem; base: number; label: [string, string] };

// base = millilitres for volume, grams for weight. label = [singular, plural]
const UNITS: Record<string, UnitDef> = {
  tsp: { kind: 'volume', system: 'us', base: 5, label: ['tsp', 'tsp'] },
  tbsp: { kind: 'volume', system: 'us', base: 15, label: ['tbsp', 'tbsp'] },
  'fl oz': { kind: 'volume', system: 'us', base: 30, label: ['fl oz', 'fl oz'] },
  cup: { kind: 'volume', system: 'us', base: 240, label: ['cup', 'cups'] },
  pint: { kind: 'volume', system: 'us', base: 480, label: ['pint', 'pints'] },
  quart: { kind: 'volume', system: 'us', base: 960, label: ['quart', 'quarts'] },
  gallon: { kind: 'volume', system: 'us', base: 3840, label: ['gallon', 'gallons'] },
  oz: { kind: 'weight', system: 'us', base: 28.35, label: ['oz', 'oz'] },
  lb: { kind: 'weight', system: 'us', base: 453.6, label: ['lb', 'lb'] },
  ml: { kind: 'volume', system: 'metric', base: 1, label: ['ml', 'ml'] },
  l: { kind: 'volume', system: 'metric', base: 1000, label: ['l', 'l'] },
  g: { kind: 'weight', system: 'metric', base: 1, label: ['g', 'g'] },
  kg: { kind: 'weight', system: 'metric', base: 1000, label: ['kg', 'kg'] },
};

const ALIASES: Record<string, string> = {
  t: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  T: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', tbsps: 'tbsp',
  c: 'cup', cups: 'cup',
  'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz', floz: 'fl oz',
  pints: 'pint', pt: 'pint', quarts: 'quart', qt: 'quart', gallons: 'gallon', gal: 'gallon',
  ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', mL: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', L: 'l',
  gram: 'g', grams: 'g', gr: 'g', kilogram: 'kg', kilograms: 'kg', kgs: 'kg',
};

/** Canonical unit key ("tbsp", "cup", "g"…) or null when it isn't a measuring unit ("clove", "can"). */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const trimmed = unit.trim().replace(/\.$/, '');
  if (UNITS[trimmed]) return trimmed;
  if (ALIASES[trimmed]) return ALIASES[trimmed]; // case-sensitive first: T vs t
  const lower = trimmed.toLowerCase();
  return UNITS[lower] ? lower : (ALIASES[lower] ?? null);
}

/** For adding amounts together: "cup" → volume, 240 ml. Null for counted units ("clove", "can"). */
export function unitInfo(unit: string | null | undefined): { kind: 'volume' | 'weight'; base: number } | null {
  const key = normalizeUnit(unit);
  return key ? { kind: UNITS[key].kind, base: UNITS[key].base } : null;
}

const FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

/** 1.5 → "1½", 0.333 → "⅓", 2 → "2", 1.13 → "1⅛", 2.4 → "2.4". */
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.04) return String(whole);
  if (frac > 0.96) return String(whole + 1);
  for (const [value, glyph] of FRACTIONS) {
    if (Math.abs(frac - value) < 0.03) return whole > 0 ? `${whole}${glyph}` : glyph;
  }
  return String(Math.round(n * 10) / 10);
}

function roundMetric(value: number): number {
  if (value >= 1000) return Math.round(value / 50) * 50;
  if (value >= 100) return Math.round(value / 5) * 5;
  if (value >= 10) return Math.round(value);
  return Math.round(value * 2) / 2;
}

// For counted units that aren't measures: clove → cloves, bunch → bunches.
function pluralize(unit: string, qty: number): string {
  if (!isPlural(qty) || /s$/.test(unit)) return unit;
  return /(ch|sh|x)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

function labelFor(unit: string, qty: number): string {
  const def = UNITS[unit];
  return isPlural(qty) ? def.label[1] : def.label[0];
}

// Decided from what's displayed, so 1.04 cups (shown as "1") reads "1 cup".
function isPlural(qty: number): boolean {
  return qty > 1 && formatQuantity(qty) !== '1';
}

// Pick the US unit that keeps the number readable (¼ tsp … 4 quarts).
function bestUs(kind: 'volume' | 'weight', base: number): { unit: string; qty: number } {
  if (kind === 'weight') {
    const oz = base / UNITS.oz.base;
    return oz >= 16 ? { unit: 'lb', qty: base / UNITS.lb.base } : { unit: 'oz', qty: oz };
  }
  if (base < 15) return { unit: 'tsp', qty: base / 5 };
  if (base < 60) return { unit: 'tbsp', qty: base / 15 };
  return { unit: 'cup', qty: base / 240 };
}

// Grams per US cup (240 ml) for common ingredients. First match wins, so
// specific names come before general ones. Values are typical for spooned-and-
// levelled dry ingredients; real kitchens vary by about ±10%.
const DENSITY_G_PER_CUP: [RegExp, number][] = [
  [/\b(almond flour|almond meal)\b/, 96],
  [/\bwhole wheat flour\b/, 113],
  [/\bflour\b/, 120], // all-purpose, bread, cake
  [/\b(brown sugar)\b/, 213],
  [/\b(powdered|confectioners'?|icing) sugar\b/, 113],
  [/\bsugar\b/, 200],
  [/\bbutter\b/, 227],
  [/\b(honey)\b/, 340],
  [/\b(maple syrup|molasses|corn syrup)\b/, 320],
  [/\b(olive oil|vegetable oil|canola oil|oil)\b/, 200],
  [/\b(cocoa|cacao) powder\b|\bcocoa\b/, 84],
  [/\b(cornstarch|corn starch)\b/, 112],
  [/\bbaking soda\b/, 288],
  [/\bbaking powder\b/, 192],
  [/\b(instant |active dry )?yeast\b/, 150],
  [/\b(table salt|fine salt|sea salt)\b/, 288], // not kosher salt: brands differ by 2×
  [/\b(rolled oats|oats)\b/, 89],
  [/\b(chocolate chips|chocolate chunks)\b/, 170],
  [/\b(white |red )?miso\b/, 272],
  [/\bcurry paste\b/, 256],
  [/\b(fish sauce)\b/, 288],
  [/\b(soy sauce|tamari)\b/, 256],
  [/\bzest\b/, 96],
  [/\b(parmesan|parmigiano)\b/, 100],
  [/\b(feta)\b/, 150],
  [/\b(heavy cream|cream|half[- ]and[- ]half)\b/, 232],
  [/\b(water|milk|buttermilk|stock|broth|juice|coffee|wine|vinegar|extract|vanilla)\b/, 240],
];

/** Typical grams per ml for an ingredient name, or null when unknown. */
export function densityFor(item: string | null | undefined): number | null {
  if (!item) return null;
  const name = item.toLowerCase();
  if (/\bkosher salt\b/.test(name)) return null;
  for (const [pattern, perCup] of DENSITY_G_PER_CUP) if (pattern.test(name)) return perCup / 240;
  return null;
}

export type Amount = { amount: string; unit: string | null; approx?: boolean };

export type IngredientAmountInput = {
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  item?: string | null;
  weightGrams?: number | null; // exact weight for the base quantity, when someone has entered it
};

// Exact weights keep 1 g precision (it's what a scale shows); estimates are
// rounded like other metric amounts so they don't look more precise than they are.
function gramsText(lo: number, hi: number | null, approx: boolean): string {
  const fmt = (g: number) => String(approx ? roundMetric(g) : g >= 10 ? Math.round(g) : Math.round(g * 2) / 2);
  return hi != null ? `${fmt(lo)}–${fmt(hi)}` : fmt(lo);
}

/**
 * Grams mode: exact weights first, then weight units, then volume × density.
 * Returns null when this line can't become grams (counted items, unknown volumes).
 */
function presentGrams(input: IngredientAmountInput, factor: number): Amount | null {
  const { quantity, quantityMax, weightGrams } = input;
  if (weightGrams != null && quantity != null) {
    const ratio = quantityMax != null ? quantityMax / quantity : null;
    const lo = weightGrams * factor;
    return { amount: gramsText(lo, ratio != null ? lo * ratio : null, false), unit: 'g' };
  }
  if (quantity == null) return null;
  const key = normalizeUnit(input.unit);
  const def = key ? UNITS[key] : null;
  if (!def) return null;
  const lo = quantity * factor * def.base;
  const hi = quantityMax != null ? quantityMax * factor * def.base : null;
  if (def.kind === 'weight') return { amount: gramsText(lo, hi, false), unit: 'g' };
  const density = densityFor(input.item);
  if (density == null) return null;
  return { amount: gramsText(lo * density, hi != null ? hi * density : null, true), unit: 'g', approx: true };
}

/**
 * How an ingredient line should read after scaling by `factor` and converting to `system`.
 * Returns null when the line has no parsed quantity (show its raw text instead).
 * Units that aren't measures ("clove", "can", none) are scaled but never converted.
 * In grams mode, lines that can't be weighed fall back to metric.
 */
export function presentIngredient(input: IngredientAmountInput, factor: number, system: UnitSystem): Amount | null {
  if (system === 'grams') {
    const grams = presentGrams(input, factor);
    if (grams) return grams;
    return presentAmount(input.quantity, input.quantityMax, input.unit, factor, 'metric');
  }
  return presentAmount(input.quantity, input.quantityMax, input.unit, factor, system);
}

export function presentAmount(
  quantity: number | null,
  quantityMax: number | null,
  unit: string | null,
  factor: number,
  system: 'us' | 'metric',
): Amount | null {
  if (quantity == null) return null;
  const key = normalizeUnit(unit);
  const lo = quantity * factor;
  const hi = quantityMax != null ? quantityMax * factor : null;

  const def = key ? UNITS[key] : null;
  if (!def || def.system === system) {
    const label = def ? labelFor(key!, hi ?? lo) : unit ? pluralize(unit, hi ?? lo) : null;
    const amount = hi != null ? `${formatQuantity(lo)}–${formatQuantity(hi)}` : formatQuantity(lo);
    return { amount, unit: label ?? null };
  }

  const loBase = lo * def.base;
  const hiBase = hi != null ? hi * def.base : null;

  if (system === 'metric') {
    const big = (hiBase ?? loBase) >= 1000;
    const unitOut = def.kind === 'volume' ? (big ? 'l' : 'ml') : big ? 'kg' : 'g';
    const div = big ? 1000 : 1;
    const fmt = (b: number) => {
      const v = roundMetric(b) / div;
      return String(Math.round(v * 100) / 100);
    };
    return { amount: hiBase != null ? `${fmt(loBase)}–${fmt(hiBase)}` : fmt(loBase), unit: unitOut };
  }

  const loUs = bestUs(def.kind, loBase);
  if (hiBase != null) {
    const hiQty = hiBase / UNITS[loUs.unit].base;
    return { amount: `${formatQuantity(loUs.qty)}–${formatQuantity(hiQty)}`, unit: labelFor(loUs.unit, hiQty) };
  }
  return { amount: formatQuantity(loUs.qty), unit: labelFor(loUs.unit, loUs.qty) };
}

/** 75 → "1 hr 15 min", 45 → "45 min", 240 → "4 hr". */
export function formatMinutes(min: number | null | undefined): string {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** 1200 → "20:00", 90 → "1:30", 3600 → "1:00:00". */
export function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
