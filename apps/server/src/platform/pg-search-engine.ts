/**
 * Hybrid keyword + vector search over Postgres, fused with the SAME RRF math
 * the Rust/LanceDB path uses (core `src/lib/rrf.ts`). This is the server
 * implementation of the SearchEngine abstraction.
 *
 * - Keyword: Postgres FTS over `pages.fts` (ts_rank_cd).
 * - Vector: `pg-vector-store.searchChunks`, aggregated to best-per-page.
 * - Merge: applyRrfScores keyed by page_id; mode via searchMode().
 *
 * Query embeddings are passed in (computed by the caller from server config in
 * Phase 3); when absent, this degrades to keyword-only — matching the existing
 * `search_project` contract.
 *
 * Note: CJK FTS currently uses the 'simple' config; bigram tokenization at
 * index time (reusing core tokenizeQuery) is a documented refinement.
 */
import { applyRrfScores, ranksFromOrder, searchMode } from "../../../../src/lib/rrf"
import { query } from "../db/pool"
import { searchChunks } from "./pg-vector-store"
import type { SearchResponseDto, SearchResultDto } from "../types"

export interface SearchOptions {
  topK?: number
  queryEmbedding?: number[] | null
}

interface PageMeta {
  page_id: string
  rel_path: string
  title: string
}

export async function search(
  projectId: string,
  queryText: string,
  options: SearchOptions = {},
): Promise<SearchResponseDto> {
  const topK = options.topK ?? 20
  const trimmed = queryText.trim()
  if (!trimmed) {
    return { mode: "keyword", results: [], tokenHits: 0, vectorHits: 0 }
  }

  // ── Keyword side (Postgres FTS) ──
  const keywordRows = await query<PageMeta & { rank: string }>(
    `SELECT page_id, rel_path, title, ts_rank_cd(fts, q) AS rank
     FROM pages, websearch_to_tsquery('simple', $2) q
     WHERE project_id = $1 AND fts @@ q
     ORDER BY rank DESC
     LIMIT $3`,
    [projectId, trimmed, topK * 3],
  )
  const keywordOrder = keywordRows.map((r) => r.page_id)
  const keywordRanks = ranksFromOrder(keywordOrder)

  // ── Vector side (pgvector, aggregated to best-per-page) ──
  let vectorOrder: string[] = []
  const vectorScoreByPage = new Map<string, number>()
  const snippetByPage = new Map<string, string>()
  if (options.queryEmbedding && options.queryEmbedding.length > 0) {
    const chunks = await searchChunks(
      projectId,
      options.queryEmbedding,
      Math.max(topK * 3, 30),
    )
    for (const c of chunks) {
      const prev = vectorScoreByPage.get(c.page_id)
      if (prev === undefined || c.score > prev) {
        vectorScoreByPage.set(c.page_id, c.score)
        snippetByPage.set(c.page_id, c.chunk_text.slice(0, 200))
      }
    }
    vectorOrder = [...vectorScoreByPage.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pageId]) => pageId)
  }
  const vectorRanks = ranksFromOrder(vectorOrder)

  // ── Fuse ──
  const allPageIds = new Set<string>([...keywordOrder, ...vectorOrder])
  const tokenHits = keywordRanks.size
  const vectorHits = vectorRanks.size

  // Gather page metadata for every candidate (keyword rows already have it).
  const metaByPage = new Map<string, PageMeta>()
  for (const r of keywordRows) metaByPage.set(r.page_id, r)
  const missing = [...allPageIds].filter((id) => !metaByPage.has(id))
  if (missing.length > 0) {
    const rows = await query<PageMeta>(
      `SELECT page_id, rel_path, title FROM pages
       WHERE project_id = $1 AND page_id = ANY($2)`,
      [projectId, missing],
    )
    for (const r of rows) metaByPage.set(r.page_id, r)
  }

  let mode: SearchResponseDto["mode"]
  let scores: Map<string, number>
  if (vectorHits === 0) {
    // Keyword-only: preserve FTS rank order via descending rank score.
    mode = "keyword"
    scores = new Map(keywordRows.map((r) => [r.page_id, Number(r.rank)]))
  } else {
    mode = searchMode(keywordRanks.size === 0, vectorHits)
    scores = applyRrfScores(allPageIds, keywordRanks, vectorRanks)
  }

  const results: SearchResultDto[] = [...allPageIds]
    .map((pageId): SearchResultDto | null => {
      const meta = metaByPage.get(pageId)
      if (!meta) return null
      const vectorScore = vectorScoreByPage.get(pageId)
      return {
        path: meta.rel_path,
        title: meta.title || meta.page_id,
        snippet: snippetByPage.get(pageId) ?? "",
        titleMatch: meta.title
          ? meta.title.toLowerCase().includes(trimmed.toLowerCase())
          : false,
        score: scores.get(pageId) ?? 0,
        ...(vectorScore !== undefined ? { vectorScore } : {}),
      }
    })
    .filter((r): r is SearchResultDto => r !== null)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, topK)

  return { mode, results, tokenHits, vectorHits }
}
