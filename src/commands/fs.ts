/**
 * Filesystem + project commands.
 *
 * The plain file operations are now a thin shim over the platform registry
 * (`src/platform`), so the same call sites work on the Tauri desktop app
 * (LanceDB/Rust-backed) and on the Node server. The project-management and
 * app-control commands below remain Tauri-only desktop-shell concerns and
 * still call `invoke()` directly.
 */
import { invoke } from "@tauri-apps/api/core"
import type { FileNode, WikiProject } from "@/types/wiki"
import { ensureProjectId, upsertProjectInfo } from "@/lib/project-identity"
import { getFilesystem } from "@/platform"
import type { FileBase64, ReadFileOptions } from "@/platform"

export type { FileBase64 } from "@/platform"

/** Raw shape returned by the Rust commands — id is attached client-side. */
interface RawProject {
  name: string
  path: string
}

// ── Filesystem ops (delegated to the platform Filesystem capability) ──────

export function readFile(path: string, options?: ReadFileOptions): Promise<string> {
  return getFilesystem().readFile(path, options)
}

export function writeFile(path: string, contents: string): Promise<void> {
  return getFilesystem().writeFile(path, contents)
}

export function writeFileBase64(path: string, base64: string): Promise<void> {
  return getFilesystem().writeFileBase64(path, base64)
}

export function writeFileAtomic(path: string, contents: string): Promise<void> {
  return getFilesystem().writeFileAtomic(path, contents)
}

export function listDirectory(path: string): Promise<FileNode[]> {
  return getFilesystem().listDirectory(path)
}

export function copyFile(source: string, destination: string): Promise<void> {
  return getFilesystem().copyFile(source, destination)
}

export function copyDirectory(source: string, destination: string): Promise<string[]> {
  return getFilesystem().copyDirectory(source, destination)
}

export function preprocessFile(path: string): Promise<string> {
  return getFilesystem().preprocessFile(path)
}

export function deleteFile(path: string): Promise<void> {
  return getFilesystem().deleteFile(path)
}

export function createDirectory(path: string): Promise<void> {
  return getFilesystem().createDirectory(path)
}

export function fileExists(path: string): Promise<boolean> {
  return getFilesystem().fileExists(path)
}

export function getFileModifiedTime(path: string): Promise<number> {
  return getFilesystem().getFileModifiedTime(path)
}

export function getFileSize(path: string): Promise<number> {
  return getFilesystem().getFileSize(path)
}

export function getFileMd5(path: string): Promise<string> {
  return getFilesystem().getFileMd5(path)
}

/**
 * Read any file off disk as base64 + a guessed mime type. The
 * vision-caption pipeline uses this to pick up extracted images
 * without having to read them as UTF-8 strings (PNG bytes aren't
 * valid UTF-8 — `readFile` would corrupt them).
 */
export function readFileAsBase64(path: string): Promise<FileBase64> {
  return getFilesystem().readFileAsBase64(path)
}

// ── Project management + app-control (Tauri desktop-shell only) ───────────

export async function findRelatedWikiPages(
  projectPath: string,
  sourceName: string
): Promise<string[]> {
  return invoke<string[]>("find_related_wiki_pages", { projectPath, sourceName })
}

export async function createProject(
  name: string,
  path: string,
): Promise<WikiProject> {
  const raw = await invoke<RawProject>("create_project", { name, path })
  const id = await ensureProjectId(raw.path)
  await upsertProjectInfo(id, raw.path, raw.name)
  return { id, name: raw.name, path: raw.path }
}

export async function openProject(path: string): Promise<WikiProject> {
  const raw = await invoke<RawProject>("open_project", { path })
  const id = await ensureProjectId(raw.path)
  await upsertProjectInfo(id, raw.path, raw.name)
  return { id, name: raw.name, path: raw.path }
}

export async function openProjectFolder(path: string): Promise<void> {
  return invoke<void>("open_project_folder", { path })
}

export async function clipServerStatus(): Promise<string> {
  return invoke<string>("clip_server_status")
}

export async function apiServerStatus(): Promise<string> {
  return invoke<string>("api_server_status")
}

export async function apiServerReloadConfig(): Promise<string> {
  return invoke<string>("api_server_reload_config")
}

export async function mcpServerEntryPath(): Promise<string> {
  return invoke<string>("mcp_server_entry_path")
}
