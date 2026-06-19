/**
 * Node filesystem helpers for the read endpoints. (The full core `Filesystem`
 * capability — used by the ingest pipeline — is wired in Phase 2 alongside the
 * core-reuse build setup; these focused helpers cover Phase 1 reads.)
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import type { FileNodeDto } from "../types"

export async function readText(absPath: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
  const stat = await fs.stat(absPath)
  if (stat.size > maxBytes) {
    throw new Error(`file too large (${stat.size} > ${maxBytes})`)
  }
  return fs.readFile(absPath, "utf-8")
}

export async function exists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath)
    return true
  } catch {
    return false
  }
}

/**
 * Build a FileNode tree rooted at `absRoot`, returning paths relative to it.
 * `recursive=false` lists only the immediate children.
 */
export async function listTree(
  absRoot: string,
  options: { recursive?: boolean; relBase?: string } = {},
): Promise<FileNodeDto[]> {
  const { recursive = true, relBase = "" } = options
  let entries: import("node:fs").Dirent[]
  try {
    entries = await fs.readdir(absRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const nodes: FileNodeDto[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const node: FileNodeDto = { name: entry.name, path: rel, is_dir: true }
      if (recursive) {
        node.children = await listTree(path.join(absRoot, entry.name), {
          recursive,
          relBase: rel,
        })
      }
      nodes.push(node)
    } else {
      nodes.push({ name: entry.name, path: rel, is_dir: false })
    }
  }
  return nodes
}
