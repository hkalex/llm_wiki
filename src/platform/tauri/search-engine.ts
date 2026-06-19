/**
 * Tauri implementation of the `SearchEngine` capability — the Rust
 * `search_project` command (hybrid keyword + vector, RRF-merged). The Tauri
 * backend scans the filesystem on demand, so it only implements `search`;
 * the server impl adds incremental `indexPage`/`removePage` over Postgres FTS.
 */

import { invoke } from "@tauri-apps/api/core"
import { normalizePath } from "@/lib/path-utils"
import type { SearchEngine, SearchEngineResponse } from "../types"

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
