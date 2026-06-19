/**
 * Ingestion endpoints.
 *
 * - POST /api/v1/projects/:id/sources/rescan — client-triggered rescan.
 * - POST /api/v1/ingest/items — the SCRAPER push API. Accepts a batch of
 *   news/data items, dedups by externalId + content SHA-256 (the same contract
 *   as core ingest-cache), and accepts new ones for processing.
 *
 * Phase 1 records dedup + accepts (202); Phase 2 wires the pg-boss worker that
 * materializes each item to raw/sources and runs the core ingest pipeline. The
 * single-LLM serial constraint maps onto pg-boss concurrency = 1.
 */
import { createHash } from "node:crypto"
import type { FastifyInstance } from "fastify"
import { requireScope, canAccessProject } from "../auth/auth"
import { loadProject } from "./helpers"
import { resolveProject } from "../platform/pg-storage"
import { query } from "../db/pool"
import { materializeSourceItem } from "../ingest/materialize"
import { enqueueIngest } from "../jobs/queue"
import type { IngestItemDto } from "../types"

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    "/api/v1/projects/:id/sources/rescan",
    { preHandler: requireScope("client") },
    async (request, reply) => {
      const project = await loadProject(request, reply)
      if (!project) return
      // TODO(phase2): enqueue a rescan job. For now acknowledge.
      return reply.code(202).send({ status: "accepted", projectId: project.id })
    },
  )

  app.post<{
    Body: { projectId?: string; items?: IngestItemDto[] }
  }>(
    "/api/v1/ingest/items",
    { preHandler: requireScope("scraper") },
    async (request, reply) => {
      const { projectId, items } = request.body ?? {}
      if (!projectId || !Array.isArray(items) || items.length === 0) {
        return reply.code(400).send({ error: "projectId and non-empty items[] required" })
      }
      const project = await resolveProject(projectId)
      if (!project) return reply.code(404).send({ error: "project not found" })
      if (!canAccessProject(request, project.id)) {
        return reply.code(403).send({ error: "no access to this project" })
      }

      const accepted: string[] = []
      const skipped: string[] = []
      for (const item of items) {
        if (!item.externalId) {
          skipped.push("(missing externalId)")
          continue
        }
        const body = item.content ?? item.contentBase64 ?? ""
        const hash = sha256(`${item.externalId}:${body}`)
        // Dedup: skip if we've already ingested this externalId with same hash.
        const existing = await query<{ hash: string }>(
          "SELECT hash FROM ingest_cache WHERE project_id = $1 AND external_id = $2 LIMIT 1",
          [project.id, item.externalId],
        )
        if (existing[0]?.hash === hash) {
          skipped.push(item.externalId)
          continue
        }
        // Materialize to raw/sources/<folder>/<slug>.md (files = source of truth).
        const relPath = await materializeSourceItem(project.id, item)
        await query(
          `INSERT INTO ingest_cache (project_id, source_name, external_id, hash, ts)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (project_id, source_name)
           DO UPDATE SET external_id = EXCLUDED.external_id, hash = EXCLUDED.hash, ts = EXCLUDED.ts`,
          [project.id, relPath, item.externalId, hash, Date.now()],
        )
        // Enqueue for the (serial) ingest worker, which runs the core pipeline.
        await enqueueIngest({
          projectId: project.id,
          sourceRelPath: relPath,
          externalId: item.externalId,
        })
        accepted.push(item.externalId)
      }
      return reply
        .code(202)
        .send({ status: "accepted", accepted, skipped, queued: accepted.length })
    },
  )
}
