import { describe, expect, it } from 'vitest';
import { validateRecipeInput } from './recipeInput.js';

const base = {
  title: '  Lemon Bars ',
  sourceType: 'person',
  sourcePersonName: 'Mom',
  servings: '24',
  ingredients: [{ rawText: '2 cups flour', quantity: 2, unit: 'cup', item: 'flour' }, { rawText: '  ' }],
  steps: [{ text: 'Bake 20 minutes', timerSeconds: 1200 }, { text: '' }],
  tags: ['Dessert', 'dessert', ' baking '],
};

describe('validateRecipeInput', () => {
  it('cleans a good recipe', () => {
    const r = validateRecipeInput(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.title).toBe('Lemon Bars');
    expect(r.value.servings).toBe(24);
    expect(r.value.ingredients.length).toBe(1);
    expect(r.value.steps.length).toBe(1);
    expect(r.value.tags).toEqual(['dessert', 'baking']);
  });

  it('requires a name, a source, an ingredient and a step', () => {
    const r = validateRecipeInput({ sourceType: 'person', ingredients: [], steps: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['ingredients', 'sourcePersonName', 'steps', 'title']);
  });

  it('rejects bad numbers and unknown source types', () => {
    const r = validateRecipeInput({ ...base, servings: 'lots', sourceType: 'magazine' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.servings).toBe('Use a number');
    expect(r.errors.sourceType).toBe('Pick where it came from');
  });

  it('adds https:// to bare links', () => {
    const r = validateRecipeInput({ ...base, sourceType: 'website', sourceUrl: 'example.com/pie' });
    expect(r.ok && r.value.sourceUrl).toBe('https://example.com/pie');
  });

  it('keeps helpful links, skipping blanks and fixing bare addresses', () => {
    const r = validateRecipeInput({
      ...base,
      links: [{ title: ' Roux how-to ', url: 'youtube.com/watch?v=abc' }, { title: 'empty', url: '  ' }, { url: 'https://example.com/a' }],
    });
    expect(r.ok && r.value.links).toEqual([
      { title: 'Roux how-to', url: 'https://youtube.com/watch?v=abc' },
      { title: null, url: 'https://example.com/a' },
    ]);
  });

  it('flags a link that is not a web address', () => {
    const r = validateRecipeInput({ ...base, links: [{ title: 'x', url: 'not a link' }] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.links).toMatch(/doesn't look like a link/);
  });

  it('only accepts photos from our own storage', () => {
    expect(validateRecipeInput({ ...base, photoUrl: 'https://evil.example/x.jpg' }, ['/media/']).ok).toBe(false);
    expect(validateRecipeInput({ ...base, photoUrl: '/media/recipes/abc.webp' }, ['/media/']).ok).toBe(true);
  });

  it('drops the person for sources that are not people', () => {
    const r = validateRecipeInput({ ...base, sourceType: 'cookbook', sourceName: 'Simple' });
    expect(r.ok && r.value.sourcePersonName).toBe(null);
  });
});
