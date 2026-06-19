import Fastify from "fastify"
import type { FastifyInstance } from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import { loadConfig } from "./config"
import { resolveAuth } from "./auth/auth"
import { healthRoutes } from "./routes/health"
import { projectRoutes } from "./routes/projects"
import { searchRoutes } from "./routes/search"
import { ingestRoutes } from "./routes/ingest"
import { configRoutes } from "./routes/config"
import { chatRoutes } from "./routes/chat"

export async function buildServer(): Promise<FastifyInstance> {
  const config = loadConfig()
  const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: config.corsOrigins === "*" ? true : config.corsOrigins.split(","),
    credentials: true,
  })
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" })

  // Resolve auth context for every request; per-route guards enforce scope.
  app.addHook("onRequest", resolveAuth)

  await app.register(healthRoutes)
  await app.register(projectRoutes)
  await app.register(searchRoutes)
  await app.register(ingestRoutes)
  await app.register(configRoutes)
  await app.register(chatRoutes)

  return app
}
