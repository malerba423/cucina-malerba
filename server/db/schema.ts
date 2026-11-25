import { relations } from 'drizzle-orm';
import {
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// Milestone 1's smoke-test table. Harmless; kept so the first migration stays valid.
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sourceType = pgEnum('source_type', [
  'person', // Mom, Grandpa Lou...
  'original', // made up by one of us
  'website',
  'social', // Instagram, TikTok
  'cookbook',
  'other',
]);

// Who a recipe came from, or who cooked it. Signed-in users (milestone 3)
// will link to a person row, but most people here never sign in.
export const people = pgTable(
  'people',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('people_name_idx').on(t.name)],
);

export const recipes = pgTable(
  'recipes',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),

    sourceType: sourceType('source_type').notNull(),
    sourcePersonId: integer('source_person_id').references(() => people.id, { onDelete: 'set null' }),
    sourceName: text('source_name'), // site, @handle or book title
    sourceUrl: text('source_url'),
    sourceNote: text('source_note'), // "from Grandma Ruth's church cookbook, 1987"

    servings: doublePrecision('servings'), // the base amount the quantities are written for
    yieldLabel: text('yield_label'), // "servings", "bars", "cookies"
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    totalMinutes: integer('total_minutes'),

    photoUrl: text('photo_url'), // photo uploads arrive in milestone 4
    parentRecipeId: integer('parent_recipe_id'), // "variation of" (milestone 5)
    addedByUserId: integer('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), // = "date added"
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('recipes_slug_idx').on(t.slug),
    index('recipes_created_at_idx').on(t.createdAt),
    index('recipes_source_person_idx').on(t.sourcePersonId),
  ],
);

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: serial('id').primaryKey(),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    groupLabel: text('group_label'), // "For the crust"
    rawText: text('raw_text').notNull(), // always kept, so a bad parse never loses text
    quantity: doublePrecision('quantity'),
    quantityMax: doublePrecision('quantity_max'), // for ranges like 2–3
    unit: text('unit'),
    item: text('item'),
    note: text('note'),
    weightGrams: doublePrecision('weight_grams'), // exact weight for `quantity`, when known (beats density estimates)
  },
  (t) => [index('recipe_ingredients_recipe_idx').on(t.recipeId, t.position)],
);

export const recipeSteps = pgTable(
  'recipe_steps',
  {
    id: serial('id').primaryKey(),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    text: text('text').notNull(),
    timerSeconds: integer('timer_seconds'),
  },
  (t) => [index('recipe_steps_recipe_idx').on(t.recipeId, t.position)],
);

/** Helpful links for a recipe: a technique video, a how-to, anything worth having open while cooking. */
export const recipeLinks = pgTable(
  'recipe_links',
  {
    id: serial('id').primaryKey(),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title'),
    url: text('url').notNull(),
  },
  (t) => [index('recipe_links_recipe_idx').on(t.recipeId, t.position)],
);

export const tags = pgTable(
  'tags',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind'), // cuisine, meal, diet, time...
  },
  (t) => [uniqueIndex('tags_name_idx').on(t.name)],
);

export const recipeTags = pgTable(
  'recipe_tags',
  {
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.tagId] })],
);

