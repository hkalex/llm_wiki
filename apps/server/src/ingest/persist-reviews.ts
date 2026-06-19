/**
 * Drain the headless review store (which core writes to during ingest) into the
 * reviews table, then clear it for the next job. Best-effort; ON CONFLICT keeps
 * it idempotent.
 */
import { useReviewStore } from "@/stores/review-store"
import { query } from "../db/pool"

export async function persistReviews(projectId: string): Promise<number> {
  const items = useReviewStore.getState().items
  for (const it of items) {
    await query(
      `INSERT INTO reviews
         (project_id, id, type, title, description, source_path, affected_pages,
          resolved, resolved_action, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (project_id, id) DO UPDATE SET
         type = EXCLUDED.type, title = EXCLUDED.title, description = EXCLUDED.description,
         source_path = EXCLUDED.source_path, affected_pages = EXCLUDED.affected_pages,
         resolved = EXCLUDED.resolved, resolved_action = EXCLUDED.resolved_action`,
      [
        projectId,
        it.id,
        it.type,
        it.title,
        it.description,
        it.sourcePath ?? null,
        it.affectedPages ?? [],
        it.resolved,
        it.resolvedAction ?? null,
        it.createdAt,
      ],
    )
  }
  useReviewStore.getState().setItems([])
  return items.length
}
