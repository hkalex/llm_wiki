/**
 * Path-traversal defenses, ported from `src-tauri/src/api_server.rs`
 * (`safe_join`, `is_public_project_rel`). The HTTP API only ever serves the
 * public surface of a project (wiki/, raw/sources|assets/, purpose.md,
 * schema.md); internal `.llm-wiki/` state is never exposed.
 */
import path from "node:path"

/** Join a project root with a relative path, rejecting escapes. */
export function safeJoin(root: string, relPath: string): string | null {
  const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "")
  const rootResolved = path.resolve(root)
  const joined = path.resolve(rootResolved, rel)
  if (joined !== rootResolved && !joined.startsWith(rootResolved + path.sep)) {
    return null
  }
  return joined
}

const PUBLIC_PREFIXES = ["wiki/", "raw/sources/", "raw/assets/"]
const PUBLIC_DIRS = new Set(["wiki", "raw", "raw/sources", "raw/assets"])
const PUBLIC_FILES = new Set(["purpose.md", "schema.md"])

/** Whether a project-relative path may be exposed over the API. */
export function isPublicProjectRel(relPath: string): boolean {
  const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
  if (rel === "" || rel.startsWith(".llm-wiki")) return false
  if (PUBLIC_FILES.has(rel) || PUBLIC_DIRS.has(rel)) return true
  return PUBLIC_PREFIXES.some((p) => rel.startsWith(p))
}
