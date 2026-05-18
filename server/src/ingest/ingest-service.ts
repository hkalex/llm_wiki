import { eq, and } from "drizzle-orm"
import { getDb } from "../db/database"
import { ingestQueue, projects } from "../db/schema"
import type { IngestQueueItem } from "../db/schema"
import { getRawSettings } from "../settings/settings-service"
import { config } from "../config"
import { runIngestPipeline, type LlmSettings } from "./ingest-pipeline"
import { logger } from "../shared/logger"

// ── LLM settings resolution ────────────────────────────────────────────────

function extractLlmSettings(s: Record<string, string>): LlmSettings {
  const provider = s["llm_provider"] ?? config.defaultLlmProvider
  const apiKey = s["llm_api_key"] ?? config.defaultLlmApiKey
  const model = s["llm_model"] ?? config.defaultLlmModel

  let baseUrl: string | undefined
  if (provider === "ollama") {
    baseUrl = s["ollama_url"] ?? "http://localhost:11434"
  } else if (provider === "custom") {
    baseUrl = s["llm_custom_endpoint"]
  }

  return { provider, apiKey, model, baseUrl }
}

// ── SSE subscriber registry ────────────────────────────────────────────────

type Subscriber = (event: object) => void
const subscribers = new Map<string, Set<Subscriber>>()

export function subscribeToProject(projectId: string, cb: Subscriber): () => void {
  if (!subscribers.has(projectId)) subscribers.set(projectId, new Set())
  subscribers.get(projectId)!.add(cb)
  return () => {
    subscribers.get(projectId)?.delete(cb)
    if (subscribers.get(projectId)?.size === 0) subscribers.delete(projectId)
  }
}

function emit(projectId: string, event: object): void {
  subscribers.get(projectId)?.forEach((cb) => {
    try { cb(event) } catch { /* subscriber disconnect — ignore */ }
  })
}

// ── Queue CRUD ─────────────────────────────────────────────────────────────

export function listQueue(projectId: string): IngestQueueItem[] {
  return getDb()
    .select()
    .from(ingestQueue)
    .where(eq(ingestQueue.projectId, projectId))
    .all()
}

export function enqueueItem(projectId: string, sourcePath: string): string {
  const db = getDb()

  // Avoid duplicate pending entries for the same source
  const existing = db
    .select()
    .from(ingestQueue)
    .where(
      and(
        eq(ingestQueue.projectId, projectId),
        eq(ingestQueue.sourcePath, sourcePath),
        eq(ingestQueue.status, "pending"),
      ),
    )
    .get()
  if (existing) return existing.id

  const id = crypto.randomUUID()
  const now = Date.now()
  db.insert(ingestQueue)
    .values({ id, projectId, sourcePath, status: "pending", retryCount: 0, createdAt: now, updatedAt: now })
    .run()

  emit(projectId, { type: "queued", itemId: id, sourcePath, status: "pending" })
  return id
}

export function removeItem(id: string, projectId: string): boolean {
  const db = getDb()
  const existing = db
    .select()
    .from(ingestQueue)
    .where(and(eq(ingestQueue.id, id), eq(ingestQueue.projectId, projectId)))
    .get()
  if (!existing) return false

  db.delete(ingestQueue).where(eq(ingestQueue.id, id)).run()
  emit(projectId, { type: "cancelled", itemId: id })
  return true
}

// ── Background worker ──────────────────────────────────────────────────────

const abortControllers = new Map<string, AbortController>()
let workerActive = false

/** Abort an in-progress item (if running) without removing it from the DB. */
export function abortItem(id: string): void {
  abortControllers.get(id)?.abort()
}

/** Start the background processing loop if not already running. */
export function kickWorker(): void {
  if (workerActive) return
  workerActive = true
  void processLoop()
}

async function processLoop(): Promise<void> {
  try {
    const db = getDb()
    // Revert any stale "processing" items from a previous server crash (startup only)
    db.update(ingestQueue)
      .set({ status: "pending", updatedAt: Date.now() })
      .where(eq(ingestQueue.status, "processing"))
      .run()

    while (true) {
      const item = db
        .select()
        .from(ingestQueue)
        .where(eq(ingestQueue.status, "pending"))
        .get()
      if (!item) break

      await processItem(item)
    }
  } finally {
    workerActive = false
  }
}

async function processItem(item: IngestQueueItem): Promise<void> {
  const db = getDb()
  const now = Date.now()

  db.update(ingestQueue)
    .set({ status: "processing", updatedAt: now })
    .where(eq(ingestQueue.id, item.id))
    .run()
  emit(item.projectId, { type: "progress", itemId: item.id, sourcePath: item.sourcePath, detail: "Starting..." })

  const ac = new AbortController()
  abortControllers.set(item.id, ac)

  try {
    const project = db.select().from(projects).where(eq(projects.id, item.projectId)).get()
    if (!project) throw new Error("Project not found")

    const rawSettings = getRawSettings(project.userId, null)
    const llmSettings = extractLlmSettings(rawSettings)

    if (!llmSettings.apiKey && llmSettings.provider !== "ollama") {
      throw new Error(
        "No LLM API key configured. Set DEFAULT_LLM_API_KEY in the server environment or PATCH /api/v1/settings with {\"llm_api_key\": \"...\"} to configure per-user.",
      )
    }

    const filesWritten = await runIngestPipeline(
      project.storagePath,
      item.sourcePath,
      llmSettings,
      (detail) => emit(item.projectId, { type: "progress", itemId: item.id, detail }),
      ac.signal,
    )

    if (ac.signal.aborted) {
      // Cancelled mid-flight; leave item in DB for the caller to clean up
      return
    }

    db.delete(ingestQueue).where(eq(ingestQueue.id, item.id)).run()
    emit(item.projectId, { type: "done", itemId: item.id, sourcePath: item.sourcePath, filesWritten })
    logger.info("Ingest complete", { itemId: item.id, sourcePath: item.sourcePath, filesWritten: filesWritten.length })

  } catch (err) {
    if (ac.signal.aborted) return

    const message = err instanceof Error ? err.message : String(err)
    const retryCount = item.retryCount + 1

    if (retryCount >= 3) {
      db.update(ingestQueue)
        .set({ status: "failed", errorMessage: message, retryCount, updatedAt: Date.now() })
        .where(eq(ingestQueue.id, item.id))
        .run()
      emit(item.projectId, { type: "error", itemId: item.id, sourcePath: item.sourcePath, message })
      logger.error("Ingest failed", { itemId: item.id, sourcePath: item.sourcePath, message })
    } else {
      // Reset to pending for retry
      db.update(ingestQueue)
        .set({ status: "pending", errorMessage: message, retryCount, updatedAt: Date.now() })
        .where(eq(ingestQueue.id, item.id))
        .run()
      emit(item.projectId, { type: "retry", itemId: item.id, retryCount, message })
      logger.warn("Ingest will retry", { itemId: item.id, retryCount, message })
    }
  } finally {
    abortControllers.delete(item.id)
  }
}
