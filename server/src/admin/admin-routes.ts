import fs from "fs"
import path from "path"
import type { FastifyPluginAsync } from "fastify"
import bcrypt from "bcryptjs"
import { eq, like, and, count } from "drizzle-orm"
import { getDb } from "../db/database"
import { users, projects, settings, sessions, ingestQueue } from "../db/schema"
import type { Project } from "../db/schema"
import { requireAuth } from "../auth/auth-middleware"
import { requireAdmin } from "./admin-middleware"
import { getSettings, patchSettings } from "../settings/settings-service"
import { abortItem, kickWorker } from "../ingest/ingest-service"
import { getSystemSettings, patchSystemSettings } from "./system-settings"
import { NotFoundError, BadRequestError } from "../shared/errors"
import { config } from "../config"

const preHandler = [requireAuth, requireAdmin]

// ── Drain flag ────────────────────────────────────────────────────────────────
// Exposed to ingest-service via module boundary in ingest-service.ts

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeUser(user: typeof users.$inferSelect & { projectCount?: number }) {
  const { passwordHash: _, ...rest } = user
  return rest
}

function dirSize(dirPath: string): number {
  let total = 0
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dirPath, e.name)
      if (e.isDirectory()) {
        total += dirSize(full)
      } else {
        try { total += fs.statSync(full).size } catch { /* ignore */ }
      }
    }
  } catch { /* ignore missing dir */ }
  return total
}

function countFiles(dirPath: string): number {
  let total = 0
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory()) {
        total += countFiles(path.join(dirPath, e.name))
      } else {
        total++
      }
    }
  } catch { /* ignore */ }
  return total
}

