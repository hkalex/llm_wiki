import Fastify from "fastify"
import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import { config } from "./config"
import { logger } from "./shared/logger"
import { HttpError } from "./shared/errors"
import { authRoutes } from "./auth/auth-routes"
import { userRoutes } from "./users/user-routes"
import { projectRoutes } from "./projects/project-routes"
import { wikiRoutes } from "./wiki/wiki-routes"
import { sourceRoutes } from "./sources/source-routes"
import { settingsRoutes } from "./settings/settings-routes"
import { ingestRoutes } from "./ingest/ingest-routes"
import { kickWorker } from "./ingest/ingest-service"
import { adminRoutes } from "./admin/admin-routes"
import { getDb } from "./db/database"

const VERSION = "0.1.0"

async function build() {
  const fastify = Fastify({ logger: false, trustProxy: true })

  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
  })
  await fastify.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024 },
  })

  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({ message: error.message, code: error.code })
      return
    }
    if (error.validation) {
      reply.code(400).send({ message: error.message, code: "VALIDATION_ERROR" })
      return
    }
    logger.error("Unhandled error", { error: error.message, stack: error.stack })
    reply.code(500).send({ message: "Internal server error" })
  })

  // Health check — no auth
  fastify.get("/api/v1/health", async () => ({ status: "ok", version: VERSION }))

  // Flat routes
  await fastify.register(authRoutes, { prefix: "/api/v1/auth" })
  await fastify.register(userRoutes, { prefix: "/api/v1/users" })
  await fastify.register(projectRoutes, { prefix: "/api/v1/projects" })
  await fastify.register(settingsRoutes, { prefix: "/api/v1/settings" })

  // Project-scoped routes — parameterized prefix is supported in Fastify 4+
  await fastify.register(wikiRoutes, { prefix: "/api/v1/projects/:id/wiki" })
  await fastify.register(sourceRoutes, { prefix: "/api/v1/projects/:id/sources" })
  await fastify.register(ingestRoutes, { prefix: "/api/v1/projects/:id/ingest" })
  await fastify.register(adminRoutes, { prefix: "/api/v1/admin" })

  return fastify
}

async function start() {
  getDb()
  logger.info("Database initialized")

  // Resume any items that were left in "processing" state from a previous run
  kickWorker()

  const fastify = await build()
  try {
    await fastify.listen({ port: config.port, host: "0.0.0.0" })
    logger.info(`LLM Wiki Server listening`, { port: config.port })
  } catch (err) {
    logger.error("Failed to start server", { error: String(err) })
    process.exit(1)
  }
}

start()
