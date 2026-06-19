/**
 * Tauri implementation of the `Filesystem` capability. These are the
 * `invoke()` calls that previously lived inline in `src/commands/fs.ts`;
 * that module is now a thin shim delegating here via the platform registry.
 */

import { invoke } from "@tauri-apps/api/core"
import { isAbsolutePath } from "@/lib/path-utils"
import type { FileBase64, FileNode, Filesystem, ReadFileOptions } from "../types"

function assertAbsoluteFsPath(operation: string, path: string): void {
  if (!isAbsolutePath(path)) {
    throw new Error(`${operation} requires an absolute path: ${path}`)
  }
}

export function createTauriFilesystem(): Filesystem {
  return {
    readFile(path: string, options?: ReadFileOptions): Promise<string> {
      return invoke<string>("read_file", {
        path,
        extractImages: options?.extractImages,
      })
    },

    writeFile(path: string, contents: string): Promise<void> {
      assertAbsoluteFsPath("writeFile", path)
      return invoke<void>("write_file", { path, contents })
    },

    writeFileBase64(path: string, base64: string): Promise<void> {
      assertAbsoluteFsPath("writeFileBase64", path)
      return invoke<void>("write_file_base64", { path, base64 })
    },

    writeFileAtomic(path: string, contents: string): Promise<void> {
      assertAbsoluteFsPath("writeFileAtomic", path)
      return invoke<void>("write_file_atomic", { path, contents })
    },

    listDirectory(path: string): Promise<FileNode[]> {
      return invoke<FileNode[]>("list_directory", { path })
    },

    copyFile(source: string, destination: string): Promise<void> {
      return invoke("copy_file", { source, destination })
    },

    copyDirectory(source: string, destination: string): Promise<string[]> {
      return invoke<string[]>("copy_directory", { source, destination })
    },

    preprocessFile(path: string): Promise<string> {
      return invoke<string>("preprocess_file", { path })
    },

    deleteFile(path: string): Promise<void> {
      return invoke("delete_file", { path })
    },

    createDirectory(path: string): Promise<void> {
      assertAbsoluteFsPath("createDirectory", path)
      return invoke<void>("create_directory", { path })
    },

    fileExists(path: string): Promise<boolean> {
      return invoke<boolean>("file_exists", { path })
    },

    getFileModifiedTime(path: string): Promise<number> {
      return invoke<number>("get_file_modified_time", { path })
    },

    getFileSize(path: string): Promise<number> {
      return invoke<number>("get_file_size", { path })
    },

    getFileMd5(path: string): Promise<string> {
      return invoke<string>("get_file_md5", { path })
    },

    readFileAsBase64(path: string): Promise<FileBase64> {
      return invoke<FileBase64>("read_file_as_base64", { path })
    },
  }
}
