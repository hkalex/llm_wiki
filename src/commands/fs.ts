import { invoke } from "@tauri-apps/api/core"
import type { FileNode, WikiProject } from "@/types/wiki"
import { getTransport } from "@/lib/transport"
import type { FileBase64 } from "@/lib/transport"

export type { FileBase64 } from "@/lib/transport"

export async function readFile(path: string): Promise<string> {
  return getTransport().readFile(path)
}

export async function writeFile(path: string, contents: string): Promise<void> {
  return getTransport().writeFile(path, contents)
}

export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  return getTransport().writeFileAtomic(path, contents)
}

export async function listDirectory(path: string): Promise<FileNode[]> {
  return getTransport().listDirectory(path)
}

export async function copyFile(
  source: string,
  destination: string
): Promise<void> {
  return getTransport().copyFile(source, destination)
}

export async function copyDirectory(
  source: string,
  destination: string
): Promise<string[]> {
  return getTransport().copyDirectory(source, destination)
}

export async function preprocessFile(path: string): Promise<string> {
  return getTransport().preprocessFile(path)
}

export async function deleteFile(path: string): Promise<void> {
  return getTransport().deleteFile(path)
}

export async function findRelatedWikiPages(
  projectPath: string,
  sourceName: string
): Promise<string[]> {
  return getTransport().findRelatedWikiPages(projectPath, sourceName)
}

export async function createDirectory(path: string): Promise<void> {
  return getTransport().createDirectory(path)
}

export async function fileExists(path: string): Promise<boolean> {
  return getTransport().fileExists(path)
}

export async function getFileModifiedTime(path: string): Promise<number> {
  return getTransport().getFileModifiedTime(path)
}

export async function getFileSize(path: string): Promise<number> {
  return getTransport().getFileSize(path)
}

export async function getFileMd5(path: string): Promise<string> {
  return getTransport().getFileMd5(path)
}

export async function readFileAsBase64(path: string): Promise<FileBase64> {
  return getTransport().readFileAsBase64(path)
}

export async function createProject(
  name: string,
  path: string,
): Promise<WikiProject> {
  return getTransport().createProject(name, path)
}

export async function openProject(path: string): Promise<WikiProject> {
  return getTransport().openProject(path)
}

export async function openProjectFolder(path: string): Promise<void> {
  return getTransport().openProjectFolder(path)
}

// clip_server_status is Tauri-only and has no server-mode equivalent in Phase 1.
export async function clipServerStatus(): Promise<string> {
  return invoke<string>("clip_server_status")
}
