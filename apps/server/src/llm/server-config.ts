/**
 * Server-side LLM config. Lives in server_config (key "llm"), set by an admin
 * via PUT /api/v1/config — so provider API keys stay server-side, never on the
 * thin clients. Shape matches core's LlmConfig (reused by streamChat).
 */
import { query } from "../db/pool"
import type { LlmConfig } from "@/stores/wiki-store"

export async function getServerLlmConfig(): Promise<LlmConfig | null> {
  const rows = await query<{ value: LlmConfig }>(
    "SELECT value FROM server_config WHERE key = 'llm' LIMIT 1",
  )
  return rows[0]?.value ?? null
}
