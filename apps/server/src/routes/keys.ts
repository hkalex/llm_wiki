/** Admin-only API key management: issue, list, revoke scoped keys. */
import type { FastifyInstance } from "fastify"
import { requireScope } from "../auth/auth"
import { createApiKey } from "../auth/api-key"
import { query } from "../db/pool"
import type { ApiKeyScope } from "../types"

const VALID_SCOPES: ApiKeyScope[] = ["client", "scraper", "admin"]

export async function keyRoutes(app: FastifyInstance): Promise<void> {
  const admin = { preHandler: requireScope("admin") }

  app.post<{ Body: { name?: string; scope?: ApiKeyScope; projectIds?: string[] | null } }>(
    "/api/v1/keys",
    admin,
    async (request, reply) => {
      const { name = "", scope = "client", projectIds = null } = request.body ?? {}
      if (!VALID_SCOPES.includes(scope)) {
        return reply.code(400).send({ error: `scope must be one of ${VALID_SCOPES.join("|")}` })
      }
      const key = await createApiKey(name, scope, projectIds)
      // The plaintext key is shown ONCE — only the hash is stored.
      return reply
        .code(201)
        .send({ key, scope, name, note: "store this now; it cannot be retrieved later" })
    },
  )

  app.get("/api/v1/keys", admin, async () => {
    const keys = await query<{
      id: string
      name: string
      scope: string
      project_ids: string[] | null
      created_at: string
      last_used: string | null
      revoked: boolean
    }>(
      `SELECT id, name, scope, project_ids, created_at, last_used, revoked
       FROM api_keys ORDER BY created_at DESC`,
    )
    return { keys }
  })

  app.delete<{ Params: { id: string } }>(
    "/api/v1/keys/:id",
    admin,
    async (request) => {
      await query("UPDATE api_keys SET revoked = true WHERE id = $1", [request.params.id])
      return { status: "revoked", id: request.params.id }
    },
  )
}
