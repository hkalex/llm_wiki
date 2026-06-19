/**
 * Node implementations of the CORE platform interfaces (@/platform), installed
 * via setPlatform() so the reused core (ingest pipeline, embedding) runs
 * server-side with Node filesystem + pgvector instead of Tauri/LanceDB.
 *
 * Conventions matched to the Tauri/Rust backend so core behaves identically:
 *  - Filesystem.listDirectory returns a RECURSIVE tree with ABSOLUTE `path`
 *    (core passes node.path straight to readFile).
 *  - VectorStore is keyed by projectPath; the project id is the dir basename
 *    (projectDir(id) = <dataDir>/<id>), matching pg-storage.
 *
 * ConfigProvider must be synchronous (core reads it inline), so per-job we load
 * a config snapshot from server_config and serve it synchronously. The serial
 * ingest worker makes a process-global install safe.
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import {
  setPlatform,
  type ConfigProvider,
  type FileBase64,
  type FileNode,
  type Filesystem,
  type ReadFileOptions,
  type VectorStore,
} from "@/platform"
import type {
  EmbeddingConfig,
  LlmConfig,
  MineruConfig,
  MultimodalConfig,
  OutputLanguage,
} from "@/stores/wiki-store"
import {
  clearChunks,
  countChunks,
  deletePage,
  searchChunks,
  upsertChunks,
} from "./pg-vector-store"
import { query } from "../db/pool"

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".md": "text/markdown",
  ".txt": "text/plain",
}

function guessMime(p: string): string {
  return MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream"
}

function projectIdFromPath(projectPath: string): string {
  return path.basename(projectPath.replace(/[/\\]+$/, ""))
}

async function listAbsolute(dir: string): Promise<FileNode[]> {
  let entries: import("node:fs").Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const nodes: FileNode[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: abs,
        is_dir: true,
        children: await listAbsolute(abs),
      })
    } else {
      nodes.push({ name: entry.name, path: abs, is_dir: false })
    }
  }
  return nodes
}

async function copyDirRecursive(src: string, dst: string): Promise<string[]> {
  const copied: string[] = []
  const entries = await fs.readdir(src, { withFileTypes: true })
  await fs.mkdir(dst, { recursive: true })
  for (const entry of entries) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      copied.push(...(await copyDirRecursive(s, d)))
    } else {
      await fs.copyFile(s, d)
      copied.push(d)
    }
  }
  return copied
}

export function createNodeFilesystem(): Filesystem {
  return {
    async readFile(p: string, _options?: ReadFileOptions): Promise<string> {
      return fs.readFile(p, "utf-8")
    },
    async writeFile(p, contents) {
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(p, contents, "utf-8")
    },
    async writeFileBase64(p, base64) {
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(p, Buffer.from(base64, "base64"))
    },
    async writeFileAtomic(p, contents) {
      await fs.mkdir(path.dirname(p), { recursive: true })
      const tmp = `${p}.tmp-${process.pid}-${Date.now()}`
      await fs.writeFile(tmp, contents, "utf-8")
      await fs.rename(tmp, p)
    },
    listDirectory(p) {
      return listAbsolute(p)
    },
    async copyFile(source, destination) {
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.copyFile(source, destination)
    },
    copyDirectory(source, destination) {
      return copyDirRecursive(source, destination)
    },
    async preprocessFile(p) {
      // Text/markdown sources (the scraper push path) read directly. Binary
      // formats (PDF/DOCX) need a Node parser — a documented follow-up; the
      // Rust backend did this natively.
      return fs.readFile(p, "utf-8")
    },
    async deleteFile(p) {
      await fs.rm(p, { force: true })
    },
    async createDirectory(p) {
      await fs.mkdir(p, { recursive: true })
    },
    async fileExists(p) {
      try {
        await fs.access(p)
        return true
      } catch {
        return false
      }
    },
    async getFileModifiedTime(p) {
      const st = await fs.stat(p)
      return Math.floor(st.mtimeMs)
    },
    async getFileSize(p) {
      const st = await fs.stat(p)
      return st.size
    },
    async getFileMd5(p) {
      const buf = await fs.readFile(p)
      return createHash("md5").update(buf).digest("hex")
    },
    async readFileAsBase64(p): Promise<FileBase64> {
      const buf = await fs.readFile(p)
      return { base64: buf.toString("base64"), mimeType: guessMime(p) }
    },
  }
}

export function createNodeVectorStore(): VectorStore {
  return {
    upsertChunks(projectPath, pageId, chunks) {
      return upsertChunks(projectIdFromPath(projectPath), pageId, chunks)
    },
    searchChunks(projectPath, queryEmbedding, topK) {
      return searchChunks(projectIdFromPath(projectPath), queryEmbedding, topK)
    },
    deletePage(projectPath, pageId) {
      return deletePage(projectIdFromPath(projectPath), pageId)
    },
    countChunks(projectPath) {
      return countChunks(projectIdFromPath(projectPath))
    },
    clearChunks(projectPath) {
      return clearChunks(projectIdFromPath(projectPath))
    },
    async optimizeChunks() {
      // pgvector needs no client-side compaction.
    },
    async legacyRowCount() {
      return 0
    },
    async dropLegacy() {
      // no legacy table on the server
    },
  }
}

export interface ConfigSnapshot {
  llm: LlmConfig | null
  embedding: EmbeddingConfig | null
  multimodal: MultimodalConfig | null
  mineru: MineruConfig | null
  outputLanguage: OutputLanguage | null
}

export async function loadConfigSnapshot(): Promise<ConfigSnapshot> {
  const rows = await query<{ key: string; value: unknown }>(
    "SELECT key, value FROM server_config WHERE key = ANY($1)",
    [["llm", "embedding", "multimodal", "mineru", "outputLanguage"]],
  )
  const by = new Map(rows.map((r) => [r.key, r.value]))
  return {
    llm: (by.get("llm") as LlmConfig) ?? null,
    embedding: (by.get("embedding") as EmbeddingConfig) ?? null,
    multimodal: (by.get("multimodal") as MultimodalConfig) ?? null,
    mineru: (by.get("mineru") as MineruConfig) ?? null,
    outputLanguage: (by.get("outputLanguage") as OutputLanguage) ?? null,
  }
}

function createSnapshotConfigProvider(snapshot: ConfigSnapshot): ConfigProvider {
  return {
    getLlmConfig: () => snapshot.llm ?? ({} as LlmConfig),
    getEmbeddingConfig: () => snapshot.embedding ?? ({ provider: "openai" } as unknown as EmbeddingConfig),
    getMultimodalConfig: () => snapshot.multimodal ?? ({ enabled: false } as unknown as MultimodalConfig),
    getMineruConfig: () => snapshot.mineru ?? ({ enabled: false } as unknown as MineruConfig),
    getOutputLanguage: () => snapshot.outputLanguage ?? ("auto" as OutputLanguage),
  }
}

/** Install Node platform capabilities for the current (serial) ingest job. */
export function installNodePlatform(snapshot: ConfigSnapshot): void {
  setPlatform({
    filesystem: createNodeFilesystem(),
    vectorStore: createNodeVectorStore(),
    config: createSnapshotConfigProvider(snapshot),
  })
}
