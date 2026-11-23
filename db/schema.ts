import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const people = sqliteTable("people", {
  id: text().primaryKey(),
  name: text().notNull(),
  session_hash: text().notNull().unique(),
});

export const entries = sqliteTable("entries", {
  id: text().primaryKey(),
  name: text().notNull(),
  name_key: text().notNull().unique(),
  kind: text({ enum: ["red", "black"] }).notNull(),
  author_id: text().notNull().references(() => people.id),
  created_at: integer().notNull(),
}, (table) => [check("entry_kind", sql.raw("kind IN ('red', 'black')"))]);

export const reviews = sqliteTable("reviews", {
  entry_id: text().notNull().references(() => entries.id, { onDelete: "cascade" }),
  author_id: text().notNull().references(() => people.id),
  note: text().notNull().default(""),
  rating: integer(),
  vote: integer().notNull().default(0),
  updated_at: integer().notNull(),
}, (table) => [
  primaryKey({ columns: [table.entry_id, table.author_id] }),
  index("reviews_author").on(table.author_id),
  check("review_rating", sql.raw("rating BETWEEN 1 AND 10")),
  check("review_vote", sql.raw("vote IN (-1, 0, 1)")),
]);
