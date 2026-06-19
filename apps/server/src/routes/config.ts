/**
 * Server-side settings (LLM/embedding/etc.). Secrets live here, never on the
 * thin clients: GET masks secret-looking fields to presence flags ("set"),
 * PUT (admin only) upserts. Clients render masked + "replace" affordances.
 */
import type { FastifyInstance } from "fastify"
import { requireScope } from "../auth/auth"
import { query } from "../db/pool"

const SECRET_KEY_RE = /(apikey|api_key|token|secret|password)/i

function maskValue(value: unknown): unknown {
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? (v ? "set" : "") : maskValue(v)
    }
    return out
  }
  return value
}

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/config",
    { preHandler: requireScope("client") },
    async () => {
      const rows = await query<{ key: string; value: unknown }>(
        "SELECT key, value FROM server_config",
      )
      const config: Record<string, unknown> = {}
      for (const r of rows) config[r.key] = maskValue(r.value)
      return { config }
    },
  )

  app.put<{ Body: { config?: Record<string, unknown> } }>(
    "/api/v1/config",
    { preHandler: requireScope("admin") },
    async (request, reply) => {
      const incoming = request.body?.config
      if (!incoming || typeof incoming !== "object") {
        return reply.code(400).send({ error: "config object required" })
      }
      for (const [key, value] of Object.entries(incoming)) {
        await query(
          `INSERT INTO server_config (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, JSON.stringify(value)],
        )
      }
      return { status: "ok", updated: Object.keys(incoming) }
    },
  )
}
