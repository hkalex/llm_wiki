/**
 * Server-side query embedding — reuses core `fetchEmbedding` (multi-provider,
 * retry/backoff) with the server's stored EmbeddingConfig. Returns null when no
 * embedding provider is configured, so callers degrade to keyword-only search.
 */
import { fetchEmbedding } from "@/lib/embedding"
import { getServerEmbeddingConfig } from "./server-config"

export async function embedQuery(text: string): Promise<number[] | null> {
  const cfg = await getServerEmbeddingConfig()
  if (!cfg) return null
  try {
    return await fetchEmbedding(text, cfg)
  } catch {
    return null
  }
}
