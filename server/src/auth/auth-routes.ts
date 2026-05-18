import type { FastifyPluginAsync } from "fastify"
import { register, login, logout } from "./auth-service"
import { requireAuth, extractBearerToken } from "./auth-middleware"
import { getSystemSettings } from "../admin/system-settings"
import { ForbiddenError } from "../shared/errors"

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { email: string; password: string; display_name: string } }>(
    "/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password", "display_name"],
          properties: {
            email: { type: "string" },
            password: { type: "string", minLength: 8 },
            display_name: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request) => {
      if (!getSystemSettings().registrationOpen) {
        throw new ForbiddenError("Registration is closed")
      }
      const { email, password, display_name } = request.body
      return register(email, password, display_name)
    },
  )

  fastify.post<{ Body: { email: string; password: string } }>(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string" },
            password: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const { email, password } = request.body
      return login(email, password)
    },
  )

  fastify.post("/logout", { preHandler: [requireAuth] }, async (request, reply) => {
    const token = extractBearerToken(request)
    if (token) await logout(token)
    reply.code(204).send()
  })
}
