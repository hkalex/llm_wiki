import type { FastifyInstance } from "fastify"

export const SERVER_VERSION = "0.1.0"

/** Always-available health check (no auth, excluded from rate limiting). */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/health", async () => ({
    status: "ok",
    version: SERVER_VERSION,
    time: new Date().toISOString(),
  }))
}
