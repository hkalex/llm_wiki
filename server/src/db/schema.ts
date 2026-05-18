import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
})

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  storagePath: text("storage_path").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const ingestQueue = sqliteTable("ingest_queue", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sourcePath: text("source_path").notNull(),
  status: text("status", { enum: ["pending", "processing", "done", "failed"] })
    .notNull()
    .default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export type User = typeof users.$inferSelect
export type Project = typeof projects.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Setting = typeof settings.$inferSelect
export type IngestQueueItem = typeof ingestQueue.$inferSelect
