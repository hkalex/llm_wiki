/**
 * Turn a pushed scraper item into a source file on disk under
 * raw/sources/<folder>/<slug>.md, with YAML frontmatter carrying provenance.
 * Files stay the source of truth; the ingest worker then runs the core
 * pipeline over them (same as a user dropping a file in raw/sources).
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { projectDir } from "../platform/pg-storage"
import { safeJoin } from "../util/safe-join"
import type { IngestItemDto } from "../types"

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/gi, "-")
    .replace(/^-+|-+$/g, "")
  return base.slice(0, 80) || "item"
}

function frontmatter(item: IngestItemDto): string {
  const lines = [
    "---",
    `title: ${JSON.stringify(item.title ?? "")}`,
    item.url ? `url: ${item.url}` : null,
    item.publishedAt ? `published: ${item.publishedAt}` : null,
    `external_id: ${item.externalId}`,
    item.tags && item.tags.length
      ? `tags: [${item.tags.map((t) => JSON.stringify(t)).join(", ")}]`
      : null,
    "---",
    "",
  ]
  return lines.filter((l): l is string => l !== null).join("\n")
}

/** Write the item to disk; returns its project-relative path. */
export async function materializeSourceItem(
  projectId: string,
  item: IngestItemDto,
): Promise<string> {
  const folder =
    (item.folderContext ?? "news")
      .split(/[>/]/)
      .map((s) => slugify(s.trim()))
      .filter(Boolean)
      .join("/") || "news"
  const slug = slugify(item.externalId || item.title || "item")
  const rel = `raw/sources/${folder}/${slug}.md`
  const abs = safeJoin(projectDir(projectId), rel)
  if (!abs) throw new Error(`unsafe path for item ${item.externalId}`)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  const body =
    item.content ??
    (item.contentBase64 ? Buffer.from(item.contentBase64, "base64").toString("utf-8") : "")
  await fs.writeFile(abs, `${frontmatter(item)}${body}\n`, "utf-8")
  return rel
}
