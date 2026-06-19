/**
 * Platform registry — the single place core logic obtains its capability
 * implementations. Consumers call the typed accessors (e.g. `getFilesystem()`)
 * rather than importing Tauri or Node modules directly.
 *
 * Resolution order for each capability:
 *  1. An implementation explicitly installed via `setPlatform()` (the server
 *     calls this at startup with Node adapters; tests may install fakes).
 *  2. A lazy Tauri default — only in a browser/webview environment. This keeps
 *     the desktop app and the existing vitest suite (which mock `invoke`)
 *     working without any startup wiring.
 *  3. In Node with nothing installed, the accessor throws — so the server can
 *     never silently fall through to Tauri code paths.
 */

import type { ConfigProvider, Filesystem, Platform, SearchEngine, VectorStore } from "./types"
import { createTauriFilesystem } from "./tauri/filesystem"
import { createTauriVectorStore } from "./tauri/vector-store"
import { createTauriSearchEngine } from "./tauri/search-engine"
import { createTauriConfigProvider } from "./tauri/config-provider"

export * from "./types"

const registry: Partial<Platform> = {}

/** Install (or override) platform capabilities. Merges with what's present. */
export function setPlatform(impl: Partial<Platform>): void {
  Object.assign(registry, impl)
}

/** Reset installed capabilities — primarily for tests. */
export function resetPlatform(): void {
  for (const key of Object.keys(registry) as Array<keyof Platform>) {
    delete registry[key]
  }
}

const isBrowserEnv = typeof window !== "undefined"

function missing(capability: string): never {
  throw new Error(
    `Platform.${capability} is not initialized. ` +
      `Call setPlatform({ ${capability}: ... }) at startup before using core APIs.`,
  )
}

export function getFilesystem(): Filesystem {
  if (registry.filesystem) return registry.filesystem
  if (!isBrowserEnv) missing("filesystem")
  registry.filesystem = createTauriFilesystem()
  return registry.filesystem
}

export function getVectorStore(): VectorStore {
  if (registry.vectorStore) return registry.vectorStore
  if (!isBrowserEnv) missing("vectorStore")
  registry.vectorStore = createTauriVectorStore()
  return registry.vectorStore
}

export function getSearchEngine(): SearchEngine {
  if (registry.searchEngine) return registry.searchEngine
  if (!isBrowserEnv) missing("searchEngine")
  registry.searchEngine = createTauriSearchEngine()
  return registry.searchEngine
}

export function getConfig(): ConfigProvider {
  if (registry.config) return registry.config
  if (!isBrowserEnv) missing("config")
  registry.config = createTauriConfigProvider()
  return registry.config
}
