import type { FastifyPluginAsync } from "fastify"
import { eq } from "drizzle-orm"
import { requireAuth } from "../auth/auth-middleware"
import { sanitizeUser } from "../auth/auth-service"
import { getDb } from "../db/database"
import { users } from "../db/schema"

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/me", { preHandler: [requireAuth] }, async (request) => {
    return sanitizeUser(request.user)
  })

  fastify.patch<{ Body: { display_name?: string } }>(
    "/me",
    { preHandler: [requireAuth] },
    async (request) => {
      const { display_name } = request.body
      if (!display_name) return sanitizeUser(request.user)

      const db = getDb()
      db.update(users)
        .set({ displayName: display_name, updatedAt: Date.now() })
        .where(eq(users.id, request.user.id))
        .run()

      const updated = db.select().from(users).where(eq(users.id, request.user.id)).get()!
      return sanitizeUser(updated)
    },
  )
}
