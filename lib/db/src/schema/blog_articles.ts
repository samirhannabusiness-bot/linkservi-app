import { pgTable, text, serial, boolean, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const blogArticlesTable = pgTable("blog_articles", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull(),
  contentMd: text("content_md").notNull(),
  coverImageUrl: text("cover_image_url"),
  coverAlt: text("cover_alt"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  category: text("category").notNull().default("servicios"),
  tags: text("tags").array().notNull().default([]),
  vertical: text("vertical").notNull().default("servicios"),
  authorId: integer("author_id").references(() => usersTable.id),
  authorName: text("author_name").notNull().default("Equipo LinkServi"),
  readMinutes: integer("read_minutes").notNull().default(3),
  views: integer("views").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("blog_articles_slug_idx").on(table.slug),
  index("blog_articles_published_idx").on(table.isPublished),
  index("blog_articles_vertical_idx").on(table.vertical),
  index("blog_articles_published_at_idx").on(table.publishedAt),
]);

export const insertBlogArticleSchema = createInsertSchema(blogArticlesTable).omit({
  id: true,
  views: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBlogArticle = z.infer<typeof insertBlogArticleSchema>;
export type BlogArticle = typeof blogArticlesTable.$inferSelect;
