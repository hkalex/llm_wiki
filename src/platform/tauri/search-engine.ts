/**
 * Tauri implementation of the `SearchEngine` capability — the Rust
 * `search_project` command (hybrid keyword + vector, RRF-merged). The Tauri
 * backend scans the filesystem on demand, so it only implements `search`.
 * `@tauri-apps/api/core` is imported lazily (per call); see filesystem.ts.
 */

import { normalizePath } from "@/lib/path-utils"
import type { SearchEngine, SearchEngineResponse } from "../types"

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core")
  return core.invoke<T>(cmd, args)
}

export function createTauriSearchEngine(): SearchEngine {
  return {
    async search(projectPath, query, opts): Promise<SearchEngineResponse> {
      return await invoke<SearchEngineResponse>("search_project", {
        projectPath: normalizePath(projectPath),
        query,
        topK: opts.topK,
        includeContent: opts.includeContent ?? false,
        queryEmbedding: opts.queryEmbedding ?? null,
        embeddingConfig: opts.embeddingConfig,
      })
    },
  }
}
