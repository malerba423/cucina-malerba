import { describe, expect, it } from 'vitest';
import { detectTimer, ingredientsToText, parseIngredientLine, parseIngredientText, parseStepText, slugify } from './parse.js';

const p = (s: string) => {
  const { quantity, quantityMax, unit, item, note } = parseIngredientLine(s);
  return { quantity, quantityMax, unit, item, note };
};

describe('parseIngredientLine', () => {
  it('reads amount, unit, item and note', () => {
    expect(p('1 1/2 cups flour, sifted')).toEqual({ quantity: 1.5, quantityMax: null, unit: 'cup', item: 'flour', note: 'sifted' });
    expect(p('2 tbsp white miso')).toEqual({ quantity: 2, quantityMax: null, unit: 'tbsp', item: 'white miso', note: null });
    expect(p('1/2 tsp. salt')).toEqual({ quantity: 0.5, quantityMax: null, unit: 'tsp', item: 'salt', note: null });
    expect(p('1 lb. ground beef')).toEqual({ quantity: 1, quantityMax: null, unit: 'lb', item: 'ground beef', note: null });
  });
  it('understands fraction characters', () => {
    expect(p('½ cup sugar').quantity).toBe(0.5);
    expect(p('1½ cups milk').quantity).toBe(1.5);
    expect(p('⅔ cup lemon juice').quantity).toBeCloseTo(2 / 3);
  });
  it('reads ranges', () => {
    expect(p('1-2 tbsp honey')).toMatchObject({ quantity: 1, quantityMax: 2, unit: 'tbsp', item: 'honey' });
    expect(p('2 to 3 cloves garlic')).toMatchObject({ quantity: 2, quantityMax: 3, unit: 'clove', item: 'garlic' });
  });
  it('reads metric units written against the number', () => {
    expect(p('200g flour')).toMatchObject({ quantity: 200, unit: 'g', item: 'flour' });
    expect(p('250 ml whole milk')).toMatchObject({ quantity: 250, unit: 'ml', item: 'whole milk' });
  });
  it('keeps counted units and package sizes', () => {
    expect(p('3 cloves garlic, minced')).toEqual({ quantity: 3, quantityMax: null, unit: 'clove', item: 'garlic', note: 'minced' });
    expect(p('2 (28 oz) cans whole San Marzano tomatoes')).toEqual({
      quantity: 2,
      quantityMax: null,
      unit: 'can',
      item: 'whole San Marzano tomatoes',
      note: '28 oz',
    });
    expect(p('1 cup (240 ml) milk')).toMatchObject({ quantity: 1, unit: 'cup', item: 'milk', note: '240 ml' });
    expect(p('a pinch of salt')).toMatchObject({ quantity: 1, unit: 'pinch', item: 'salt' });
  });
  it('treats size words as part of the item', () => {
    expect(p('2 large eggs')).toEqual({ quantity: 2, quantityMax: null, unit: null, item: 'large eggs', note: null });
  });
  it('leaves lines without an amount as plain items', () => {
    expect(p('Salt and pepper, to taste')).toEqual({ quantity: null, quantityMax: null, unit: null, item: 'Salt and pepper', note: 'to taste' });
    expect(p('zest of 1 lemon')).toMatchObject({ quantity: null, item: 'zest of 1 lemon' });
  });
  it('strips bullets and keeps the original text', () => {
    const r = parseIngredientLine('• 4 eggs');
    expect(r.rawText).toBe('4 eggs');
    expect(r.quantity).toBe(4);
  });
});

describe('parseIngredientText', () => {
  it('groups lines under headers and skips blanks', () => {
    const { lines } = parseIngredientText('For the crust:\n2 cups flour\n\n# Filling\n4 eggs\n');
    expect(lines.map((l) => [l.groupLabel, l.item])).toEqual([
      ['For the crust', 'flour'],
      ['Filling', 'eggs'],
    ]);
  });
  it('round-trips through ingredientsToText', () => {
    const text = 'For the crust:\n2 cups flour\n\nFor the filling:\n4 eggs';
    const { lines } = parseIngredientText(text);
    expect(ingredientsToText(lines)).toBe(text);
  });
});

describe('steps and timers', () => {
  it('detects the first duration', () => {
    expect(detectTimer('Bake until golden, about 20 minutes.')).toBe(1200);
    expect(detectTimer('Simmer 10–12 minutes')).toBe(720);
    expect(detectTimer('Braise for 1 hour 15 minutes')).toBe(4500);
    expect(detectTimer('Rest 30 secs')).toBe(30);
    expect(detectTimer('Season to taste')).toBeNull();
  });
  it('splits steps one per line and drops numbering', () => {
    expect(parseStepText('1. Heat oven\n\nStep 2: Mix 5 min\n3) Bake')).toEqual([
      { text: 'Heat oven', timerSeconds: null },
      { text: 'Mix 5 min', timerSeconds: 300 },
      { text: 'Bake', timerSeconds: null },
    ]);
  });
});

describe('slugify', () => {
  it('makes readable URL slugs', () => {
    expect(slugify("Mom's Lemon Bars!")).toBe('moms-lemon-bars');
    expect(slugify('Crème brûlée')).toBe('creme-brulee');
    expect(slugify('!!!')).toBe('recipe');
  });
});

describe('mixed numbers written with a hyphen', () => {
  it('reads "1-3/4cups" as 1¾ cups, not a range', () => {
    const l = parseIngredientLine('1-3/4cups all-purpose flour');
    expect([l.quantity, l.quantityMax, l.unit, l.item]).toEqual([1.75, null, 'cup', 'all-purpose flour']);
    expect(parseIngredientLine('2-½ tbsp sugar').quantity).toBe(2.5);
  });
  it('keeps real ranges', () => {
    const a = parseIngredientLine('1-2 cups stock');
    expect([a.quantity, a.quantityMax]).toEqual([1, 2]);
    const b = parseIngredientLine('1/2-3/4 cup milk');
    expect([b.quantity, b.quantityMax]).toEqual([0.5, 0.75]);
  });
});

