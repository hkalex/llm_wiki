/**
 * Server configuration, entirely env-driven so the same image runs on a home
 * server and in the cloud (see deploy/docker-compose.yml). Secrets — provider
 * API keys, the bootstrap admin token — live here, never on the thin clients.
 */

export interface ServerConfig {
  port: number
  host: string
  /** Postgres connection string (pgvector-enabled). */
  databaseUrl: string
  /** Root dir holding per-project files: <dataDir>/<projectId>/... */
  dataDir: string
  /** Bootstrap admin API key; first-boot equivalent of LLM_WIKI_API_TOKEN. */
  bootstrapAdminToken: string | null
  /** Allow unauthenticated read access (single-user home/LAN convenience). */
  allowUnauthenticated: boolean
  /** Default embedding dimensionality for the pgvector column/index. */
  embeddingDim: number
  /** CORS allowlist; "*" permits any origin (LAN/dev). */
  corsOrigins: string
  /** Vector backend selector — only "pgvector" implemented server-side today. */
  vectorBackend: "pgvector"
  /** If set, serve the built web app (SPA) from this dir for single-origin. */
  webDir: string | null
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : fallback
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  return raw === "1" || raw.toLowerCase() === "true"
}

export function loadConfig(): ServerConfig {
  return {
    port: int("PORT", 8080),
    host: process.env.HOST ?? "0.0.0.0",
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgres://llmwiki:llmwiki@localhost:5432/llmwiki",
    dataDir: process.env.DATA_DIR ?? "/data/projects",
    bootstrapAdminToken:
      process.env.LLM_WIKI_AUTH_TOKEN ?? process.env.LLM_WIKI_API_TOKEN ?? null,
    allowUnauthenticated: bool("ALLOW_UNAUTHENTICATED", false),
    embeddingDim: int("EMBEDDING_DIM", 1536),
    corsOrigins: process.env.CORS_ORIGINS ?? "*",
    vectorBackend: "pgvector",
    webDir: process.env.WEB_DIR ?? null,
  }
}
