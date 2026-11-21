// Shapes the API returns, shared by server and client.

export const SOURCE_TYPES = ['person', 'original', 'website', 'social', 'cookbook', 'other'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_LABELS: Record<SourceType, string> = {
  person: 'Friends & family',
  original: 'Originals',
  website: 'Websites',
  social: 'Instagram & TikTok',
  cookbook: 'Cookbooks',
  other: 'Other',
};

export const SEARCH_FIELDS = ['any', 'name', 'ingredient', 'source'] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export const SORTS = ['newest', 'oldest', 'name', 'most-made'] as const;
export type Sort = (typeof SORTS)[number];

export const ADDED_RANGES = ['any', 'month', 'year'] as const;
export type AddedRange = (typeof ADDED_RANGES)[number];

export type RecipeCard = {
  slug: string;
  title: string;
  sourceType: SourceType;
  source: string | null; // person's name, site, @handle or book
  createdAt: string; // ISO
  totalMinutes: number | null;
  photoUrl: string | null;
  madeCount: number;
  avgRating: number | null;
};

export type RecipeListResponse = { recipes: RecipeCard[]; total: number };

export type BrowseResponse = {
  total: number;
  sources: { sourceType: SourceType; count: number }[];
  people: { id: number; name: string; count: number }[];
};

export type IngredientLine = {
  id: number;
  groupLabel: string | null;
  rawText: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  item: string | null;
  note: string | null;
  weightGrams: number | null;
};

export type RecipeDetail = {
  slug: string;
  title: string;
  description: string | null;
  sourceType: SourceType;
  sourcePerson: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceNote: string | null;
  servings: number | null;
  yieldLabel: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  photoUrl: string | null;
  addedBy: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  ingredients: IngredientLine[];
  steps: { id: number; text: string; timerSeconds: number | null }[];
  cookLogs: { id: number; person: string | null; cookedOn: string; rating: number | null; note: string | null }[];
  madeCount: number;
  avgRating: number | null;
};
