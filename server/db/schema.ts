import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Milestone 1 only needs one tiny table to prove migrations run end to end.
// The real tables (recipes, users, ingredients...) arrive in milestones 2-3.
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
