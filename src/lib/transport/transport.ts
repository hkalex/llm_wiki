import type { FileNode, WikiProject } from "@/types/wiki"

export interface FileBase64 {
  base64: string
  mimeType: string
}

/**
 * All file-system and project operations the app performs.
 *
 * TauriTransport delegates to Rust via invoke().
 * ServerTransport delegates to the LLM Wiki server HTTP API.
 *
 * The interface covers the same surface as src/commands/fs.ts so that
 * file is the only place call-sites need to change. Higher-level
 * operations (ingest, chat, search) will be added to this interface
 * in Phase 3/4 of the server-mode implementation.
 */
export interface ITransport {
  // ── File I/O ──────────────────────────────────────────────────────────
  readFile(path: string): Promise<string>
  writeFile(path: string, contents: string): Promise<void>
  writeFileAtomic(path: string, contents: string): Promise<void>
  deleteFile(path: string): Promise<void>
  fileExists(path: string): Promise<boolean>
  listDirectory(path: string): Promise<FileNode[]>
  createDirectory(path: string): Promise<void>
  getFileMd5(path: string): Promise<string>
  getFileModifiedTime(path: string): Promise<number>
  getFileSize(path: string): Promise<number>
  copyFile(source: string, destination: string): Promise<void>
  copyDirectory(source: string, destination: string): Promise<string[]>
  readFileAsBase64(path: string): Promise<FileBase64>
  preprocessFile(path: string): Promise<string>
  findRelatedWikiPages(projectPath: string, sourceName: string): Promise<string[]>

  // ── Project management ────────────────────────────────────────────────
  createProject(name: string, path: string): Promise<WikiProject>
  openProject(path: string): Promise<WikiProject>
  openProjectFolder(path: string): Promise<void>
}
