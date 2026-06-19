import type { FastifyInstance } from "fastify"
import { requireScope } from "../auth/auth"
import { loadProject } from "./helpers"
import { search } from "../platform/pg-search-engine"
import { embedQuery } from "../llm/embed"

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
      // Embed server-side when the client didn't supply a vector (and an
      // embedding provider is configured) so the API does hybrid by default.
      const embedding = queryEmbedding ?? (await embedQuery(q))
      return search(project.id, q, { topK, queryEmbedding: embedding })
    },
  )
}
