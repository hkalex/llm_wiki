/**
 * Streaming chat over SSE — Phase 3. Reuses the battle-tested core `streamChat`
 * verbatim; only the callbacks differ (they write SSE frames instead of
 * updating React state). Provider keys come from server config, never the
 * client. Events: token / reasoning / refs / done / error.
 *
 * RAG context is assembled from a keyword search over indexed pages (vector
 * RAG lights up once query embedding is wired and pages/chunks are populated by
 * the ingest worker). Runtime needs a configured LLM provider; the code path is
 * real and typechecks against core.
 */
import type { FastifyInstance, FastifyReply } from "fastify"
import { requireScope } from "../auth/auth"
import { loadProject } from "./helpers"
import { search } from "../platform/pg-search-engine"
import { readText } from "../platform/node-filesystem"
import { safeJoin } from "../util/safe-join"
import { getServerLlmConfig } from "../llm/server-config"
import { embedQuery } from "../llm/embed"
import { streamChat } from "@/lib/llm-client"
import type { StreamCallbacks } from "@/lib/llm-client"
import type { ChatMessage } from "@/lib/llm-providers"

const SYSTEM_PROMPT =
  "You are the assistant for an LLM Wiki knowledge base. Answer using the " +
  "provided wiki context when present; cite page titles. If the context does " +
  "not cover the question, say so briefly."

function sse(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

async function buildContext(projectId: string, projectPath: string, queryText: string) {
  // Hybrid RAG: embed the query (vector side) when an embedding provider is
  // configured; otherwise keyword-only. search() fuses both via RRF.
  const queryEmbedding = await embedQuery(queryText)
  const hits = await search(projectId, queryText, { topK: 5, queryEmbedding })
  const refs = hits.results.map((r) => ({ path: r.path, title: r.title }))
  let context = ""
  for (const r of hits.results.slice(0, 5)) {
    const abs = safeJoin(projectPath, r.path)
    if (!abs) continue
    try {
      const content = await readText(abs, 50_000)
      context += `\n\n## ${r.title}\n${content.slice(0, 4000)}`
    } catch {
      // unreadable page — skip
    }
  }
  return { context, refs }
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Params: { id: string }
    Body: { text?: string; conversationId?: string; history?: { role: string; content: string }[] }
  }>(
    "/api/v1/projects/:id/chat",
    { preHandler: requireScope("client") },
    async (request, reply) => {
      const project = await loadProject(request, reply)
      if (!project) return

      reply.hijack()
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      })

      const llmConfig = await getServerLlmConfig()
      if (!llmConfig) {
        sse(reply, "error", { message: "No LLM provider configured on the server (PUT /api/v1/config)." })
        reply.raw.end()
        return
      }

      const text = request.body?.text ?? ""
      const abort = new AbortController()
      request.raw.on("close", () => abort.abort())

      try {
        const { context, refs } = await buildContext(project.id, project.path, text)
        sse(reply, "refs", { pages: refs })

        const history: ChatMessage[] = (request.body?.history ?? [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))

        const messages: ChatMessage[] = [
          { role: "system", content: context ? `${SYSTEM_PROMPT}\n\n# Wiki context${context}` : SYSTEM_PROMPT },
          ...history,
          { role: "user", content: text },
        ]

        const callbacks: StreamCallbacks = {
          onToken: (t) => sse(reply, "token", { text: t }),
          onReasoningToken: (t) => sse(reply, "reasoning", { text: t }),
          onDone: () => {
            sse(reply, "done", {})
            reply.raw.end()
          },
          onError: (err) => {
            sse(reply, "error", { message: err.message })
            reply.raw.end()
          },
        }

        await streamChat(llmConfig, messages, callbacks, abort.signal)
      } catch (err) {
        sse(reply, "error", { message: err instanceof Error ? err.message : "chat failed" })
        reply.raw.end()
      }
    },
  )
}
