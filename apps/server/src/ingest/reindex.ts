/**
 * After core ingest writes wiki/*.md and upserts chunk vectors, refresh the
 * Postgres `pages` table (titles + FTS) so keyword search works. page_id is the
 * filename stem — matching core's chunk page_id convention — so the hybrid
 * SearchEngine joins chunks (vectors) and pages (FTS) on the same key.
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { query } from "../db/pool"

const SKIP_STEMS = new Set(["index", "log", "overview"])

async function walkMd(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walkMd(abs)))
    else if (entry.name.endsWith(".md")) out.push(abs)
  }
  return out
}

function readFrontmatter(content: string): { title?: string; type?: string } {
  if (!content.startsWith("---")) return {}
  const end = content.indexOf("\n---", 3)
  if (end === -1) return {}
  const out: { title?: string; type?: string } = {}
  for (const line of content.slice(3, end).split("\n")) {
    const m = /^\s*(title|type):\s*(.+?)\s*$/.exec(line)
    if (m) out[m[1] as "title" | "type"] = m[2].replace(/^["']|["']$/g, "")
  }
  return out
}

export async function reindexPages(projectId: string, projectPath: string): Promise<number> {
  const files = await walkMd(path.join(projectPath, "wiki"))
  let n = 0
  for (const abs of files) {
    const stem = path.basename(abs).replace(/\.md$/, "")
    if (SKIP_STEMS.has(stem)) continue
    let content = ""
    try {
      content = await fs.readFile(abs, "utf-8")
    } catch {
      continue
    }
    const rel = path.relative(projectPath, abs).split(path.sep).join("/")
    const { title, type } = readFrontmatter(content)
    const hash = createHash("sha256").update(content).digest("hex")
    await query(
      `INSERT INTO pages (project_id, page_id, rel_path, title, type, content_hash, fts, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, to_tsvector('simple', $7), now())
       ON CONFLICT (project_id, page_id) DO UPDATE SET
         rel_path = EXCLUDED.rel_path, title = EXCLUDED.title, type = EXCLUDED.type,
         content_hash = EXCLUDED.content_hash, fts = EXCLUDED.fts, updated_at = now()`,
      [projectId, stem, rel, title ?? stem, type ?? "page", hash, `${title ?? stem}\n${content}`],
    )
    n++
  }
  return n
}
