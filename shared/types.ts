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

export const ADDED_RANGES = ['any', 'month', 'year', 'custom'] as const;
export type AddedRange = (typeof ADDED_RANGES)[number];

export type RecipeCard = {
  slug: string;
  title: string;
  sourceType: SourceType;
  source: string | null; // person's name, site, @handle or book
  /** Who it's credited to ("Joel"), shown as "Joel's" on the card. */
  credit: string | null;
  createdAt: string; // ISO
  totalMinutes: number | null;
  photoUrl: string | null;
  madeCount: number;
  avgRating: number | null;
  /** Search words this recipe didn't match (partial matches only). */
  missed?: string[];
};

/** `recipes` lists full matches first; the first `fullCount` match every word. */
export type RecipeListResponse = { recipes: RecipeCard[]; total: number; fullCount: number };

export type BrowseResponse = {
  total: number;
  sources: { sourceType: SourceType; count: number }[];
  people: { id: number; name: string; count: number }[];
  tags: { name: string; count: number }[];
  /** Signed in only: how many recipes are "mine". */
  mine: number | null;
};

/** Fridge mode: recipes you can make now, with a couple of things more, or that at least use what you have. */
export type FridgeHit = { recipe: RecipeCard; matched: number; missing: string[] };
export type FridgeResponse = { ready: FridgeHit[]; close: FridgeHit[]; more: FridgeHit[] };

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
  links: { id: number; title: string | null; url: string }[];
  cookLogs: { id: number; person: string | null; userId: number | null; cookedOn: string; rating: number | null; note: string | null }[];
  notes: RecipeNote[];
  /** Set when this recipe is a variation of another. */
  parent: { slug: string; title: string } | null;
  variations: { slug: string; title: string; addedBy: string | null }[];
  collections: { slug: string; name: string }[];
  /** Signed in: whether this person has added it to their own recipes. */
  saved: boolean;
  madeCount: number;
  avgRating: number | null;
};

export type RecipeNote = { id: number; text: string; author: string | null; userId: number | null; createdAt: string; updatedAt: string };

export type CollectionSummary = {
  slug: string;
  name: string;
  description: string | null;
  recipeCount: number;
  photos: string[]; // up to 4, for the cover
  createdBy: { id: number; name: string } | null;
};
export type CollectionListResponse = { collections: CollectionSummary[] };
export type CollectionDetail = CollectionSummary & { recipes: RecipeCard[] };
