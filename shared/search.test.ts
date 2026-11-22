import { describe, expect, it } from 'vitest';
import { covers, DEFAULT_STAPLES, fridgeMatches, monthBound, searchDocs, stem, words, type SearchDoc, type SearchParams } from './search.js';

let nextId = 1;
function doc(title: string, ingredients: string[], extra: Partial<SearchDoc> = {}): SearchDoc {
  return {
    id: nextId++,
    slug: title.toLowerCase().replace(/\W+/g, '-'),
    title,
    description: '',
    sourceType: 'person',
    sourceName: '',
    sourceNote: '',
    personId: null,
    personName: '',
    addedByUserId: null,
    createdAt: Date.UTC(2026, 5, 1),
    totalMinutes: null,
    photoUrl: null,
    madeCount: 0,
    avgRating: null,
    tags: [],
    ingredients: ingredients.map((rawText) => {
      const [line, group] = rawText.split(' @');
      return { item: line.replace(/^[\d/.\s]+(cups?|tbsp|tsp|lb|oz|g)?\s*/i, '').split(',')[0], rawText: line, groupLabel: group ?? null, note: null };
    }),
    ...extra,
  };
}

const params = (p: Partial<SearchParams> = {}): SearchParams => ({
  q: '',
  by: 'any',
  source: 'all',
  personId: null,
  addedFrom: null,
  addedTo: null,
  quick: new Set(),
  tags: [],
  ...p,
});

const box = [
  doc('Lemon Bars', ['2 cups flour', '1 cup butter', '4 eggs', '2 lemons, juiced'], { tags: ['dessert'], personName: 'Mom', personId: 7 }),
  doc('Eggplant Parmesan', ['2 eggplants', '1 cup parmesan', '2 cups tomato sauce']),
  doc('Chicken Piccata', ['4 chicken thighs', '1 lemon', '2 tbsp capers', 'salt and pepper', '2 tbsp olive oil'], { tags: ['weeknight'] }),
  doc('Bars with Lemon Glaze', ['1 cup sugar', '1 lemon'], { createdAt: Date.UTC(2026, 2, 15) }),
  doc('Shakshuka', ['6 eggs', '28 oz crushed tomatoes', '1 red bell pepper', 'freshly ground black pepper', 'Feta, to serve @To serve']),
];
const titles = (r: { doc: SearchDoc }[]) => r.map((x) => x.doc.title);

describe('words', () => {
  it('folds plurals and accents', () => {
    expect(['eggs', 'tomatoes', 'berries', 'cookies', 'peaches', 'glass'].map(stem)).toEqual(['egg', 'tomato', 'berri', 'cooki', 'peach', 'glass']);
    expect(stem('berry')).toBe('berri');
    expect(stem('cookie')).toBe('cooki');
    expect(words('Jalapeño & the Limes')).toEqual(['jalapeno', 'lime']);
  });
});

