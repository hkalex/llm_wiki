import { invoke } from "@tauri-apps/api/core"
import type { FileNode, WikiProject } from "@/types/wiki"
import { ensureProjectId, upsertProjectInfo } from "@/lib/project-identity"
import type { FileBase64, ITransport } from "./transport"

interface RawProject {
  name: string
  path: string
}

export class TauriTransport implements ITransport {
  readFile(path: string): Promise<string> {
    return invoke<string>("read_file", { path })
  }

  writeFile(path: string, contents: string): Promise<void> {
    return invoke<void>("write_file", { path, contents })
  }

  writeFileAtomic(path: string, contents: string): Promise<void> {
    return invoke<void>("write_file_atomic", { path, contents })
  }

  deleteFile(path: string): Promise<void> {
    return invoke<void>("delete_file", { path })
  }

  fileExists(path: string): Promise<boolean> {
    return invoke<boolean>("file_exists", { path })
  }

  listDirectory(path: string): Promise<FileNode[]> {
    return invoke<FileNode[]>("list_directory", { path })
  }

  createDirectory(path: string): Promise<void> {
    return invoke<void>("create_directory", { path })
  }

  getFileMd5(path: string): Promise<string> {
    return invoke<string>("get_file_md5", { path })
  }

  getFileModifiedTime(path: string): Promise<number> {
    return invoke<number>("get_file_modified_time", { path })
  }

  getFileSize(path: string): Promise<number> {
    return invoke<number>("get_file_size", { path })
  }

  copyFile(source: string, destination: string): Promise<void> {
    return invoke<void>("copy_file", { source, destination })
  }

  copyDirectory(source: string, destination: string): Promise<string[]> {
    return invoke<string[]>("copy_directory", { source, destination })
  }

  readFileAsBase64(path: string): Promise<FileBase64> {
    return invoke<FileBase64>("read_file_as_base64", { path })
  }

  preprocessFile(path: string): Promise<string> {
    return invoke<string>("preprocess_file", { path })
  }

  findRelatedWikiPages(projectPath: string, sourceName: string): Promise<string[]> {
    return invoke<string[]>("find_related_wiki_pages", { projectPath, sourceName })
  }

  async createProject(name: string, path: string): Promise<WikiProject> {
    const raw = await invoke<RawProject>("create_project", { name, path })
    const id = await ensureProjectId(raw.path)
    await upsertProjectInfo(id, raw.path, raw.name)
    return { id, name: raw.name, path: raw.path }
  }

  async openProject(path: string): Promise<WikiProject> {
    const raw = await invoke<RawProject>("open_project", { path })
    const id = await ensureProjectId(raw.path)
    await upsertProjectInfo(id, raw.path, raw.name)
    return { id, name: raw.name, path: raw.path }
  }

  openProjectFolder(path: string): Promise<void> {
    return invoke<void>("open_project_folder", { path })
  }
}
