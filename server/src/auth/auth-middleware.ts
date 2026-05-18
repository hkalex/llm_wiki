import type { FastifyRequest, FastifyReply } from "fastify"
import { verifyToken } from "./auth-service"
import type { User } from "../db/schema"
import { UnauthorizedError } from "../shared/errors"

declare module "fastify" {
  interface FastifyRequest {
    user: User
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing Authorization header")
  }
  const token = authHeader.slice(7)
  request.user = await verifyToken(token)
}

export function extractBearerToken(request: FastifyRequest): string | null {
  const h = request.headers.authorization
  if (!h?.startsWith("Bearer ")) return null
  return h.slice(7)
}
