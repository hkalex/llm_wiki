import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify"
import { requireAuth } from "../auth/auth-middleware"
import { assertProjectAccess } from "../projects/project-service"
import {
  enqueueItem,
  listQueue,
  removeItem,
  abortItem,
  subscribeToProject,
  kickWorker,
} from "./ingest-service"
import { BadRequestError, HttpError } from "../shared/errors"
import { config } from "../config"

// Per-user in-memory rate limiter: tracks request timestamps in a sliding window
const rateLimitStore = new Map<string, number[]>()

function ingestRateLimitHandler(request: FastifyRequest, _reply: FastifyReply): void {
  if (config.ingestRateLimitPerHour <= 0) return
  const userId = request.user.id
  const now = Date.now()
  const windowStart = now - 60 * 60 * 1000
  const timestamps = (rateLimitStore.get(userId) ?? []).filter((t) => t > windowStart)
  if (timestamps.length >= config.ingestRateLimitPerHour) {
    throw new HttpError(429, "Rate limit exceeded. Try again later.")
  }
  timestamps.push(now)
  rateLimitStore.set(userId, timestamps)
}

export const ingestRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /projects/:id/ingest — list queue items
  fastify.get<{ Params: { id: string } }>(
    "/",
    { preHandler: [requireAuth] },
    async (request) => {
      assertProjectAccess(request.params.id, request.user.id)
      return listQueue(request.params.id)
    },
  )

  // POST /projects/:id/ingest — enqueue a source for ingest
  fastify.post<{ Params: { id: string }; Body: { sourcePath: string } }>(
    "/",
    {
      preHandler: [requireAuth, ingestRateLimitHandler],
      schema: {
        body: {
          type: "object",
          required: ["sourcePath"],
          properties: { sourcePath: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      assertProjectAccess(request.params.id, request.user.id)

      const { sourcePath } = request.body
      if (!sourcePath.trim()) throw new BadRequestError("sourcePath is required")

      const itemId = enqueueItem(request.params.id, sourcePath)
      kickWorker()

      reply.code(201).send({ id: itemId, status: "pending" })
    },
  )

  // DELETE /projects/:id/ingest/:itemId — cancel and remove an item
  fastify.delete<{ Params: { id: string; itemId: string } }>(
    "/:itemId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      assertProjectAccess(request.params.id, request.user.id)
      abortItem(request.params.itemId)
      removeItem(request.params.itemId, request.params.id)
      reply.code(204).send()
    },
  )

  // GET /projects/:id/ingest/events — SSE stream of ingest progress
  //
  // Streams newline-delimited SSE events. Event shapes:
  //   { type: "snapshot",   items: IngestQueueItem[] }           — sent immediately on connect
  //   { type: "queued",     itemId, sourcePath, status }
  //   { type: "progress",   itemId, sourcePath, detail }
  //   { type: "done",       itemId, sourcePath, filesWritten }
  //   { type: "error",      itemId, sourcePath, message }
  //   { type: "retry",      itemId, retryCount, message }
  //   { type: "cancelled",  itemId }
  fastify.get<{ Params: { id: string } }>(
    "/events",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      assertProjectAccess(request.params.id, request.user.id)

      reply.raw.setHeader("Content-Type", "text/event-stream")
      reply.raw.setHeader("Cache-Control", "no-cache")
      reply.raw.setHeader("Connection", "keep-alive")
      reply.raw.setHeader("X-Accel-Buffering", "no")
      reply.raw.flushHeaders()

      const write = (event: object) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
        } catch {
          // client disconnected
        }
      }

      // Send a snapshot of current queue state so the client can sync immediately
      write({ type: "snapshot", items: listQueue(request.params.id) })

      const unsubscribe = subscribeToProject(request.params.id, write)

      // Keep-alive comment every 15 s to prevent proxy timeouts
      const keepAlive = setInterval(() => {
        try { reply.raw.write(": keep-alive\n\n") } catch { clearInterval(keepAlive) }
      }, 15_000)

      // Block until client disconnects
      await new Promise<void>((resolve) => {
        request.raw.on("close", resolve)
        request.raw.on("end", resolve)
      })

      clearInterval(keepAlive)
      unsubscribe()
    },
  )
}
