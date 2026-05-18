import fs from "fs"
import path from "path"

function require_env(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

function load_dotenv() {
  const envFile = path.resolve(process.cwd(), ".env")
  if (!fs.existsSync(envFile)) return
  const lines = fs.readFileSync(envFile, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

load_dotenv()

export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  jwtSecret: require_env("JWT_SECRET"),
  databaseUrl: process.env.DATABASE_URL ?? "./data/llmwiki.db",
  storagePath: path.resolve(process.env.STORAGE_PATH ?? "./data/projects"),
  lancedbPath: path.resolve(process.env.LANCEDB_PATH ?? "./data/vector"),
  defaultLlmProvider: process.env.DEFAULT_LLM_PROVIDER ?? "openai",
  defaultLlmModel: process.env.DEFAULT_LLM_MODEL ?? "gpt-4o",
  defaultLlmApiKey: process.env.DEFAULT_LLM_API_KEY ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  ingestRateLimitPerHour: parseInt(process.env.INGEST_RATE_LIMIT_PER_HOUR ?? "20", 10),
  storageQuotaBytes: parseInt(process.env.STORAGE_QUOTA_MB ?? "0", 10) * 1024 * 1024,
} as const

// Fail fast: a set but malformed ENCRYPTION_KEY would otherwise silently
// throw "Invalid key length" on the first API-key save, deep in a request.
if (config.encryptionKey && !/^[0-9a-f]{64}$/i.test(config.encryptionKey)) {
  throw new Error(
    "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
    "Generate one with: openssl rand -hex 32",
  )
}