function projectWithOwner(project: Project, ownerEmail: string) {
  const wikiDir = path.join(project.storagePath, "wiki")
  const sourcesDir = path.join(project.storagePath, "raw", "sources")
  return {
    ...project,
    ownerEmail,
    pageCount: countFiles(wikiDir),
    sourceCount: countFiles(sourcesDir),
    storageBytes: dirSize(project.storagePath),
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Stats ──────────────────────────────────────────────────────────────────

  fastify.get("/stats", { preHandler }, async () => {
    const db = getDb()
    const allUsers = db.select().from(users).all()
    const totalProjects = db.select().from(projects).all().length
    const queue = db.select().from(ingestQueue).all()

    return {
      users: {
        total: allUsers.length,
        active: allUsers.filter((u) => u.status === "active").length,
        suspended: allUsers.filter((u) => u.status === "suspended").length,
        admin: allUsers.filter((u) => u.role === "admin").length,
      },
      projects: { total: totalProjects },
      ingest: {
        pending: queue.filter((i) => i.status === "pending").length,
        processing: queue.filter((i) => i.status === "processing").length,
        failed: queue.filter((i) => i.status === "failed").length,
      },
    }
  })

  // ── User management ────────────────────────────────────────────────────────

  fastify.get<{ Querystring: { search?: string; role?: string; status?: string; page?: string; limit?: string } }>(
    "/users",
    { preHandler },
    async (request) => {
      const db = getDb()
      const { search, role, status, page = "1", limit = "20" } = request.query
      const pageNum = Math.max(1, parseInt(page, 10))
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)))

      let allUsers = db.select().from(users).all()

      if (search) {
        const q = search.toLowerCase()
        allUsers = allUsers.filter((u) => u.email.includes(q) || u.displayName.toLowerCase().includes(q))
      }
      if (role) allUsers = allUsers.filter((u) => u.role === role)
      if (status) allUsers = allUsers.filter((u) => u.status === status)

      const total = allUsers.length
      const slice = allUsers.slice((pageNum - 1) * limitNum, pageNum * limitNum)

      const userIds = slice.map((u) => u.id)
      const projectCounts: Record<string, number> = {}
      for (const uid of userIds) {
        projectCounts[uid] = db.select().from(projects).where(eq(projects.userId, uid)).all().length
      }

      return {
        users: slice.map((u) => ({ ...safeUser(u), projectCount: projectCounts[u.id] ?? 0 })),
        total,
        page: pageNum,
        limit: limitNum,
      }
    },
  )

  fastify.get<{ Params: { id: string } }>("/users/:id", { preHandler }, async (request) => {
    const db = getDb()
    const user = db.select().from(users).where(eq(users.id, request.params.id)).get()
    if (!user) throw new NotFoundError("User not found")
    const projectCount = db.select().from(projects).where(eq(projects.userId, user.id)).all().length
    return { ...safeUser(user), projectCount }
  })

  fastify.post<{ Body: { email: string; password: string; display_name: string; role?: string } }>(
    "/users",
    {
      preHandler,
      schema: {
        body: {
          type: "object",
          required: ["email", "password", "display_name"],
          properties: {
            email: { type: "string" },
            password: { type: "string", minLength: 8 },
            display_name: { type: "string", minLength: 1 },
            role: { type: "string", enum: ["user", "admin"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password, display_name, role = "user" } = request.body
      const db = getDb()

      const existing = db.select().from(users).where(eq(users.email, email.toLowerCase())).get()
      if (existing) throw new BadRequestError("Email already registered")

      const passwordHash = await bcrypt.hash(password, 10)
      const now = Date.now()
      const id = crypto.randomUUID()

      db.insert(users).values({ id, email: email.toLowerCase(), passwordHash, displayName: display_name, role: role as "user" | "admin", status: "active", createdAt: now, updatedAt: now }).run()

      const user = db.select().from(users).where(eq(users.id, id)).get()!
      reply.code(201)
      return { ...safeUser(user), projectCount: 0 }
    },
  )

  fastify.patch<{ Params: { id: string }; Body: { display_name?: string; role?: string; status?: string } }>(
    "/users/:id",
    {
      preHandler,
      schema: {
        body: {
          type: "object",
          properties: {
            display_name: { type: "string", minLength: 1 },
            role: { type: "string", enum: ["user", "admin"] },
            status: { type: "string", enum: ["active", "suspended"] },
          },
        },
      },
    },
    async (request) => {
      const db = getDb()
      const user = db.select().from(users).where(eq(users.id, request.params.id)).get()
      if (!user) throw new NotFoundError("User not found")

      const { display_name, role, status } = request.body
      const updates: Partial<typeof users.$inferInsert> = { updatedAt: Date.now() }
      if (display_name !== undefined) updates.displayName = display_name
      if (role !== undefined) updates.role = role as "user" | "admin"
      if (status !== undefined) updates.status = status as "active" | "suspended"

      db.update(users).set(updates).where(eq(users.id, user.id)).run()

      const updated = db.select().from(users).where(eq(users.id, user.id)).get()!
      const projectCount = db.select().from(projects).where(eq(projects.userId, user.id)).all().length
      return { ...safeUser(updated), projectCount }
    },
  )

  fastify.delete<{ Params: { id: string } }>("/users/:id", { preHandler }, async (request, reply) => {
    const db = getDb()
    const user = db.select().from(users).where(eq(users.id, request.params.id)).get()
    if (!user) throw new NotFoundError("User not found")

    const userProjects = db.select().from(projects).where(eq(projects.userId, user.id)).all()
    for (const p of userProjects) {
      fs.rm(p.storagePath, { recursive: true, force: true }, () => {})
    }

    db.delete(users).where(eq(users.id, user.id)).run()
    reply.code(204).send()
  })

  fastify.post<{ Params: { id: string } }>("/users/:id/suspend", { preHandler }, async (request) => {
    const db = getDb()
    const user = db.select().from(users).where(eq(users.id, request.params.id)).get()
    if (!user) throw new NotFoundError("User not found")

    const now = Date.now()
    db.update(users).set({ status: "suspended", updatedAt: now }).where(eq(users.id, user.id)).run()
    db.delete(sessions).where(eq(sessions.userId, user.id)).run()

    const updated = db.select().from(users).where(eq(users.id, user.id)).get()!
    const projectCount = db.select().from(projects).where(eq(projects.userId, user.id)).all().length
    return { ...safeUser(updated), projectCount }
  })

  fastify.post<{ Params: { id: string } }>("/users/:id/activate", { preHandler }, async (request) => {
    const db = getDb()
    const user = db.select().from(users).where(eq(users.id, request.params.id)).get()
    if (!user) throw new NotFoundError("User not found")

    db.update(users).set({ status: "active", updatedAt: Date.now() }).where(eq(users.id, user.id)).run()

    const updated = db.select().from(users).where(eq(users.id, user.id)).get()!
    const projectCount = db.select().from(projects).where(eq(projects.userId, user.id)).all().length
    return { ...safeUser(updated), projectCount }
  })

  fastify.post<{ Params: { id: string }; Body: { new_password: string } }>(
    "/users/:id/reset-password",
    {
      preHandler,
      schema: {
        body: {
          type: "object",
          required: ["new_password"],
          properties: { new_password: { type: "string", minLength: 8 } },
        },
      },
    },
    async (request, reply) => {
      const db = getDb()
      const user = db.select().from(users).where(eq(users.id, request.params.id)).get()
      if (!user) throw new NotFoundError("User not found")

      const passwordHash = await bcrypt.hash(request.body.new_password, 10)
      db.update(users).set({ passwordHash, updatedAt: Date.now() }).where(eq(users.id, user.id)).run()
      reply.code(204).send()
    },
  )

  fastify.post<{ Params: { id: string } }>("/users/:id/invalidate-sessions", { preHandler }, async (request, reply) => {
    const db = getDb()
    const user = db.select().from(users).where(eq(users.id, request.params.id)).get()
    if (!user) throw new NotFoundError("User not found")

    db.delete(sessions).where(eq(sessions.userId, user.id)).run()
    reply.code(204).send()
  })

  fastify.get<{ Params: { id: string } }>("/users/:id/settings", { preHandler }, async (request) => {
    const db = getDb()
    const user = db.select().from(users).where(eq(users.id, request.params.id)).get()
    if (!user) throw new NotFoundError("User not found")
    return getSettings(user.id, null)
  })

  fastify.patch<{ Params: { id: string }; Body: Record<string, string> }>(
    "/users/:id/settings",
    { preHandler },
    async (request) => {
      const db = getDb()
      const user = db.select().from(users).where(eq(users.id, request.params.id)).get()
      if (!user) throw new NotFoundError("User not found")
      return patchSettings(user.id, request.body, null)
    },
  )

  fastify.delete<{ Params: { id: string; key: string } }>(
    "/users/:id/settings/:key",
    { preHandler },
    async (request, reply) => {
      const db = getDb()
      const user = db.select().from(users).where(eq(users.id, request.params.id)).get()
      if (!user) throw new NotFoundError("User not found")

      db.delete(settings)
        .where(and(eq(settings.userId, user.id), eq(settings.key, request.params.key)))
        .run()
      reply.code(204).send()
    },
  )

  // ── Project management ─────────────────────────────────────────────────────

  fastify.get<{ Querystring: { page?: string; limit?: string } }>(
    "/projects",
    { preHandler },
    async (request) => {
      const db = getDb()
      const { page = "1", limit = "20" } = request.query
      const pageNum = Math.max(1, parseInt(page, 10))
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)))

      const allProjects = db.select().from(projects).all()
      const total = allProjects.length
      const slice = allProjects.slice((pageNum - 1) * limitNum, pageNum * limitNum)

      const ownerIds = [...new Set(slice.map((p) => p.userId))]
      const ownerMap: Record<string, string> = {}
      for (const uid of ownerIds) {
        const u = db.select().from(users).where(eq(users.id, uid)).get()
        ownerMap[uid] = u?.email ?? "unknown"
      }

      return {
        projects: slice.map((p) => projectWithOwner(p, ownerMap[p.userId] ?? "unknown")),
        total,
        page: pageNum,
        limit: limitNum,
      }
    },
  )

  fastify.get<{ Params: { id: string } }>("/projects/:id", { preHandler }, async (request) => {
    const db = getDb()
    const project = db.select().from(projects).where(eq(projects.id, request.params.id)).get()
    if (!project) throw new NotFoundError("Project not found")
    const owner = db.select().from(users).where(eq(users.id, project.userId)).get()
    return projectWithOwner(project, owner?.email ?? "unknown")
  })

  fastify.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/projects/:id",
    {
      preHandler,
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request) => {
      const db = getDb()
      const project = db.select().from(projects).where(eq(projects.id, request.params.id)).get()
      if (!project) throw new NotFoundError("Project not found")

      db.update(projects)
        .set({ name: request.body.name.trim(), updatedAt: Date.now() })
        .where(eq(projects.id, project.id))
        .run()

      return db.select().from(projects).where(eq(projects.id, project.id)).get()!
    },
  )

  fastify.delete<{ Params: { id: string } }>("/projects/:id", { preHandler }, async (request, reply) => {
    const db = getDb()
    const project = db.select().from(projects).where(eq(projects.id, request.params.id)).get()
    if (!project) throw new NotFoundError("Project not found")

    db.delete(projects).where(eq(projects.id, project.id)).run()
    fs.rm(project.storagePath, { recursive: true, force: true }, () => {})
    reply.code(204).send()
  })

  fastify.post<{ Params: { id: string }; Body: { new_owner_id: string } }>(
    "/projects/:id/transfer",
    {
      preHandler,
      schema: {
        body: {
          type: "object",
          required: ["new_owner_id"],
          properties: { new_owner_id: { type: "string" } },
        },
      },
    },
    async (request) => {
      const db = getDb()
      const project = db.select().from(projects).where(eq(projects.id, request.params.id)).get()
      if (!project) throw new NotFoundError("Project not found")

      const newOwner = db.select().from(users).where(eq(users.id, request.body.new_owner_id)).get()
      if (!newOwner) throw new NotFoundError("New owner user not found")

      db.update(projects)
        .set({ userId: newOwner.id, updatedAt: Date.now() })
        .where(eq(projects.id, project.id))
        .run()

      return db.select().from(projects).where(eq(projects.id, project.id)).get()!
    },
  )

  // ── Ingest queue (cross-user) ──────────────────────────────────────────────

  fastify.get<{ Querystring: { page?: string; limit?: string } }>(
    "/ingest/queue",
    { preHandler },
    async (request) => {
      const db = getDb()
      const { page = "1", limit = "50" } = request.query
      const pageNum = Math.max(1, parseInt(page, 10))
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)))

      const allItems = db.select().from(ingestQueue).all()
      const total = allItems.length
      const slice = allItems.slice((pageNum - 1) * limitNum, pageNum * limitNum)

      const projectIds = [...new Set(slice.map((i) => i.projectId))]
      const projectMap: Record<string, { name: string; userId: string }> = {}
      for (const pid of projectIds) {
        const p = db.select().from(projects).where(eq(projects.id, pid)).get()
        if (p) projectMap[pid] = { name: p.name, userId: p.userId }
      }

      const ownerIds = [...new Set(Object.values(projectMap).map((p) => p.userId))]
      const ownerMap: Record<string, string> = {}
      for (const uid of ownerIds) {
        const u = db.select().from(users).where(eq(users.id, uid)).get()
        ownerMap[uid] = u?.email ?? "unknown"
      }

      return {
        items: slice.map((item) => {
          const proj = projectMap[item.projectId]
          return {
            ...item,
            projectName: proj?.name ?? "unknown",
            ownerEmail: proj ? (ownerMap[proj.userId] ?? "unknown") : "unknown",
          }
        }),
        total,
      }
    },
  )

  fastify.delete<{ Params: { jobId: string } }>("/ingest/:jobId", { preHandler }, async (request, reply) => {
    const db = getDb()
    const item = db.select().from(ingestQueue).where(eq(ingestQueue.id, request.params.jobId)).get()
    if (!item) throw new NotFoundError("Ingest job not found")

    abortItem(item.id)
    db.delete(ingestQueue).where(eq(ingestQueue.id, item.id)).run()
    reply.code(204).send()
  })

  fastify.post("/ingest/drain", { preHandler }, async () => {
    const { drainQueue } = await import("../ingest/ingest-service")
    drainQueue()
    return { drained: true }
  })

  fastify.post("/ingest/resume", { preHandler }, async () => {
    const { resumeQueue } = await import("../ingest/ingest-service")
    resumeQueue()
    kickWorker()
    return { drained: false }
  })

  // ── System settings ────────────────────────────────────────────────────────

  fastify.get("/system/settings", { preHandler }, async () => {
    return getSystemSettings()
  })

  fastify.patch<{ Body: { registrationOpen?: boolean; ingestRateLimitPerHour?: number; storageQuotaMb?: number } }>(
    "/system/settings",
    {
      preHandler,
      schema: {
        body: {
          type: "object",
          properties: {
            registrationOpen: { type: "boolean" },
            ingestRateLimitPerHour: { type: "number" },
            storageQuotaMb: { type: "number" },
          },
        },
      },
    },
    async (request) => {
      return patchSystemSettings(request.body)
    },
  )
}
