/**
 * Tauri implementation of the `ConfigProvider` capability — reads the live
 * configuration out of the Zustand `useWikiStore`. On the server this is
 * replaced by an adapter backed by server-side settings, so core pipeline
 * code (ingest, search, embedding) never reaches into the UI store directly.
 */

import { useWikiStore } from "@/stores/wiki-store"
import type { ConfigProvider } from "../types"

export function createTauriConfigProvider(): ConfigProvider {
  return {
    getLlmConfig: () => useWikiStore.getState().llmConfig,
    getEmbeddingConfig: () => useWikiStore.getState().embeddingConfig,
    getMultimodalConfig: () => useWikiStore.getState().multimodalConfig,
    getMineruConfig: () => useWikiStore.getState().mineruConfig,
    getOutputLanguage: () => useWikiStore.getState().outputLanguage,
  }
}
