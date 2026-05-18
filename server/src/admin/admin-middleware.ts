import type { FastifyRequest, FastifyReply } from "fastify"
import { ForbiddenError } from "../shared/errors"

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (request.user.role !== "admin") {
    throw new ForbiddenError("Admin access required")
  }
}
