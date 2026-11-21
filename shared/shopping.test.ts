import { describe, expect, it } from 'vitest';
import { buildRows, entriesFromRecipe, entryFromText, listAsText, sectionFor } from './shopping.js';
import { parseIngredientLine } from './parse.js';

const lines = (texts: string[]) =>
  texts.map((t) => {
    const p = parseIngredientLine(t);
    return { rawText: t, item: p.item, quantity: p.quantity, quantityMax: p.quantityMax, unit: p.unit, weightGrams: null };
  });

describe('shopping list', () => {
  const bars = entriesFromRecipe({ slug: 'bars', title: 'Lemon Bars' }, lines(['2 cups flour', '4 large eggs', '2 lemons, juiced', '1 cup butter']), 1);
  const cake = entriesFromRecipe({ slug: 'cake', title: 'Cake' }, lines(['1 cup flour', '2 eggs', '1/2 cup milk', 'Salt']), 2);

  it('merges the same ingredient across recipes and scales', () => {
    const rows = buildRows([...bars, ...cake], 'us');
    const flour = rows.find((r) => r.key === 'flour')!;
    expect(flour.amount).toBe('4 cups');
    expect(flour.recipes).toEqual(['Lemon Bars', 'Cake']);
    expect(rows.find((r) => r.key === 'egg')!.amount).toBe('8');
  });

  it('adds up in grams mode and sorts by aisle', () => {
    const rows = buildRows([...bars, ...cake], 'grams');
    expect(rows.find((r) => r.key === 'flour')!.amount).toBe('480 g');
    expect(rows.map((r) => r.section)).toEqual(['Produce', 'Dairy & eggs', 'Dairy & eggs', 'Dairy & eggs', 'Pantry', 'Spices']);
  });

  it('keeps typed items and mixes amounts it cannot add', () => {
    const rows = buildRows([entryFromText('milk'), entryFromText('1 cup milk')], 'us');
    expect(rows.length).toBe(1);
    expect(rows[0].amount).toBe('1 cup + more');
  });

  it('guesses aisles', () => {
    expect(['chicken thighs', 'cilantro', 'kosher salt', 'canned chickpeas', 'sourdough bread', 'frozen peas'].map(sectionFor)).toEqual([
      'Meat & fish', 'Produce', 'Spices', 'Pantry', 'Bakery', 'Frozen',
    ]);
  });

  it('writes a shareable text list without ticked items', () => {
    const entries = [...bars];
    entries[0] = { ...entries[0], checked: true };
    const text = listAsText(buildRows(entries, 'us'));
    expect(text).toBe('PRODUCE\n- 2 lemons\n\nDAIRY & EGGS\n- 1 cup butter\n- 4 eggs');
  });
});