// "I made this". The count and average rating are computed from these rows.
export const cookLogs = pgTable(
  'cook_logs',
  {
    id: serial('id').primaryKey(),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    personId: integer('person_id').references(() => people.id, { onDelete: 'set null' }),
    userId: integer('user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }), // who logged it (milestone 9)
    cookedOn: date('cooked_on', { mode: 'string' }).notNull(),
    rating: smallint('rating'), // 1–5, optional
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cook_logs_recipe_idx').on(t.recipeId)],
);

// Family notes and tweaks on a recipe ("less salt", "Mom adds brown butter"),
// kept separate from the recipe so nobody has to edit the original.
export const recipeNotes = pgTable(
  'recipe_notes',
  {
    id: serial('id').primaryKey(),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recipe_notes_recipe_idx').on(t.recipeId)],
);

// Shared family collections ("Thanksgiving", "Weeknight rotation").
export const collections = pgTable(
  'collections',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdByUserId: integer('created_by_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('collections_slug_idx').on(t.slug)],
);

// "Add to my recipes": a family member's personal pick of someone else's
// recipe. The recipe itself (its origin, who shared it) doesn't change.
export const savedRecipes = pgTable(
  'saved_recipes',
  {
    userId: integer('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.recipeId] }), index('saved_recipes_recipe_idx').on(t.recipeId)],
);

export const collectionRecipes = pgTable(
  'collection_recipes',
  {
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    addedByUserId: integer('added_by_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.recipeId] }), index('collection_recipes_recipe_idx').on(t.recipeId)],
);

// ---------- sign-in (milestone 3) ----------

export const userRole = pgEnum('user_role', ['owner', 'editor', 'contributor']);

// Invited family who can sign in. Never hard-deleted: removing someone sets
// removedAt, so their recipes and cook logs stay credited to them.
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(), // stored lowercase
    name: text('name').notNull(),
    role: userRole('role').notNull(),
    personId: integer('person_id').references(() => people.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
);

// Someone the owner has invited who hasn't signed in yet.
export const invites = pgTable(
  'invites',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** What the invite email calls them ("Hey smoochiekins!"); their first name when empty. */
    greeting: text('greeting'),
    role: userRole('role').notNull(),
    invitedByUserId: integer('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }), // null until the owner sends the invite email
  },
  (t) => [uniqueIndex('invites_email_idx').on(t.email)],
);

// One-time sign-in links. Only a SHA-256 hash of the token is stored.
export const loginTokens = pgTable(
  'login_tokens',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('login_tokens_hash_idx').on(t.tokenHash), index('login_tokens_email_idx').on(t.email)],
);

// Signed-in browsers. The cookie holds a random token; the table holds its hash.
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// Relations power db.query.* lookups (the recipe page loads everything in one call).
export const peopleRelations = relations(people, ({ many }) => ({
  recipes: many(recipes),
  cookLogs: many(cookLogs),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  sourcePerson: one(people, { fields: [recipes.sourcePersonId], references: [people.id] }),
  addedBy: one(users, { fields: [recipes.addedByUserId], references: [users.id] }),
  ingredients: many(recipeIngredients),
  steps: many(recipeSteps),
  links: many(recipeLinks),
  tags: many(recipeTags),
  cookLogs: many(cookLogs),
  notes: many(recipeNotes),
  collections: many(collectionRecipes),
}));

export const recipeNotesRelations = relations(recipeNotes, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeNotes.recipeId], references: [recipes.id] }),
  user: one(users, { fields: [recipeNotes.userId], references: [users.id] }),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  recipes: many(collectionRecipes),
}));

export const collectionRecipesRelations = relations(collectionRecipes, ({ one }) => ({
  collection: one(collections, { fields: [collectionRecipes.collectionId], references: [collections.id] }),
  recipe: one(recipes, { fields: [collectionRecipes.recipeId], references: [recipes.id] }),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
}));

export const recipeStepsRelations = relations(recipeSteps, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeSteps.recipeId], references: [recipes.id] }),
}));

export const recipeLinksRelations = relations(recipeLinks, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeLinks.recipeId], references: [recipes.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  recipes: many(recipeTags),
}));

export const recipeTagsRelations = relations(recipeTags, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeTags.recipeId], references: [recipes.id] }),
  tag: one(tags, { fields: [recipeTags.tagId], references: [tags.id] }),
}));

export const cookLogsRelations = relations(cookLogs, ({ one }) => ({
  recipe: one(recipes, { fields: [cookLogs.recipeId], references: [recipes.id] }),
  person: one(people, { fields: [cookLogs.personId], references: [people.id] }),
  user: one(users, { fields: [cookLogs.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  person: one(people, { fields: [users.personId], references: [people.id] }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
