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
} as const
