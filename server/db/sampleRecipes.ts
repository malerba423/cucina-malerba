// Sample recipes so the pages have something to show before real imports
// exist (milestones 4–5). Every one is marked as a sample; remove them all
// with `npm run db:seed -- --remove`.

export type SampleIngredient = {
  raw: string;
  qty?: number;
  max?: number;
  unit?: string;
  item: string;
  note?: string;
  group?: string;
};

export type SampleRecipe = {
  slug: string;
  title: string;
  description: string;
  sourceType: 'person' | 'original' | 'website' | 'social' | 'cookbook' | 'other';
  sourcePerson?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceNote?: string;
  servings: number;
  yieldLabel: string;
  prepMinutes?: number;
  cookMinutes?: number;
  totalMinutes?: number;
  addedDaysAgo: number;
  tags: string[];
  ingredients: SampleIngredient[];
  steps: { text: string; timerSeconds?: number }[];
  cookLogs: { person: string; daysAgo: number; rating?: number; note?: string }[];
};

const SAMPLE = 'Sample recipe: replace with the real thing.';

export const SAMPLE_RECIPES: SampleRecipe[] = [
  {
    slug: 'sample-lemon-bars',
    title: "Mom's Lemon Bars",
    description: SAMPLE,
    sourceType: 'person',
    sourcePerson: 'Mom',
    sourceNote: 'from a church cookbook, 1987',
    servings: 24,
    yieldLabel: 'bars',
    prepMinutes: 20,
    cookMinutes: 45,
    totalMinutes: 75,
    addedDaysAgo: 110,
    tags: ['dessert', 'baking'],
    ingredients: [
      { group: 'For the crust', raw: '2 cups all-purpose flour', qty: 2, unit: 'cup', item: 'all-purpose flour' },
      { group: 'For the crust', raw: '1/2 cup powdered sugar, plus more for dusting', qty: 0.5, unit: 'cup', item: 'powdered sugar', note: 'plus more for dusting' },
      { group: 'For the crust', raw: '1 cup butter, softened', qty: 1, unit: 'cup', item: 'butter', note: 'softened' },
      { group: 'For the filling', raw: '4 eggs', qty: 4, item: 'eggs' },
      { group: 'For the filling', raw: '1 1/2 cups sugar', qty: 1.5, unit: 'cup', item: 'sugar' },
      { group: 'For the filling', raw: '2/3 cup fresh lemon juice', qty: 2 / 3, unit: 'cup', item: 'fresh lemon juice' },
      { group: 'For the filling', raw: '1 tbsp lemon zest', qty: 1, unit: 'tbsp', item: 'lemon zest' },
      { group: 'For the filling', raw: '1/4 cup flour', qty: 0.25, unit: 'cup', item: 'flour' },
    ],
    steps: [
      { text: 'Heat the oven to 350°F. Line a 9×13 pan with parchment.' },
      { text: 'Mix the flour, powdered sugar and butter; press evenly into the pan.' },
      { text: 'Bake the crust until just golden at the edges.', timerSeconds: 20 * 60 },
      { text: 'Whisk the eggs, sugar, lemon juice, zest and flour. Pour over the hot crust.' },
      { text: 'Bake until the center barely jiggles. Cool completely, then dust with powdered sugar.', timerSeconds: 25 * 60 },
    ],
    cookLogs: [
      { person: 'Joel', daysAgo: 50, rating: 5, note: 'Meyer lemons and extra zest. Best batch yet.' },
      { person: 'Mom', daysAgo: 92, rating: 5, note: 'Doubled it for the reunion; 5 extra minutes in the oven.' },
      { person: 'Mom', daysAgo: 200, rating: 4 },
    ],
  },
  {
    slug: 'sample-sunday-gravy',
    title: "Grandpa Lou's Sunday Gravy",
    description: SAMPLE,
    sourceType: 'person',
    sourcePerson: 'Grandpa Lou',
    servings: 8,
    yieldLabel: 'servings',
    prepMinutes: 30,
    cookMinutes: 210,
    totalMinutes: 240,
    addedDaysAgo: 22,
    tags: ['italian', 'dinner', 'make-ahead'],
    ingredients: [
      { raw: '2 lb pork spare ribs', qty: 2, unit: 'lb', item: 'pork spare ribs' },
      { raw: '1 lb Italian sausage', qty: 1, unit: 'lb', item: 'Italian sausage' },
      { raw: '3 tbsp olive oil', qty: 3, unit: 'tbsp', item: 'olive oil' },
      { raw: '6 cloves garlic, sliced', qty: 6, unit: 'clove', item: 'garlic', note: 'sliced' },
      { raw: '2 (28 oz) cans whole San Marzano tomatoes', qty: 2, unit: 'can', item: 'whole San Marzano tomatoes', note: '28 oz each' },
      { raw: '1 small bunch basil', qty: 1, unit: 'bunch', item: 'basil' },
      { raw: 'Salt and pepper', item: 'salt and pepper' },
    ],
    steps: [
      { text: 'Brown the ribs and sausage in the olive oil in a large pot. Set aside.' },
      { text: 'Lower the heat, add the garlic and cook until fragrant.', timerSeconds: 60 },
      { text: 'Crush in the tomatoes with their juice, add the meat back and the basil stems.' },
      { text: 'Simmer, partly covered, stirring now and then.', timerSeconds: 3 * 60 * 60 },
      { text: 'Season, tear in the basil leaves, and serve over pasta with the meat on the side.' },
    ],
    cookLogs: [{ person: 'Joel', daysAgo: 8, rating: 5 }],
  },
  {
    slug: 'sample-miso-butter-salmon',
    title: 'Miso Butter Salmon',
    description: SAMPLE,
    sourceType: 'social',
    sourceName: '@sample_kitchen',
    servings: 2,
    yieldLabel: 'servings',
    totalMinutes: 25,
    addedDaysAgo: 6,
    tags: ['fish', 'weeknight'],
    ingredients: [
      { raw: '2 salmon fillets', qty: 2, item: 'salmon fillets' },
      { raw: '2 tbsp white miso', qty: 2, unit: 'tbsp', item: 'white miso' },
      { raw: '2 tbsp butter, softened', qty: 2, unit: 'tbsp', item: 'butter', note: 'softened' },
      { raw: '1 tsp honey', qty: 1, unit: 'tsp', item: 'honey' },
      { raw: '1 lemon', qty: 1, item: 'lemon' },
      { raw: '2 scallions, sliced', qty: 2, item: 'scallions', note: 'sliced' },
    ],
    steps: [
      { text: 'Heat the oven to 400°F. Mash the miso, butter and honey into a paste.' },
      { text: 'Pat the salmon dry and spread the paste over the top.' },
      { text: 'Bake until just cooked through.', timerSeconds: 11 * 60 },
      { text: 'Broil until the top chars a little; finish with lemon and scallions.', timerSeconds: 2 * 60 },
    ],
    cookLogs: [],
  },
  {
    slug: 'sample-weeknight-khao-soi',
    title: 'Weeknight Khao Soi',
    description: SAMPLE,
    sourceType: 'original',
    sourcePerson: 'Joel',
    servings: 4,
    yieldLabel: 'servings',
    totalMinutes: 45,
    addedDaysAgo: 55,
    tags: ['thai', 'noodles', 'dinner'],
    ingredients: [
      { raw: '1 1/2 lb chicken thighs', qty: 1.5, unit: 'lb', item: 'chicken thighs' },
      { raw: '3 tbsp red curry paste', qty: 3, unit: 'tbsp', item: 'red curry paste' },
      { raw: '1 tsp curry powder', qty: 1, unit: 'tsp', item: 'curry powder' },
      { raw: '2 (13.5 oz) cans coconut milk', qty: 2, unit: 'can', item: 'coconut milk', note: '13.5 oz each' },
      { raw: '2 cups chicken stock', qty: 2, unit: 'cup', item: 'chicken stock' },
      { raw: '2 tbsp fish sauce', qty: 2, unit: 'tbsp', item: 'fish sauce' },
      { raw: '12 oz egg noodles', qty: 12, unit: 'oz', item: 'egg noodles' },
      { raw: 'Lime, shallots and cilantro, to serve', item: 'lime, shallots and cilantro', note: 'to serve' },
    ],
    steps: [
      { text: 'Fry the curry paste and curry powder in a splash of the coconut cream until fragrant.', timerSeconds: 2 * 60 },
      { text: 'Add the chicken, the rest of the coconut milk, the stock and fish sauce. Simmer.', timerSeconds: 25 * 60 },
      { text: 'Shred the chicken. Cook the noodles, saving a handful to fry crisp.' },
      { text: 'Serve the noodles in the broth with lime, shallots, cilantro and the crispy noodles.' },
    ],
    cookLogs: [
      { person: 'Joel', daysAgo: 12, rating: 4 },
      { person: 'Joel', daysAgo: 40, rating: 4, note: 'More lime next time.' },
    ],
  },
  {
    slug: 'sample-brown-butter-cookies',
    title: 'Brown Butter Chocolate Chip Cookies',
    description: SAMPLE,
    sourceType: 'website',
    sourceName: 'sample-recipes.example',
    servings: 18,
    yieldLabel: 'cookies',
    prepMinutes: 25,
    cookMinutes: 12,
    totalMinutes: 60,
    addedDaysAgo: 38,
    tags: ['dessert', 'baking'],
    ingredients: [
      { raw: '1 cup butter', qty: 1, unit: 'cup', item: 'butter' },
      { raw: '1 cup dark brown sugar', qty: 1, unit: 'cup', item: 'dark brown sugar' },
      { raw: '1/2 cup sugar', qty: 0.5, unit: 'cup', item: 'sugar' },
      { raw: '2 eggs', qty: 2, item: 'eggs' },
      { raw: '2 tsp vanilla', qty: 2, unit: 'tsp', item: 'vanilla' },
      { raw: '2 1/4 cups flour', qty: 2.25, unit: 'cup', item: 'flour' },
      { raw: '1 tsp baking soda', qty: 1, unit: 'tsp', item: 'baking soda' },
      { raw: '8 oz dark chocolate, chopped', qty: 8, unit: 'oz', item: 'dark chocolate', note: 'chopped' },
      { raw: 'Flaky salt', item: 'flaky salt' },
    ],
    steps: [
      { text: 'Brown the butter until it smells nutty; cool for 10 minutes.', timerSeconds: 10 * 60 },
      { text: 'Whisk in both sugars, then the eggs and vanilla.' },
      { text: 'Stir in the flour and baking soda, then the chocolate. Chill the dough.', timerSeconds: 30 * 60 },
      { text: 'Bake at 350°F until the edges set; sprinkle with flaky salt.', timerSeconds: 12 * 60 },
    ],
    cookLogs: [
      { person: 'Joel', daysAgo: 20, rating: 5 },
      { person: 'Joel', daysAgo: 30, rating: 4 },
    ],
  },
  {
    slug: 'sample-chickpea-spinach-stew',
    title: 'Chickpea & Spinach Stew',
    description: SAMPLE,
    sourceType: 'cookbook',
    sourceName: 'A sample cookbook',
    servings: 4,
    yieldLabel: 'servings',
    totalMinutes: 30,
    addedDaysAgo: 125,
    tags: ['vegetarian', 'weeknight'],
    ingredients: [
      { raw: '2 tbsp olive oil', qty: 2, unit: 'tbsp', item: 'olive oil' },
      { raw: '1 onion, diced', qty: 1, item: 'onion', note: 'diced' },
      { raw: '3 cloves garlic', qty: 3, unit: 'clove', item: 'garlic' },
      { raw: '1 tsp smoked paprika', qty: 1, unit: 'tsp', item: 'smoked paprika' },
      { raw: '2 (15 oz) cans chickpeas, drained', qty: 2, unit: 'can', item: 'chickpeas', note: 'drained' },
      { raw: '1 (14 oz) can diced tomatoes', qty: 1, unit: 'can', item: 'diced tomatoes' },
      { raw: '5 oz baby spinach', qty: 5, unit: 'oz', item: 'baby spinach' },
      { raw: '4 oz feta', qty: 4, unit: 'oz', item: 'feta' },
    ],
    steps: [
      { text: 'Soften the onion in the olive oil.', timerSeconds: 6 * 60 },
      { text: 'Add the garlic and paprika, then the chickpeas and tomatoes. Simmer.', timerSeconds: 15 * 60 },
      { text: 'Stir in the spinach until wilted; crumble the feta over the top.' },
    ],
    cookLogs: [{ person: 'Joel', daysAgo: 70, rating: 4 }],
  },
];
