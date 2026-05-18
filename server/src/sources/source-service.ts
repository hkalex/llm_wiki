import fs from "fs"
import path from "path"
import { ForbiddenError, NotFoundError } from "../shared/errors"

export interface SourceFile {
  name: string
  path: string
  size: number
  modifiedAt: number
  is_dir: boolean
  children?: SourceFile[]
}

function sourcesDir(storagePath: string): string {
  return path.join(storagePath, "raw", "sources")
}

function safeResolveSource(storagePath: string, sourcePath: string): string {
  const base = sourcesDir(storagePath)
  const resolved = path.resolve(base, sourcePath)
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new ForbiddenError("Path traversal detected")
  }
  return resolved
}

export function listSources(storagePath: string): SourceFile[] {
  const base = sourcesDir(storagePath)
  fs.mkdirSync(base, { recursive: true })
  return buildSourceTree(base, base)
}

function buildSourceTree(dir: string, base: string): SourceFile[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .map((entry) => {
      const fullPath = path.join(dir, entry.name)
      const relPath = path.relative(base, fullPath).replace(/\\/g, "/")
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: relPath,
          size: 0,
          modifiedAt: 0,
          is_dir: true,
          children: buildSourceTree(fullPath, base),
        }
      }
      const stat = fs.statSync(fullPath)
      return {
        name: entry.name,
        path: relPath,
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        is_dir: false,
      }
    })
}

export function deleteSource(storagePath: string, sourcePath: string): void {
  const fullPath = safeResolveSource(storagePath, sourcePath)
  if (!fs.existsSync(fullPath)) throw new NotFoundError(`Source not found: ${sourcePath}`)
  const stat = fs.statSync(fullPath)
  if (stat.isDirectory()) {
    fs.rmSync(fullPath, { recursive: true, force: true })
  } else {
    fs.unlinkSync(fullPath)
  }
}

export function saveUploadedSource(
  storagePath: string,
  filename: string,
  buffer: Buffer,
): SourceFile {
  const base = sourcesDir(storagePath)
  fs.mkdirSync(base, { recursive: true })

  // Sanitize filename
  const safeName = path.basename(filename).replace(/[^\w\s.-]/g, "_")
  const destPath = path.join(base, safeName)

  fs.writeFileSync(destPath, buffer)
  const stat = fs.statSync(destPath)

  return {
    name: safeName,
    path: safeName,
    size: stat.size,
    modifiedAt: stat.mtimeMs,
    is_dir: false,
  }
}