describe('searchDocs', () => {
  it('matches plurals and needs every word', () => {
    expect(titles(searchDocs(box, params({ q: 'tomato', by: 'ingredient' })))).toEqual(['Eggplant Parmesan', 'Shakshuka']);
    const full = (r: ReturnType<typeof searchDocs>) => titles(r.filter((h) => !h.missed.length));
    expect(full(searchDocs(box, params({ q: 'chicken, lemon', by: 'ingredient' })))).toEqual(['Chicken Piccata']);
  });
  it('does not let "egg" match eggplant, but lets a half-typed word match', () => {
    expect(titles(searchDocs(box, params({ q: 'egg', by: 'ingredient' }))).sort()).toEqual(['Lemon Bars', 'Shakshuka']);
    expect(titles(searchDocs(box, params({ q: 'shaksh' })))).toEqual(['Shakshuka']);
  });
  it('finds words in any order and ranks the exact name first', () => {
    const r = searchDocs(box, params({ q: 'lemon bars' }))
      .filter((h) => !h.missed.length)
      .sort((a, b) => b.score - a.score);
    expect(titles(r)).toEqual(['Lemon Bars', 'Bars with Lemon Glaze']);
  });
  it('adds partial matches for name and ingredient searches, not source', () => {
    const hits = searchDocs(box, params({ q: 'chicken lemon tarragon', by: 'ingredient' }));
    expect(hits.map((h) => [h.doc.title, h.missed])).toEqual([['Chicken Piccata', ['tarragon']]]);
    const two = searchDocs(box, params({ q: 'chicken tarragon', by: 'ingredient' }));
    expect(two.map((h) => h.doc.title)).toEqual(['Chicken Piccata']);
    expect(searchDocs(box, params({ q: 'mom dad', by: 'source' })).length).toBe(0);
  });
  it('filters to my recipes', () => {
    const saved = doc('Mom lemon bars', [], { addedByUserId: 2 });
    const mine = [doc('Mine A', [], { addedByUserId: 5 }), doc('My original', [], { sourceType: 'original', personId: 9 }), saved, doc('Other', [])];
    expect(titles(searchDocs(mine, params({ mine: { userId: 5, personId: 9, savedIds: new Set([saved.id]) } })))).toEqual([
      'Mine A',
      'My original',
      'Mom lemon bars',
    ]);
  });
  it('applies tag, person and month filters', () => {
    expect(titles(searchDocs(box, params({ tags: ['weeknight'] })))).toEqual(['Chicken Piccata']);
    expect(titles(searchDocs(box, params({ q: 'mom', by: 'source' })))).toEqual(['Lemon Bars']);
    const march = params({ addedFrom: monthBound('2026-03'), addedTo: monthBound('2026-03', true) });
    expect(titles(searchDocs(box, march))).toEqual(['Bars with Lemon Glaze']);
    expect(monthBound('2026-13')).toBeNull();
  });
});

describe('fridge', () => {
  const lists = (have: string[], staples = DEFAULT_STAPLES) => ({ have: have.map((h) => words(h)), staples: staples.map((s) => words(s)) });
  it('matches staples strictly and your items loosely', () => {
    const l = lists(['chicken']);
    expect(covers('freshly ground black pepper', l)).toBe('staple');
    expect(covers('red bell pepper', l)).toBe(null);
    expect(covers('salt and pepper', l)).toBe('staple');
    expect(covers('boneless chicken thighs', l)).toBe('have');
    expect(covers('kalamata olives', l)).toBe(null);
  });
  it('sorts recipes you can make first and lists what is missing', () => {
    const r = fridgeMatches(box, { have: ['chicken', 'lemon', 'capers'], staples: DEFAULT_STAPLES });
    expect(r[0].doc.title).toBe('Chicken Piccata');
    expect(r[0].missing).toEqual([]);
    expect(r.find((m) => m.doc.title === 'Bars with Lemon Glaze')?.missing).toEqual([]);
    expect(r.find((m) => m.doc.title === 'Lemon Bars')?.missing).toEqual(['1 cup butter', '4 eggs']);
  });
  it('skips garnishes and needs at least one of your items', () => {
    const r = fridgeMatches(box, { have: ['eggs', 'crushed tomatoes', 'bell pepper'], staples: DEFAULT_STAPLES });
    expect(r[0].doc.title).toBe('Shakshuka');
    expect(r[0].missing).toEqual([]);
    expect(fridgeMatches(box, { have: [], staples: DEFAULT_STAPLES })).toEqual([]);
  });
  it('can include recipes that need many more things', () => {
    expect(fridgeMatches(box, { have: ['capers'], staples: [] }, 2).length).toBe(0);
    const all = fridgeMatches(box, { have: ['capers'], staples: [] }, Infinity);
    expect(all.map((m) => [m.doc.title, m.missing.length])).toEqual([['Chicken Piccata', 4]]);
  });
});
