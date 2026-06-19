import type { FastifyInstance } from "fastify"
import { requireScope } from "../auth/auth"
import { loadProject } from "./helpers"
import { search } from "../platform/pg-search-engine"

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Params: { id: string }
    Body: { query?: string; topK?: number; queryEmbedding?: number[] | null }
  }>(
    "/api/v1/projects/:id/search",
    { preHandler: requireScope("client") },
    async (request, reply) => {
      const project = await loadProject(request, reply)
      if (!project) return
      const { query: q = "", topK, queryEmbedding } = request.body ?? {}
      return search(project.id, q, { topK, queryEmbedding })
    },
  )
}
