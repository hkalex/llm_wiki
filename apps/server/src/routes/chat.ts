/**
 * Streaming chat over Server-Sent Events.
 *
 * Phase 3 will assemble RAG context server-side (reusing core searchByEmbedding
 * + context-budget) and re-stream provider tokens via core `streamChat`,
 * emitting events: token / reasoning / refs / done / error. This scaffold
 * establishes the SSE transport + event contract so clients can integrate now;
 * it currently streams a notice and completes.
 */
import type { FastifyInstance, FastifyReply } from "fastify"
import { requireScope } from "../auth/auth"
import { loadProject } from "./helpers"

function sse(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Params: { id: string }
    Body: { text?: string; conversationId?: string; history?: unknown[] }
  }>(
    "/api/v1/projects/:id/chat",
    { preHandler: requireScope("client") },
    async (request, reply) => {
      const project = await loadProject(request, reply)
      if (!project) return

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // disable proxy buffering for SSE
      })

      const abort = new AbortController()
      request.raw.on("close", () => abort.abort())

      // TODO(phase3): build context (RAG) + call core streamChat with callbacks
      // that emit `token`/`reasoning` frames; wire `abort` to the provider call.
      sse(reply, "token", {
        text: "Server-side chat streaming is scaffolded; provider wiring lands in Phase 3.",
      })
      sse(reply, "refs", { pages: [] })
      sse(reply, "done", {})
      reply.raw.end()
    },
  )
}
