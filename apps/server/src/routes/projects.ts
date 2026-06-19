/**
 * Read endpoints — parity with api_server.rs: list projects, browse the public
 * file tree, read file content, list reviews, query the graph (stub for now).
 */
import type { FastifyInstance } from "fastify"
import path from "node:path"
import { canAccessProject, requireScope } from "../auth/auth"
import { listProjects } from "../platform/pg-storage"
import { exists, listTree, readText } from "../platform/node-filesystem"
import { buildFileGraph } from "../platform/file-graph"
import { isPublicProjectRel, safeJoin } from "../util/safe-join"
import { query } from "../db/pool"
import { loadProject } from "./helpers"
import type { ReviewDto } from "../types"

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  const client = { preHandler: requireScope("client") }

  app.get("/api/v1/projects", client, async (request) => {
    const all = await listProjects()
    const visible = all.filter((p) => canAccessProject(request, p.id))
    return { projects: visible, current: null }
  })

  app.get<{ Params: { id: string }; Querystring: { scope?: string; recursive?: string } }>(
    "/api/v1/projects/:id/files",
    client,
    async (request, reply) => {
      const project = await loadProject(request, reply)
      if (!project) return
      const scope = request.query.scope ?? "all"
      const recursive = request.query.recursive !== "false"
      const subdir = scope === "wiki" ? "wiki" : scope === "sources" ? "raw/sources" : ""
      const root = subdir ? path.join(project.path, subdir) : project.path
      const tree = await listTree(root, { recursive })
      // When listing the whole project, drop the non-public top-level entries.
      const filtered = subdir
        ? tree
        : tree.filter((n) => isPublicProjectRel(n.path))
      return { files: filtered, scope }
    },
  )

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/v1/projects/:id/files/content",
    client,
    async (request, reply) => {
      const project = await loadProject(request, reply)
      if (!project) return
      const rel = request.query.path ?? ""
      if (!isPublicProjectRel(rel)) {
        return reply.code(403).send({ error: "path not exposed" })
      }
      const abs = safeJoin(project.path, rel)
      if (!abs || !(await exists(abs))) {
        return reply.code(404).send({ error: "file not found" })
      }
      try {
        const content = await readText(abs)
        return { path: rel, content }
      } catch (err) {
        return reply
          .code(413)
          .send({ error: err instanceof Error ? err.message : "cannot read file" })
      }
    },
  )

  app.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    "/api/v1/projects/:id/reviews",
    client,
    async (request, reply) => {
      const project = await loadProject(request, reply)
      if (!project) return
      const status = request.query.status ?? "unresolved"
      const where =
        status === "resolved"
          ? "AND resolved = true"
          : status === "all"
            ? ""
            : "AND resolved = false"
      const rows = await query<{
        id: string
        type: string
        title: string
        description: string
        source_path: string | null
        affected_pages: string[]
        resolved: boolean
        resolved_action: string | null
        created_at: string
      }>(
        `SELECT id, type, title, description, source_path, affected_pages,
                resolved, resolved_action, created_at
         FROM reviews WHERE project_id = $1 ${where}
         ORDER BY created_at DESC`,
        [project.id],
      )
      const reviews: ReviewDto[] = rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        description: r.description,
        ...(r.source_path ? { sourcePath: r.source_path } : {}),
        affectedPages: r.affected_pages,
        resolved: r.resolved,
        ...(r.resolved_action ? { resolvedAction: r.resolved_action } : {}),
        createdAt: Number(r.created_at),
      }))
      return { reviews }
    },
  )

  // File-based graph from wiki frontmatter + [[wikilinks]]. (The richer
  // relevance-weighted graph from core can replace this later.)
  app.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/graph",
    client,
    async (request, reply) => {
      const project = await loadProject(request, reply)
      if (!project) return
      return buildFileGraph(project.path)
    },
  )
}
