import { eq, and, isNull } from "drizzle-orm"
import { getDb } from "../db/database"
import { settings } from "../db/schema"

const KEY_PATTERN = /key|secret|token|password/i

function maskValue(key: string, value: string): string {
  return KEY_PATTERN.test(key) && value ? "****" : value
}

export function getSettings(
  userId: string,
  projectId?: string | null,
): Record<string, string> {
  const db = getDb()
  const rows = db
    .select()
    .from(settings)
    .where(
      projectId
        ? and(eq(settings.userId, userId), eq(settings.projectId, projectId))
        : and(eq(settings.userId, userId), isNull(settings.projectId)),
    )
    .all()

  return Object.fromEntries(rows.map((r) => [r.key, maskValue(r.key, r.value)]))
}

/** Return raw (unmasked) settings for internal server use only. Never expose to clients. */
export function getRawSettings(
  userId: string,
  projectId?: string | null,
): Record<string, string> {
  const db = getDb()
  const rows = db
    .select()
    .from(settings)
    .where(
      projectId
        ? and(eq(settings.userId, userId), eq(settings.projectId, projectId))
        : and(eq(settings.userId, userId), isNull(settings.projectId)),
    )
    .all()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function patchSettings(
  userId: string,
  updates: Record<string, string>,
  projectId?: string | null,
): Record<string, string> {
  const db = getDb()
  const now = Date.now()

  for (const [key, value] of Object.entries(updates)) {
    // Skip masked values — client sending "****" means "don't change"
    if (value === "****") continue

    const existing = db
      .select()
      .from(settings)
      .where(
        projectId
          ? and(
              eq(settings.userId, userId),
              eq(settings.projectId, projectId),
              eq(settings.key, key),
            )
          : and(
              eq(settings.userId, userId),
              isNull(settings.projectId),
              eq(settings.key, key),
            ),
      )
      .get()

    if (existing) {
      db.update(settings)
        .set({ value, updatedAt: now })
        .where(eq(settings.id, existing.id))
        .run()
    } else {
      db.insert(settings)
        .values({
          id: crypto.randomUUID(),
          userId,
          projectId: projectId ?? null,
          key,
          value,
          updatedAt: now,
        })
        .run()
    }
  }

  return getSettings(userId, projectId)
}
