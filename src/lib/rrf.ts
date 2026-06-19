/**
 * Reciprocal Rank Fusion (RRF) — the backend-agnostic merge used to combine
 * keyword and vector rankings into a single hybrid ranking.
 *
 * Ported from the Rust implementation in
 * `src-tauri/src/commands/search.rs` (`apply_rrf_scores`, `search_mode`,
 * `RRF_K`). Keeping it here in core lets every SearchEngine backend share the
 * exact same fusion math: the Tauri/LanceDB path (today, in Rust) and the
 * server's Postgres FTS + pgvector path (`apps/server` PgSearchEngine).
 *
 * The Rust version keys keyword hits by normalized path and vector hits by
 * file stem; this generic version takes a unified item key plus separate
 * 0-based rank maps, leaving key derivation to the caller (the pg engine keys
 * by page_id). The fused score for an item is the sum of `1 / (k + rank)`
 * over whichever rankings contain it.
 */

/** Fusion constant; matches `RRF_K` in search.rs. Larger = flatter weighting. */
export const RRF_K = 60.0

/** RRF contribution of a single 0-based rank. */
export function rrfContribution(rank: number, k: number = RRF_K): number {
  return 1.0 / (k + rank)
}

/**
 * Fuse keyword and vector rankings. `keywordRanks` / `vectorRanks` map an
 * item key to its 0-based rank within that ranking. Returns a map from item
 * key to fused score (higher is better). Keys absent from a ranking simply
 * contribute nothing from that side.
 */
export function applyRrfScores(
  keys: Iterable<string>,
  keywordRanks: Map<string, number>,
  vectorRanks: Map<string, number>,
  k: number = RRF_K,
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const key of keys) {
    let rrf = 0
    const kr = keywordRanks.get(key)
    if (kr !== undefined) rrf += rrfContribution(kr, k)
    const vr = vectorRanks.get(key)
    if (vr !== undefined) rrf += rrfContribution(vr, k)
    scores.set(key, rrf)
  }
  return scores
}

export type SearchMode = "keyword" | "vector" | "hybrid"

/**
 * Classify a search response by which signals contributed, mirroring
 * `search_mode` in search.rs: no vector hits → keyword; vector hits but no
 * keyword hits → vector; both → hybrid.
 */
export function searchMode(tokenRankEmpty: boolean, vectorHits: number): SearchMode {
  if (vectorHits === 0) return "keyword"
  if (tokenRankEmpty) return "vector"
  return "hybrid"
}

/**
 * Build a 0-based rank map from an ordered list of keys (best first).
 * Convenience for turning a sorted result list into the rank maps that
 * {@link applyRrfScores} consumes.
 */
export function ranksFromOrder(orderedKeys: string[]): Map<string, number> {
  const ranks = new Map<string, number>()
  orderedKeys.forEach((key, i) => {
    if (!ranks.has(key)) ranks.set(key, i)
  })
  return ranks
}
