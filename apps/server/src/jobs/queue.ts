/**
 * pg-boss job queue (uses the same Postgres — no Redis). The single ingest
 * worker with batchSize 1 enforces the serial-LLM constraint that the desktop
 * app enforced in-process (one ingest at a time), now durably and across
 * restarts/replicas.
 */
import PgBoss from "pg-boss"
import { loadConfig } from "../config"

export const INGEST_QUEUE = "ingest"

export interface IngestJob {
  projectId: string
  /** Project-relative path of the materialized source, e.g. raw/sources/news/x.md */
  sourceRelPath: string
  externalId: string
}

let boss: PgBoss | null = null
let starting: Promise<PgBoss> | null = null

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss
  if (!starting) {
    starting = (async () => {
      const b = new PgBoss(loadConfig().databaseUrl)
      await b.start()
      await b.createQueue(INGEST_QUEUE)
      boss = b
      return b
    })()
  }
  return starting
}

export async function enqueueIngest(job: IngestJob): Promise<string | null> {
  const b = await getBoss()
  return b.send(INGEST_QUEUE, job)
}
