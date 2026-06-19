/** HTTP implementation of DataService against the server's /api/v1 contract. */
import { ApiClient } from "./api-client"
import type {
  ChatRequest,
  ChatStreamEvent,
  DataService,
  FileNode,
  FileScope,
  ProjectInfo,
  ReviewItem,
  SearchResponse,
} from "../types"

export class HttpDataService implements DataService {
  constructor(private readonly api: ApiClient) {}

  health(): Promise<{ status: string; version: string }> {
    return this.api.get("/api/v1/health")
  }

  async listProjects(): Promise<ProjectInfo[]> {
    const res = await this.api.get<{ projects: ProjectInfo[] }>("/api/v1/projects")
    return res.projects
  }

  async listFiles(
    projectId: string,
    opts: { scope?: FileScope; recursive?: boolean } = {},
  ): Promise<FileNode[]> {
    const params = new URLSearchParams()
    if (opts.scope) params.set("scope", opts.scope)
    if (opts.recursive === false) params.set("recursive", "false")
    const qs = params.toString()
    const res = await this.api.get<{ files: FileNode[] }>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/files${qs ? `?${qs}` : ""}`,
    )
    return res.files
  }

  async readFile(projectId: string, path: string): Promise<string> {
    const res = await this.api.get<{ content: string }>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}`,
    )
    return res.content
  }

  search(
    projectId: string,
    query: string,
    opts: { topK?: number; queryEmbedding?: number[] | null } = {},
  ): Promise<SearchResponse> {
    return this.api.post(`/api/v1/projects/${encodeURIComponent(projectId)}/search`, {
      query,
      topK: opts.topK,
      queryEmbedding: opts.queryEmbedding ?? null,
    })
  }

  async listReviews(
    projectId: string,
    status: "unresolved" | "resolved" | "all" = "unresolved",
  ): Promise<ReviewItem[]> {
    const res = await this.api.get<{ reviews: ReviewItem[] }>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/reviews?status=${status}`,
    )
    return res.reviews
  }

  async getConfig(): Promise<Record<string, unknown>> {
    const res = await this.api.get<{ config: Record<string, unknown> }>("/api/v1/config")
    return res.config
  }

  async putConfig(config: Record<string, unknown>): Promise<void> {
    await this.api.put("/api/v1/config", { config })
  }

  async streamChat(
    projectId: string,
    body: ChatRequest,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.api.stream(
      `/api/v1/projects/${encodeURIComponent(projectId)}/chat`,
      body,
      (event, data) => {
        let parsed: unknown = {}
        try {
          parsed = JSON.parse(data)
        } catch {
          parsed = { text: data }
        }
        const obj = parsed as Record<string, unknown>
        switch (event) {
          case "token":
            onEvent({ type: "token", text: String(obj.text ?? "") })
            break
          case "reasoning":
            onEvent({ type: "reasoning", text: String(obj.text ?? "") })
            break
          case "refs":
            onEvent({ type: "refs", pages: Array.isArray(obj.pages) ? obj.pages : [] })
            break
          case "error":
            onEvent({ type: "error", message: String(obj.message ?? "stream error") })
            break
          case "done":
            onEvent({ type: "done" })
            break
          default:
            break
        }
      },
      signal,
    )
  }
}
