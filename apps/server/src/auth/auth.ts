/**
 * Request authentication + authorization helpers for Fastify.
 *
 * Token is accepted (in priority order) from `Authorization: Bearer <t>`, the
 * `X-LLM-Wiki-Token` header, or a `?token=` query param — keeping the existing
 * MCP server and token clients working. The bootstrap admin token (env) always
 * resolves to an admin context for first-boot / compose.
 */
import type { FastifyReply, FastifyRequest } from "fastify"
import { constantTimeEqual, lookupKey } from "./api-key"
import { loadConfig } from "../config"
import type { ApiKeyScope, AuthContext } from "../types"

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext
  }
}

function extractToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim()
  const header = request.headers["x-llm-wiki-token"]
  if (typeof header === "string" && header) return header
  const q = (request.query as Record<string, unknown> | undefined)?.token
  if (typeof q === "string" && q) return q
  return null
}

/** onRequest hook: resolve `request.auth`. Does not reject — guards do that. */
export async function resolveAuth(request: FastifyRequest): Promise<void> {
  const token = extractToken(request)
  if (!token) return
  const config = loadConfig()
  if (config.bootstrapAdminToken && constantTimeEqual(token, config.bootstrapAdminToken)) {
    request.auth = { scope: "admin", projectIds: null }
    return
  }
  const ctx = await lookupKey(token)
  if (ctx) request.auth = ctx
}

const SCOPE_RANK: Record<ApiKeyScope, number> = { client: 1, scraper: 1, admin: 3 }

/** Reject unless the request has at least one of the allowed scopes. */
export function requireScope(...allowed: ApiKeyScope[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const config = loadConfig()
    if (!request.auth) {
      // Unauthenticated reads are allowed only when explicitly enabled and the
      // route accepts the read-only 'client' scope.
      if (config.allowUnauthenticated && allowed.includes("client")) {
        request.auth = { scope: "client", projectIds: null }
        return
      }
      await reply.code(401).send({ error: "authentication required" })
      return
    }
    // admin satisfies any requirement; otherwise the scope must be listed.
    if (request.auth.scope === "admin") return
    if (!allowed.includes(request.auth.scope)) {
      await reply.code(403).send({ error: `requires scope: ${allowed.join("|")}` })
    }
  }
}

/** Whether the request's key may access a given project. */
export function canAccessProject(request: FastifyRequest, projectId: string): boolean {
  const ctx = request.auth
  if (!ctx) return false
  if (ctx.scope === "admin" || ctx.projectIds === null) return true
  return ctx.projectIds.includes(projectId)
}

export { SCOPE_RANK }
