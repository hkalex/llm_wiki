/**
 * Ingest worker — runs the REUSED core ingest pipeline. One job at a time
 * (batchSize 1) preserves the single-LLM constraint. Per job: load the server
 * config snapshot, install the Node platform (filesystem + pgvector + config),
 * run core `autoIngest` over the materialized source file, then refresh the
 * pages FTS index and persist any review items the pipeline produced.
 *
 * Typecheck + bundle verified; runtime needs Postgres + a configured LLM/
 * embedding provider.
 */
import path from "node:path"
import { INGEST_QUEUE, getBoss } from "./queue"
import type { IngestJob } from "./queue"
import { installNodePlatform, loadConfigSnapshot } from "../platform/node-platform"
import { projectDir } from "../platform/pg-storage"
import { reindexPages } from "../ingest/reindex"
import { persistReviews } from "../ingest/persist-reviews"
import { autoIngest } from "@/lib/ingest"

export async function startIngestWorker(): Promise<void> {
  const boss = await getBoss()
  await boss.work<IngestJob>(INGEST_QUEUE, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const { projectId, sourceRelPath, externalId } = job.data
      const snapshot = await loadConfigSnapshot()
      if (!snapshot.llm) {
        // eslint-disable-next-line no-console
        console.warn(`[ingest] no LLM configured; skipping ${externalId}`)
        continue
      }
      installNodePlatform(snapshot)
      const projectPath = projectDir(projectId)
      const sourcePath = path.join(projectPath, sourceRelPath)
      try {
        const written = await autoIngest(projectPath, sourcePath, snapshot.llm)
        await reindexPages(projectId, projectPath)
        const reviews = await persistReviews(projectId)
        // eslint-disable-next-line no-console
        console.log(`[ingest] ${externalId}: ${written.length} files, ${reviews} reviews`)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[ingest] ${externalId} failed:`, err)
        throw err // let pg-boss record the failure / retry per its policy
      }
    }
  })
}
