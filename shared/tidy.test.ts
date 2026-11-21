import { describe, expect, it } from 'vitest';
import { cleanResult } from './tidy.js';

describe('cleanResult', () => {
  it('keeps a well-formed answer', () => {
    const r = cleanResult({
      title: 'Lemon Bars',
      description: 'Tangy.',
      servings: 16,
      yieldLabel: 'bars',
      prepMinutes: 20,
      cookMinutes: null,
      ingredients: ['For the crust:', '2 cups flour'],
      steps: ['Heat the oven to 350°F.'],
      tags: ['Dessert', 'dessert'],
      notes: '',
    });
    expect(r.title).toBe('Lemon Bars');
    expect(r.servings).toBe(16);
    expect(r.ingredients).toEqual(['For the crust:', '2 cups flour']);
    expect(r.tags).toEqual(['dessert']);
    expect(r.cookMinutes).toBeNull();
  });
  it('treats a strange answer as untrusted input', () => {
    const r = cleanResult({ title: 42, servings: -3, prepMinutes: 'soon', ingredients: ['  ', 7, 'x'.repeat(500)], steps: 'not a list' });
    expect(r.title).toBe('');
    expect(r.servings).toBeNull();
    expect(r.prepMinutes).toBeNull();
    expect(r.ingredients.length).toBe(1);
    expect(r.ingredients[0].length).toBe(200);
    expect(r.steps).toEqual([]);
  });
});
