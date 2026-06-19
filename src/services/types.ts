/**
 * Client-side data-service seam. The React UI talks to this interface instead
 * of calling Tauri `invoke()` / running compute locally, so the SAME components
 * run as a web app (PWA), a mobile PWA, and inside the Tauri thin-client shell.
 *
 * The HTTP implementation (`http/http-data-service.ts`) targets the server's
 * `/api/v1` contract. A Tauri implementation can be added transitionally for
 * any native-only bits; see the plan.
 */

export interface ProjectInfo {
  id: string
  name: string
  path: string
}

export interface FileNode {
  name: string
  path: string
  is_dir: boolean
  children?: FileNode[]
}

export interface SearchResultItem {
  path: string
  title: string
  snippet: string
  titleMatch: boolean
  score: number
  vectorScore?: number
}

export interface SearchResponse {
  mode: "keyword" | "vector" | "hybrid"
  results: SearchResultItem[]
  tokenHits: number
  vectorHits: number
}

export interface ReviewItem {
  id: string
  type: string
  title: string
  description: string
  sourcePath?: string
  affectedPages: string[]
  resolved: boolean
  resolvedAction?: string
  createdAt: number
}

export type FileScope = "wiki" | "sources" | "all"

/** SSE frames emitted by the server's streaming chat endpoint. */
export type ChatStreamEvent =
  | { type: "token"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "refs"; pages: unknown[] }
  | { type: "done" }
  | { type: "error"; message: string }

export interface ChatRequest {
  text: string
  conversationId?: string
  history?: { role: string; content: string }[]
  options?: { useWebSearch?: boolean }
}

export interface DataService {
  health(): Promise<{ status: string; version: string }>
  listProjects(): Promise<ProjectInfo[]>
  listFiles(projectId: string, opts?: { scope?: FileScope; recursive?: boolean }): Promise<FileNode[]>
  readFile(projectId: string, path: string): Promise<string>
  search(
    projectId: string,
    query: string,
    opts?: { topK?: number; queryEmbedding?: number[] | null },
  ): Promise<SearchResponse>
  listReviews(projectId: string, status?: "unresolved" | "resolved" | "all"): Promise<ReviewItem[]>
  getConfig(): Promise<Record<string, unknown>>
  putConfig(config: Record<string, unknown>): Promise<void>
  /** Open a streaming chat; invokes `onEvent` per SSE frame until done/aborted. */
  streamChat(
    projectId: string,
    body: ChatRequest,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>
}
