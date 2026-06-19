/**
 * Tauri implementation of the `VectorStore` capability — LanceDB v2 via the
 * Rust `vector_*` commands. `@tauri-apps/api/core` is imported lazily (per
 * call) so importing `@/platform` stays Node-safe; see filesystem.ts.
 */

import { normalizePath } from "@/lib/path-utils"
import type { ChunkSearchResult, VectorStore } from "../types"

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core")
  return core.invoke<T>(cmd, args)
}

export function createTauriVectorStore(): VectorStore {
  return {
    async upsertChunks(projectPath, pageId, chunks) {
      await invoke("vector_upsert_chunks", {
        projectPath: normalizePath(projectPath),
        pageId,
        chunks: chunks.map((c) => ({
          chunk_index: c.chunkIndex,
          chunk_text: c.chunkText,
          heading_path: c.headingPath,
          embedding: c.embedding.map((v) => Math.fround(v)),
        })),
      })
    },

    async searchChunks(projectPath, queryEmbedding, topK) {
      return await invoke<ChunkSearchResult[]>("vector_search_chunks", {
        projectPath: normalizePath(projectPath),
        queryEmbedding: queryEmbedding.map((v) => Math.fround(v)),
        topK,
      })
    },

    async deletePage(projectPath, pageId) {
      await invoke("vector_delete_page", {
        projectPath: normalizePath(projectPath),
        pageId,
      })
    },

    async countChunks(projectPath) {
      return await invoke<number>("vector_count_chunks", {
        projectPath: normalizePath(projectPath),
      })
    },

    async clearChunks(projectPath) {
      await invoke("vector_clear_chunks", {
        projectPath: normalizePath(projectPath),
      })
    },

    async optimizeChunks(projectPath) {
      await invoke("vector_optimize_chunks", {
        projectPath: normalizePath(projectPath),
      })
    },

    async legacyRowCount(projectPath) {
      try {
        return await invoke<number>("vector_legacy_row_count", {
          projectPath: normalizePath(projectPath),
        })
      } catch {
        return 0
      }
    },

    async dropLegacy(projectPath) {
      await invoke("vector_drop_legacy", {
        projectPath: normalizePath(projectPath),
      })
    },
  }
}
