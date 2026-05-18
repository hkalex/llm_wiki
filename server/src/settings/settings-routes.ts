import type { FastifyPluginAsync } from "fastify"
import { requireAuth } from "../auth/auth-middleware"
import { getSettings, patchSettings } from "./settings-service"

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { project?: string } }>(
    "/",
    { preHandler: [requireAuth] },
    async (request) => {
      return getSettings(request.user.id, request.query.project ?? null)
    },
  )

  fastify.patch<{
    Querystring: { project?: string }
    Body: Record<string, string>
  }>(
    "/",
    { preHandler: [requireAuth] },
    async (request) => {
      return patchSettings(request.user.id, request.body, request.query.project ?? null)
    },
  )
}
