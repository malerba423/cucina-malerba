import { describe, expect, it } from 'vitest';
import { ingredientsForStep, stepParts } from './cook.js';
import { durationSpans } from './parse.js';

const lines = [
  { id: 1, item: 'boneless chicken thighs', rawText: '4 boneless chicken thighs' },
  { id: 2, item: 'soy sauce', rawText: '2 tbsp soy sauce' },
  { id: 3, item: 'olive oil', rawText: '2 tbsp olive oil' },
  { id: 4, item: 'garlic', rawText: '3 cloves garlic, minced' },
  { id: 5, item: 'oil', rawText: '1 tbsp oil' },
  { id: 6, item: null, rawText: 'Salt and pepper' },
];

describe('ingredientsForStep', () => {
  it('finds ingredients a step names', () => {
    expect(ingredientsForStep('Season the chicken with salt and pepper.', lines)).toEqual([1, 6]);
    expect(ingredientsForStep('Add the garlic and cook until fragrant.', lines)).toEqual([4]);
  });
  it('does not pull in specific ingredients from a general word', () => {
    expect(ingredientsForStep('Spoon the sauce over everything.', lines)).toEqual([]);
    expect(ingredientsForStep('Heat the oil in a large pan.', lines)).toEqual([5]);
    expect(ingredientsForStep('Drizzle with olive oil.', lines)).toEqual([3, 5]);
  });
});

describe('durations in steps', () => {
  it('finds every time, joining hours and minutes', () => {
    expect(durationSpans('Bake 1 hour 15 minutes, then rest 10 minutes.').map((s) => s.seconds)).toEqual([4500, 600]);
    expect(durationSpans('Simmer 10-12 mins').map((s) => s.seconds)).toEqual([720]);
  });
  it('splits a step into text and timer pieces', () => {
    expect(stepParts('Bake 20 minutes, then cool.')).toEqual(['Bake ', { text: '20 minutes', seconds: 1200 }, ', then cool.']);
    expect(stepParts('Stir well.')).toEqual(['Stir well.']);
  });
});
