import fs from "fs"
import path from "path"
import { eq, and } from "drizzle-orm"
import { getDb } from "../db/database"
import { projects } from "../db/schema"
import type { Project } from "../db/schema"
import { config } from "../config"
import { NotFoundError, ConflictError, BadRequestError } from "../shared/errors"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "project"
}

function uniqueSlug(base: string, userId: string): string {
  const db = getDb()
  let slug = base
  let i = 1
  while (true) {
    const existing = db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
      .get()
    if (!existing) return slug
    slug = `${base}-${i++}`
  }
}

export function createProjectDirs(storagePath: string) {
  fs.mkdirSync(path.join(storagePath, "wiki"), { recursive: true })
  fs.mkdirSync(path.join(storagePath, "raw", "sources"), { recursive: true })
}

export function listProjects(userId: string): Project[] {
  const db = getDb()
  return db.select().from(projects).where(eq(projects.userId, userId)).all()
}

export function getProject(id: string, userId: string): Project {
  const db = getDb()
  const project = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get()
  if (!project) throw new NotFoundError("Project not found")
  return project
}

export function createProject(userId: string, name: string): Project {
  if (!name?.trim()) throw new BadRequestError("name is required")

  const db = getDb()
  const id = crypto.randomUUID()
  const slug = uniqueSlug(slugify(name), userId)
  const storagePath = path.join(config.storagePath, id)
  const now = Date.now()

  createProjectDirs(storagePath)

  db.insert(projects)
    .values({ id, userId, name: name.trim(), slug, storagePath, createdAt: now, updatedAt: now })
    .run()

  return db.select().from(projects).where(eq(projects.id, id)).get()!
}

export function deleteProject(id: string, userId: string): void {
  const project = getProject(id, userId)
  const db = getDb()
  db.delete(projects).where(eq(projects.id, id)).run()
  // Remove filesystem storage (best-effort)
  fs.rm(project.storagePath, { recursive: true, force: true }, () => {})
}

export function assertProjectAccess(id: string, userId: string): Project {
  return getProject(id, userId)
}
