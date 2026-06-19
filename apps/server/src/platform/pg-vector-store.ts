/**
 * pgvector implementation of chunk storage + nearest-neighbour search. This is
 * the server's default VectorStore backend (the abstraction the plan calls for
 * — LanceDB on desktop, pgvector here, others pluggable later).
 *
 * Cosine distance via `<=>`; score = 1 - distance to match the LanceDB-shaped
 * ChunkSearchResult the core `searchByEmbedding` consumes. Brute-force scan for
 * now (column is dimension-agnostic); pin a dim + add an HNSW index for scale.
 */
import { query, toVectorLiteral, withTransaction } from "../db/pool"

export interface ChunkUpsert {
  chunkIndex: number
  chunkText: string
  headingPath: string
  embedding: number[]
}

export interface ChunkSearchResult {
  chunk_id: string
  page_id: string
  chunk_index: number
  chunk_text: string
  heading_path: string
  score: number
}

export async function upsertChunks(
  projectId: string,
  pageId: string,
  chunks: ChunkUpsert[],
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("DELETE FROM chunks WHERE project_id = $1 AND page_id = $2", [
      projectId,
      pageId,
    ])
    for (const c of chunks) {
      await client.query(
        `INSERT INTO chunks
           (project_id, chunk_id, page_id, chunk_index, chunk_text, heading_path, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
        [
          projectId,
          `${pageId}#${c.chunkIndex}`,
          pageId,
          c.chunkIndex,
          c.chunkText,
          c.headingPath,
          toVectorLiteral(c.embedding),
        ],
      )
    }
  })
}

export async function searchChunks(
  projectId: string,
  queryEmbedding: number[],
  topK: number,
): Promise<ChunkSearchResult[]> {
  const rows = await query<{
    chunk_id: string
    page_id: string
    chunk_index: number
    chunk_text: string
    heading_path: string
    score: string
  }>(
    `SELECT chunk_id, page_id, chunk_index, chunk_text, heading_path,
            1 - (embedding <=> $2::vector) AS score
     FROM chunks
     WHERE project_id = $1 AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [projectId, toVectorLiteral(queryEmbedding), topK],
  )
  return rows.map((r) => ({
    chunk_id: r.chunk_id,
    page_id: r.page_id,
    chunk_index: r.chunk_index,
    chunk_text: r.chunk_text,
    heading_path: r.heading_path,
    score: Number(r.score),
  }))
}

export async function deletePage(projectId: string, pageId: string): Promise<void> {
  await query("DELETE FROM chunks WHERE project_id = $1 AND page_id = $2", [
    projectId,
    pageId,
  ])
}

export async function countChunks(projectId: string): Promise<number> {
  const rows = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM chunks WHERE project_id = $1",
    [projectId],
  )
  return Number(rows[0]?.n ?? 0)
}

export async function clearChunks(projectId: string): Promise<void> {
  await query("DELETE FROM chunks WHERE project_id = $1", [projectId])
}
