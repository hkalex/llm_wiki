import fs from "fs"
import path from "path"
import { ForbiddenError, NotFoundError } from "../shared/errors"

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "mdx", "csv", "json", "xml", "html", "htm",
  "yaml", "yml", "rtf", "js", "ts", "py", "go", "rs", "sh",
  "toml", "ini", "cfg", "conf", "sql", "graphql", "jsx", "tsx",
])

function sourcesDir(storagePath: string): string {
  return path.join(storagePath, "raw", "sources")
}

function safeResolvePath(storagePath: string, sourcePath: string): string {
  const base = sourcesDir(storagePath)
  const resolved = path.resolve(base, sourcePath)
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new ForbiddenError("Path traversal detected")
  }
  return resolved
}

function ext(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase()
}

async function extractPdf(fullPath: string): Promise<string> {
  const mod = await import("pdf-parse")
  // pdf-parse uses module.exports = fn; CJS interop may place it on .default
  const pdfParse = (mod.default ?? mod) as unknown as (buf: Buffer) => Promise<{ text: string }>
  const buffer = await fs.promises.readFile(fullPath)
  const result = await pdfParse(buffer)
  return result.text
}

async function extractDocx(fullPath: string): Promise<string> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ path: fullPath })
  return result.value
}

/**
 * Return the text content of a source file, applying format-aware
 * extraction for PDFs and DOCX. Other binary formats return "".
 */
export async function getSourceText(storagePath: string, sourcePath: string): Promise<string> {
  const fullPath = safeResolvePath(storagePath, sourcePath)
  if (!fs.existsSync(fullPath)) throw new NotFoundError(`Source not found: ${sourcePath}`)

  const extension = ext(fullPath)

  if (TEXT_EXTENSIONS.has(extension)) {
    return fs.promises.readFile(fullPath, "utf-8")
  }

  if (extension === "pdf") {
    try {
      return await extractPdf(fullPath)
    } catch {
      return ""
    }
  }

  if (extension === "docx") {
    try {
      return await extractDocx(fullPath)
    } catch {
      return ""
    }
  }

  // Unsupported binary format — return empty so ingest degrades gracefully
  return ""
}
