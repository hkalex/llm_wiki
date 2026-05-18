import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { ForbiddenError, NotFoundError } from "../shared/errors"

export interface FileNode {
  name: string
  path: string
  is_dir: boolean
  children?: FileNode[]
}

export interface WikiPageResponse {
  /** Full raw file content (frontmatter + body). Use this for round-trip writes. */
  content: string
  /** Parsed frontmatter object. */
  frontmatter: Record<string, unknown>
}

function wikiDir(storagePath: string): string {
  return path.join(storagePath, "wiki")
}

function safeResolvePage(storagePath: string, pagePath: string): string {
  const base = wikiDir(storagePath)
  const resolved = path.resolve(base, pagePath)
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new ForbiddenError("Path traversal detected")
  }
  return resolved
}

export function getWikiPage(storagePath: string, pagePath: string): WikiPageResponse {
  const fullPath = safeResolvePage(storagePath, pagePath)
  if (!fs.existsSync(fullPath)) throw new NotFoundError(`Wiki page not found: ${pagePath}`)

  const raw = fs.readFileSync(fullPath, "utf-8")
  const parsed = matter(raw)
  return { content: raw, frontmatter: parsed.data as Record<string, unknown> }
}

export function putWikiPage(storagePath: string, pagePath: string, content: string): void {
  const fullPath = safeResolvePage(storagePath, pagePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content, "utf-8")
}

export function deleteWikiPage(storagePath: string, pagePath: string): void {
  const fullPath = safeResolvePage(storagePath, pagePath)
  if (!fs.existsSync(fullPath)) throw new NotFoundError(`Wiki page not found: ${pagePath}`)
  fs.unlinkSync(fullPath)
  // Remove empty ancestor directories up to wiki root
  pruneEmptyDirs(path.dirname(fullPath), wikiDir(storagePath))
}

function pruneEmptyDirs(dir: string, root: string): void {
  if (dir === root || !dir.startsWith(root)) return
  try {
    const entries = fs.readdirSync(dir)
    if (entries.length === 0) {
      fs.rmdirSync(dir)
      pruneEmptyDirs(path.dirname(dir), root)
    }
  } catch {
    // Non-critical
  }
}

export function listWikiTree(storagePath: string): FileNode[] {
  const base = wikiDir(storagePath)
  fs.mkdirSync(base, { recursive: true })
  return buildTree(base, base)
}

function buildTree(dir: string, base: string): FileNode[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .map((entry) => {
      // Relative to wiki root
      const relPath = path.relative(base, path.join(dir, entry.name)).replace(/\\/g, "/")
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: relPath,
          is_dir: true,
          children: buildTree(path.join(dir, entry.name), base),
        }
      }
      return { name: entry.name, path: relPath, is_dir: false }
    })
}

export function wikiPageExists(storagePath: string, pagePath: string): boolean {
  try {
    const fullPath = safeResolvePage(storagePath, pagePath)
    return fs.existsSync(fullPath)
  } catch {
    return false
  }
}
