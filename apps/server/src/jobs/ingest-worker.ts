/**
 * Ingest worker. Picks up one job at a time (serial-LLM constraint) and will
 * run the reused core ingest pipeline against the materialized source file.
 *
 * The core pipeline call is the remaining seam: it needs the core (src/lib/
 * ingest.ts) wired server-side with Node platform adapters + a ConfigProvider,
 * which depends on the packages/core build setup. Until then the worker
 * records progress so the queue path is exercised end-to-end.
 */
import { INGEST_QUEUE, getBoss } from "./queue"
import type { IngestJob } from "./queue"

export async function startIngestWorker(): Promise<void> {
  const boss = await getBoss()
  await boss.work<IngestJob>(INGEST_QUEUE, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const { projectId, sourceRelPath, externalId } = job.data
      // TODO(core): build a request-scoped Platform (Node adapters) +
      // ConfigProvider + ProgressSink, then call core `autoIngest(projectPath,
      // sourceRelPath)`. The serial batchSize=1 preserves the single-LLM rule.
      // eslint-disable-next-line no-console
      console.log(`[ingest-worker] ${externalId} -> ${sourceRelPath} (project ${projectId})`)
    }
  })
}
