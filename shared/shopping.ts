import { parseIngredientLine } from './parse.js';
import { coreWords, stem } from './search.js';
import { densityFor, formatQuantity, presentAmount, unitInfo, type UnitSystem } from './units.js';

// The shopping list. It lives in the browser (no database), so this is all
// plain data: entries are the lines that were added, and rows are what the
// list shows after the same ingredient from different recipes is merged.

export type ShoppingEntry = {
  id: string;
  rawText: string;
  item: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  weightGrams: number | null;
  /** Scale applied when it was added (servings changed on the recipe page). */
  factor: number;
  recipe: { slug: string; title: string } | null;
  checked: boolean;
  addedAt: number;
};

export const SECTIONS = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Pantry', 'Spices', 'Frozen', 'Drinks', 'Other'] as const;
export type Section = (typeof SECTIONS)[number];

export type ShoppingRow = {
  key: string;
  name: string;
  amount: string | null;
  approx: boolean;
  section: Section;
  entries: ShoppingEntry[];
  checked: boolean;
  recipes: string[];
};

const SECTION_WORDS: [Section, RegExp][] = [
  ['Frozen', /\bfrozen\b|\bice cream\b/],
  ['Spices', /\b(cumin|paprika|turmeric|cinnamon|nutmeg|oregano|thyme|rosemary dried|chili powder|chilli powder|chile powder|cayenne|coriander seed|garam masala|curry powder|clove|cardamom|allspice|bay lea|peppercorn|red pepper flake|chilli flake|chili flake|five spice|za.?atar|sumac|smoked paprika|onion powder|garlic powder|dried|salt|black pepper|vanilla)\b/],
  ['Meat & fish', /\b(chicken|beef|pork|lamb|turkey|bacon|sausage|ham|prosciutto|pancetta|chorizo|salmon|tuna|cod|halibut|shrimp|prawn|scallop|fish|anchov|steak|mince|ground (beef|pork|turkey|chicken)|thigh|breast|duck|crab|lobster|mussel|clam)/],
  ['Dairy & eggs', /\b(milk|butter|cream|cheese|parmesan|parmigiano|mozzarella|cheddar|feta|ricotta|mascarpone|yogurt|yoghurt|egg|eggs|buttermilk|ghee|creme fraiche|half and half)\b/],
  ['Bakery', /\b(bread|baguette|bun|buns|roll|rolls|tortilla|pita|naan|croissant|brioche|sourdough)\b/],
  ['Drinks', /\b(wine|beer|juice(?! of)|soda|sparkling|coffee|tea|sake|mirin|vermouth|bourbon|rum|vodka|brandy)\b/],
  ['Produce', /\b(lemon|lime|orange|apple|banana|berr|strawberr|blueberr|raspberr|grape|peach|pear|plum|cherr|mango|pineapple|avocado|tomato|potato|sweet potato|onion|shallot|scallion|green onion|spring onion|leek|garlic|ginger|carrot|celery|cucumber|zucchini|courgette|squash|pumpkin|eggplant|aubergine|pepper|chile|chili|chilli|jalapeno|broccoli|cauliflower|cabbage|kale|spinach|lettuce|arugula|rocket|chard|bok choy|mushroom|corn|pea|peas|green bean|asparagus|beet|radish|fennel|herb|basil|parsley|cilantro|coriander|mint|dill|chive|rosemary|sage|tarragon|lemongrass|bean sprout)/],
  ['Pantry', /\b(flour|sugar|oil|vinegar|rice|pasta|noodle|spaghetti|penne|bean|beans|lentil|chickpea|oat|oats|honey|syrup|molasses|stock|broth|sauce|paste|ketchup|mustard|mayo|mayonnaise|soy|tamari|miso|fish sauce|cornstarch|baking|yeast|cocoa|chocolate|nut|nuts|almond|walnut|pecan|peanut|cashew|seed|seeds|sesame|tahini|coconut|can|canned|crushed tomato|tomato paste|breadcrumb|panko|quinoa|couscous|polenta|cracker|raisin|dried fruit|jam|stock cube|bouillon)\b/],
];

/** Which aisle an ingredient is in, roughly. */
export function sectionFor(name: string): Section {
  const n = name.toLowerCase();
  for (const [section, re] of SECTION_WORDS) if (re.test(n)) return section;
  return 'Other';
}

/** Merge key: the words that say what it is ("2 large eggs, beaten" and "1 egg" both → "egg"). */
export function entryKey(e: Pick<ShoppingEntry, 'item' | 'rawText'>): string {
  const core = coreWords(e.item ?? e.rawText);
  return core.length ? core.join(' ') : (e.item ?? e.rawText).toLowerCase().trim();
}

const displayName = (e: ShoppingEntry) =>
  (e.item ?? e.rawText)
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/^((extra[- ])?large|medium|small|fresh|freshly)\s+/i, '') // the shop doesn't care
    .replace(/\s+/g, ' ')
    .trim();

