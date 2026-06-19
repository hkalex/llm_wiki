/**
 * API key issuance + verification. Keys are random, stored only as SHA-256
 * hashes, and compared in constant time (mirrors api_server.rs's
 * constant_time_eq). Scopes (client / scraper / admin) gate which routes a key
 * may call; project_ids (null = all) gate which projects it may touch.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { query } from "../db/pool"
import type { ApiKeyScope, AuthContext } from "../types"

export function generateApiKey(): string {
  return `lwk_${randomBytes(24).toString("base64url")}`
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

interface KeyRow {
  scope: string
  project_ids: string[] | null
  revoked: boolean
}

/** Resolve a presented key to its auth context, or null if unknown/revoked. */
export async function lookupKey(presented: string): Promise<AuthContext | null> {
  const keyHash = hashKey(presented)
  const rows = await query<KeyRow>(
    "SELECT scope, project_ids, revoked FROM api_keys WHERE key_hash = $1 LIMIT 1",
    [keyHash],
  )
  const row = rows[0]
  if (!row || row.revoked) return null
  void query("UPDATE api_keys SET last_used = now() WHERE key_hash = $1", [keyHash]).catch(
    () => {},
  )
  return { scope: row.scope as ApiKeyScope, projectIds: row.project_ids }
}

/** Persist a freshly generated key; returns the plaintext (shown once). */
export async function createApiKey(
  name: string,
  scope: ApiKeyScope,
  projectIds: string[] | null,
): Promise<string> {
  const key = generateApiKey()
  await query(
    `INSERT INTO api_keys (id, name, key_hash, scope, project_ids)
     VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
    [name, hashKey(key), scope, projectIds],
  )
  return key
}
