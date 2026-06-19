/**
 * Platform seam — the set of capability interfaces that the reusable
 * business logic (`src/lib/*`, destined for `packages/core`) depends on
 * instead of calling Tauri `invoke()` or reading Zustand stores directly.
 *
 * Two implementations satisfy these interfaces:
 *  - Tauri adapters (`src/platform/tauri/*`) — desktop, today's behavior.
 *  - Node adapters (server `apps/server/src/platform/*`) — added later.
 *
 * Keeping core dependent only on these interfaces is what lets the same
 * ingest/RAG/embedding logic run unchanged on the server. See the plan
 * at ~/.claude/plans/i-want-to-achieve-fizzy-pinwheel.md.
 */

import type { FileNode, WikiProject } from "@/types/wiki"
import type { SearchResult } from "@/lib/search"
import type {
  EmbeddingConfig,
  LlmConfig,
  MineruConfig,
  MultimodalConfig,
  OutputLanguage,
} from "@/stores/wiki-store"

// ── Filesystem ───────────────────────────────────────────────────────────
// Replaces the invoke wrappers in `src/commands/fs.ts`.

/** Mirror of `commands::fs::FileBase64` (Rust side). */
export interface FileBase64 {
  base64: string
  mimeType: string
}

export interface ReadFileOptions {
  /** Extract embedded images while reading (PDF/markdown pipelines). */
  extractImages?: boolean
}

export interface Filesystem {
  readFile(path: string, options?: ReadFileOptions): Promise<string>
  writeFile(path: string, contents: string): Promise<void>
  writeFileBase64(path: string, base64: string): Promise<void>
  writeFileAtomic(path: string, contents: string): Promise<void>
  listDirectory(path: string): Promise<FileNode[]>
  copyFile(source: string, destination: string): Promise<void>
  copyDirectory(source: string, destination: string): Promise<string[]>
  /** Convert an uploaded document (PDF/DOCX/…) to text/markdown. */
  preprocessFile(path: string): Promise<string>
  deleteFile(path: string): Promise<void>
  createDirectory(path: string): Promise<void>
  fileExists(path: string): Promise<boolean>
  getFileModifiedTime(path: string): Promise<number>
  getFileSize(path: string): Promise<number>
  getFileMd5(path: string): Promise<string>
  readFileAsBase64(path: string): Promise<FileBase64>
}

// ── VectorStore ──────────────────────────────────────────────────────────
// Replaces the `vector_*` invokes in `src/lib/embedding.ts`. The Tauri impl
// is LanceDB; the server default is pgvector. `searchChunks` returns the
// snake_cased shape that `searchByEmbedding` already consumes.

export interface ChunkUpsert {
  chunkIndex: number
  chunkText: string
  headingPath: string
  embedding: number[]
}

export interface ChunkSearchResult {
  chunk_id: string
  page_id: string
  chunk_index: number
  chunk_text: string
  heading_path: string
  score: number
}

export interface VectorStore {
  upsertChunks(projectPath: string, pageId: string, chunks: ChunkUpsert[]): Promise<void>
  searchChunks(projectPath: string, queryEmbedding: number[], topK: number): Promise<ChunkSearchResult[]>
  deletePage(projectPath: string, pageId: string): Promise<void>
  countChunks(projectPath: string): Promise<number>
  clearChunks(projectPath: string): Promise<void>
  /** Compaction / version pruning. No-op for stores that don't need it. */
  optimizeChunks(projectPath: string): Promise<void>
  /** Legacy per-page (v1) migration helpers. */
  legacyRowCount(projectPath: string): Promise<number>
  dropLegacy(projectPath: string): Promise<void>
}

// ── SearchEngine ─────────────────────────────────────────────────────────
// Replaces `search_project` + the Rust RRF/keyword logic. The server impl
// adds `indexPage`/`removePage` (Postgres FTS); the Tauri impl scans the
// filesystem and exposes only `search`.

export interface SearchEngineConfig {
  /** Embedding config passed through so the backend can embed the query. */
  embeddingConfig?: unknown
}

export interface SearchEngineQuery {
  topK: number
  includeContent?: boolean
  queryEmbedding?: number[] | null
  embeddingConfig?: unknown
}

export interface SearchEngineResponse {
  mode: "keyword" | "vector" | "hybrid"
  results: SearchResult[]
  tokenHits: number
  vectorHits: number
}

export interface SearchEngine {
  search(projectPath: string, query: string, opts: SearchEngineQuery): Promise<SearchEngineResponse>
  /** Server-side incremental indexing (optional; Tauri scans on demand). */
  indexPage?(projectPath: string, pageId: string): Promise<void>
  removePage?(projectPath: string, pageId: string): Promise<void>
}

// ── Storage ──────────────────────────────────────────────────────────────
// Project registry + `.llm-wiki/*` state. Tauri impl uses the Store plugin
// + project.json; server impl uses Postgres.

export interface ProjectRecord {
  id: string
  name: string
  path: string
}

export interface Storage {
  listProjects(): Promise<ProjectRecord[]>
  resolveProject(idOrPath: string): Promise<ProjectRecord | null>
  getProjectState<T>(projectId: string, key: string): Promise<T | null>
  putProjectState<T>(projectId: string, key: string, value: T): Promise<void>
}

// ── ImageExtractor ───────────────────────────────────────────────────────
// Replaces `commands::extract_images` (PDF → PNG) on the Rust side.

export interface ExtractedImage {
  /** Path or identifier of the extracted image. */
  path: string
  page?: number
  index?: number
}

export interface ImageExtractor {
  extractFromPdf(path: string): Promise<ExtractedImage[]>
  extractFromMarkdown(content: string, baseDir: string): Promise<ExtractedImage[]>
}

// ── Subprocess ───────────────────────────────────────────────────────────
// Replaces `claude_cli.rs` / `codex_cli.rs`. Optional — absent on minimal
// server images where the provider CLIs aren't installed.

export interface SubprocessHandle {
  readonly id: string
  kill(): Promise<void>
}

export interface SubprocessCallbacks {
  onLine(line: string): void
  onError(message: string): void
  onExit(code: number | null): void
}

export interface Subprocess {
  spawn(cmd: string, args: string[], cb: SubprocessCallbacks): Promise<SubprocessHandle>
}

// ── ConfigProvider ───────────────────────────────────────────────────────
// Replaces `useWikiStore.getState().{llmConfig,embeddingConfig,…}` reads in
// core. Tauri impl wraps the Zustand stores; server impl wraps server config.

export interface ConfigProvider {
  getLlmConfig(): LlmConfig
  getEmbeddingConfig(): EmbeddingConfig
  getMultimodalConfig(): MultimodalConfig
  getMineruConfig(): MineruConfig
  getOutputLanguage(): OutputLanguage
}

// ── ProgressSink ─────────────────────────────────────────────────────────
// Replaces mid-pipeline writes to the activity/review/chat Zustand stores.
// Tauri impl forwards to the stores; server impl writes job progress / SSE.

export interface ActivityEvent {
  kind: string
  message?: string
  detail?: unknown
}

export interface ProgressSink {
  activity(event: ActivityEvent): void
  reviewAdded(item: unknown): void
}

// ── Platform container ─────────────────────────────────────────────────────

export interface Platform {
  filesystem: Filesystem
  vectorStore: VectorStore
  searchEngine: SearchEngine
  storage: Storage
  imageExtractor: ImageExtractor
  subprocess?: Subprocess
  config: ConfigProvider
  progress: ProgressSink
}

export type { FileNode, WikiProject }
