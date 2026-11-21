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
    cookedOn: date('cooked_on', { mode: 'string' }).notNull(),
    rating: smallint('rating'), // 1–5, optional
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cook_logs_recipe_idx').on(t.recipeId)],
);

// Relations power db.query.* lookups (the recipe page loads everything in one call).
export const peopleRelations = relations(people, ({ many }) => ({
  recipes: many(recipes),
  cookLogs: many(cookLogs),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  sourcePerson: one(people, { fields: [recipes.sourcePersonId], references: [people.id] }),
  ingredients: many(recipeIngredients),
  steps: many(recipeSteps),
  tags: many(recipeTags),
  cookLogs: many(cookLogs),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
}));

export const recipeStepsRelations = relations(recipeSteps, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeSteps.recipeId], references: [recipes.id] }),
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
}));