/** Adds up a merged row's amounts: weights with weights, volumes with volumes, counts per unit. */
export function totalAmount(entries: ShoppingEntry[], system: UnitSystem): { amount: string | null; approx: boolean } {
  let grams = 0;
  let ml = 0;
  let approx = false;
  const counts = new Map<string, number>();
  let loose = 0; // lines with no amount ("salt to taste")

  for (const e of entries) {
    // Ranges: buy for the top of the range.
    const q = (e.quantityMax ?? e.quantity ?? 0) * e.factor;
    if (e.quantity == null) {
      loose++;
      continue;
    }
    if (e.weightGrams != null && (system === 'grams' || system === 'metric')) {
      grams += e.weightGrams * ((e.quantityMax ?? e.quantity) / e.quantity) * e.factor;
      continue;
    }
    const info = unitInfo(e.unit);
    if (!info) {
      const u = e.unit ? stem(e.unit.toLowerCase()) : '';
      counts.set(u, (counts.get(u) ?? 0) + q);
    } else if (info.kind === 'weight') {
      grams += q * info.base;
    } else if (system === 'grams' && densityFor(e.item) != null) {
      grams += q * info.base * densityFor(e.item)!;
      approx = true;
    } else {
      ml += q * info.base;
    }
  }

  const parts: string[] = [];
  const unitSystem = system === 'us' ? 'us' : 'metric';
  const say = (a: ReturnType<typeof presentAmount>) => (a ? `${a.amount}${a.unit ? ` ${a.unit}` : ''}` : null);
  if (grams > 0) parts.push(say(presentAmount(grams, null, 'g', 1, unitSystem))!);
  if (ml > 0) parts.push(say(presentAmount(ml, null, 'ml', 1, unitSystem))!);
  for (const [unit, n] of counts) {
    const original = entries.find((e) => e.unit && stem(e.unit.toLowerCase()) === unit)?.unit ?? null;
    parts.push(say(presentAmount(n, null, unit ? original : null, 1, unitSystem)) ?? formatQuantity(n));
  }
  if (!parts.length) return { amount: null, approx: false };
  if (loose) parts.push('more');
  return { amount: parts.join(' + '), approx };
}

/** Merged, sectioned rows. Unticked first within each section. */
export function buildRows(entries: ShoppingEntry[], system: UnitSystem): ShoppingRow[] {
  const groups = new Map<string, ShoppingEntry[]>();
  for (const e of entries) {
    const key = entryKey(e);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const rows: ShoppingRow[] = [];
  for (const [key, list] of groups) {
    const name = list.map(displayName).sort((a, b) => a.length - b.length)[0];
    const { amount, approx } = totalAmount(list, system);
    rows.push({
      key,
      name,
      amount,
      approx,
      section: sectionFor(name),
      entries: list,
      checked: list.every((e) => e.checked),
      recipes: [...new Set(list.map((e) => e.recipe?.title).filter((t): t is string => !!t))],
    });
  }
  const order = (s: Section) => SECTIONS.indexOf(s);
  return rows.sort((a, b) => order(a.section) - order(b.section) || Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name));
}

let counter = 0;
const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Entries for a typed line ("2 lemons", "milk"). */
export function entryFromText(text: string, recipe: ShoppingEntry['recipe'] = null): ShoppingEntry {
  const p = parseIngredientLine(text);
  return {
    id: newId(),
    rawText: p.rawText,
    item: p.item,
    quantity: p.quantity,
    quantityMax: p.quantityMax,
    unit: p.unit,
    weightGrams: null,
    factor: 1,
    recipe,
    checked: false,
    addedAt: Date.now(),
  };
}

/** Entries for a recipe's ingredient lines at a scale. */
export function entriesFromRecipe(
  recipe: { slug: string; title: string },
  lines: { rawText: string; item: string | null; quantity: number | null; quantityMax: number | null; unit: string | null; weightGrams: number | null }[],
  factor: number,
): ShoppingEntry[] {
  const now = Date.now();
  return lines.map((l) => ({
    id: newId(),
    rawText: l.rawText,
    item: l.item,
    quantity: l.quantity,
    quantityMax: l.quantityMax,
    unit: l.unit,
    weightGrams: l.weightGrams,
    factor,
    recipe: { slug: recipe.slug, title: recipe.title },
    checked: false,
    addedAt: now,
  }));
}

/** The list as plain text, for sharing or pasting into notes. */
export function listAsText(rows: ShoppingRow[]): string {
  const out: string[] = [];
  for (const section of SECTIONS) {
    const items = rows.filter((r) => r.section === section && !r.checked);
    if (!items.length) continue;
    out.push(section.toUpperCase());
    for (const r of items) out.push(`- ${r.amount ? `${r.amount} ` : ''}${r.name}`);
    out.push('');
  }
  return out.join('\n').trim();
}
