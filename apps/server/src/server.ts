import Fastify from "fastify"
import type { FastifyInstance } from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import fastifyStatic from "@fastify/static"
import { loadConfig } from "./config"
import { resolveAuth } from "./auth/auth"
import { healthRoutes } from "./routes/health"
import { projectRoutes } from "./routes/projects"
import { searchRoutes } from "./routes/search"
import { ingestRoutes } from "./routes/ingest"
import { configRoutes } from "./routes/config"
import { chatRoutes } from "./routes/chat"
import { keyRoutes } from "./routes/keys"

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
  await app.register(keyRoutes)

  // Single-origin deploy: optionally serve the built web app (SPA) so clients
  // and the API share one origin (clean CORS + SSE). Set WEB_DIR to the build.
  if (config.webDir) {
    await app.register(fastifyStatic, { root: config.webDir, wildcard: false })
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        void reply.code(404).send({ error: "not found" })
        return
      }
      void reply.sendFile("index.html")
    })
  }

  return app
}
