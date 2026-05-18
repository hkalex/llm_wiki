import type { FileNode, WikiProject } from "@/types/wiki"
import type { FileBase64, ITransport } from "./transport"
import { getServerToken } from "@/lib/server-auth"

/**
 * Paths in server mode use the virtual scheme `server://{projectId}/...`
 * so the transport can derive the project ID and sub-path from any path
 * the app passes — without requiring components to know they are talking
 * to a server.
 *
 * Examples:
 *   server://uuid/wiki/entities/foo.md  → GET /projects/uuid/wiki/entities/foo.md
 *   server://uuid/raw/sources/doc.pdf   → GET /projects/uuid/sources/doc.pdf
 */
const SERVER_SCHEME = "server://"

interface ParsedPath {
  projectId: string
  relative: string  // everything after "server://{id}/"
}

function parsePath(virtualPath: string): ParsedPath {
  if (!virtualPath.startsWith(SERVER_SCHEME)) {
    throw new Error(`ServerTransport: not a server:// path: ${virtualPath}`)
  }
  const rest = virtualPath.slice(SERVER_SCHEME.length)
  const slash = rest.indexOf("/")
  if (slash === -1) return { projectId: rest, relative: "" }
  return { projectId: rest.slice(0, slash), relative: rest.slice(slash + 1) }
}

/** Recursively remap FileNode paths from relative to server:// virtual paths. */
function remapTree(nodes: FileNode[], projectId: string, prefix: string): FileNode[] {
  return nodes.map((n) => {
    // Normalize only the path segment — never apply slash dedup across the scheme ("server://")
    const segment = `${prefix}/${n.path}`.replace(/\/+/g, "/").replace(/^\//, "")
    return {
      ...n,
      path: `${SERVER_SCHEME}${projectId}/${segment}`,
      children: n.children ? remapTree(n.children, projectId, prefix) : undefined,
    }
  })
}

export class ServerTransport implements ITransport {
  private readonly baseUrl: string

  constructor(serverUrl: string) {
    this.baseUrl = serverUrl.replace(/\/$/, "")
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────

  private headers(extra?: Record<string, string>): Record<string, string> {
    const token = getServerToken()
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    }
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers as Record<string, string> ?? {}) },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string }
      throw new Error(body.message ?? `HTTP ${res.status}`)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  // ── File I/O ─────────────────────────────────────────────────────────

  async readFile(path: string): Promise<string> {
    const { projectId, relative } = parsePath(path)
    if (relative.startsWith("wiki/")) {
      const page = await this.req<{ content: string }>(`/projects/${projectId}/wiki/${relative.slice(5)}`)
      return page.content
    }
    if (relative.startsWith("raw/sources/")) {
      const sourcePath = relative.slice("raw/sources/".length)
      const result = await this.req<{ text: string }>(`/projects/${projectId}/sources/~text/${sourcePath}`)
      return result.text
    }
    throw new Error(`ServerTransport.readFile: unsupported path segment: ${relative}`)
  }

  async writeFile(path: string, contents: string): Promise<void> {
    return this.writeFileAtomic(path, contents)
  }

  async writeFileAtomic(path: string, contents: string): Promise<void> {
    const { projectId, relative } = parsePath(path)
    if (relative.startsWith("wiki/")) {
      await this.req(`/projects/${projectId}/wiki/${relative.slice(5)}`, {
        method: "PUT",
        body: JSON.stringify({ content: contents }),
      })
      return
    }
    throw new Error(`ServerTransport.writeFileAtomic: unsupported path: ${relative}`)
  }

  async deleteFile(path: string): Promise<void> {
    const { projectId, relative } = parsePath(path)
    if (relative.startsWith("wiki/")) {
      await this.req(`/projects/${projectId}/wiki/${relative.slice(5)}`, { method: "DELETE" })
      return
    }
    if (relative.startsWith("raw/sources/")) {
      await this.req(`/projects/${projectId}/sources/${relative.slice(12)}`, { method: "DELETE" })
      return
    }
    throw new Error(`ServerTransport.deleteFile: unsupported path: ${relative}`)
  }

  async fileExists(path: string): Promise<boolean> {
    const { projectId, relative } = parsePath(path)
    if (relative.startsWith("wiki/")) {
      const res = await fetch(
        `${this.baseUrl}/api/v1/projects/${projectId}/wiki/${relative.slice(5)}`,
        { method: "HEAD", headers: this.headers() },
      )
      return res.ok
    }
    return false
  }

  async listDirectory(path: string): Promise<FileNode[]> {
    const { projectId, relative } = parsePath(path)

    // Top-level project path — mirrors the desktop directory structure
    if (!relative) {
      const wikiTree = await this.req<FileNode[]>(`/projects/${projectId}/wiki`)
      return [
        {
          name: "wiki",
          path: `${SERVER_SCHEME}${projectId}/wiki`,
          is_dir: true,
          children: remapTree(wikiTree, projectId, "wiki"),
        },
        {
          name: "raw",
          path: `${SERVER_SCHEME}${projectId}/raw`,
          is_dir: true,
          children: [
            {
              name: "sources",
              path: `${SERVER_SCHEME}${projectId}/raw/sources`,
              is_dir: true,
            },
          ],
        },
      ]
    }
    if (relative === "wiki" || relative.startsWith("wiki/")) {
      const tree = await this.req<FileNode[]>(`/projects/${projectId}/wiki`)
      return remapTree(tree, projectId, "wiki")
    }
    if (relative === "raw/sources" || relative.startsWith("raw/sources/")) {
      const tree = await this.req<FileNode[]>(`/projects/${projectId}/sources`)
      return remapTree(tree, projectId, "raw/sources")
    }
    return []
  }

  async createDirectory(_path: string): Promise<void> {
    // Directories are created implicitly on write in server mode.
  }

  async getFileMd5(_path: string): Promise<string> {
    // Not exposed via the REST API in Phase 2. Return empty to avoid breakage.
    return ""
  }

  async getFileModifiedTime(_path: string): Promise<number> {
    return 0
  }

  async getFileSize(_path: string): Promise<number> {
    return 0
  }

  async copyFile(source: string, destination: string): Promise<void> {
    // local file → server: upload via multipart (used by importSourceFiles)
    if (!destination.startsWith(SERVER_SCHEME)) {
      throw new Error("ServerTransport.copyFile: destination must be a server:// path")
    }
    const { projectId, relative } = parsePath(destination)
    if (!relative.startsWith("raw/sources/")) {
      throw new Error("ServerTransport.copyFile: destination must be under raw/sources/")
    }

    const filename = relative.slice("raw/sources/".length)

    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      throw new Error("ServerTransport.copyFile: uploading local files requires the desktop app")
    }

    // Read local file via Tauri (only available in the desktop app), then upload.
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const { base64 } = await invoke<{ base64: string; mimeType: string }>(
        "read_file_as_base64",
        { path: source },
      )
      const binary = atob(base64)
      const buf = new ArrayBuffer(binary.length)
      const view = new Uint8Array(buf)
      for (let i = 0; i < binary.length; i++) {
        view[i] = binary.charCodeAt(i)
      }

      const token = getServerToken()
      const form = new FormData()
      form.append("file", new Blob([buf]), filename)

      const res = await fetch(`${this.baseUrl}/api/v1/projects/${projectId}/sources`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
    } catch (err) {
      throw new Error(`ServerTransport.copyFile: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async copyDirectory(_source: string, _destination: string): Promise<string[]> {
    throw new Error("ServerTransport.copyDirectory: folder import not supported in server mode")
  }

  async readFileAsBase64(_path: string): Promise<FileBase64> {
    throw new Error("ServerTransport.readFileAsBase64: not supported in server mode")
  }

  async preprocessFile(path: string): Promise<string> {
    // Best-effort: return extracted text via the server text endpoint.
    // Image extraction (the other job of preprocess_file) is skipped in server mode.
    try {
      return await this.readFile(path)
    } catch {
      return ""
    }
  }

  async findRelatedWikiPages(_projectPath: string, _sourceName: string): Promise<string[]> {
    return []
  }

  // ── Project management ─────────────────────────────────────────────

  async createProject(name: string, _path: string): Promise<WikiProject> {
    const project = await this.req<{ id: string; name: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    })
    return {
      id: project.id,
      name: project.name,
      path: `${SERVER_SCHEME}${project.id}`,
    }
  }

  async openProject(path: string): Promise<WikiProject> {
    // In server mode, path is already "server://uuid" — just validate and return.
    if (path.startsWith(SERVER_SCHEME)) {
      const { projectId } = parsePath(path)
      const project = await this.req<{ id: string; name: string }>(`/projects/${projectId}`)
      return { id: project.id, name: project.name, path }
    }
    throw new Error("ServerTransport.openProject: expected a server:// path")
  }

  async openProjectFolder(_path: string): Promise<void> {
    // No-op: server projects have no local folder to open.
  }

  // ── Health check (not on ITransport, used by settings UI) ─────────

  async checkHealth(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/health`)
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
      const data = await res.json() as { status?: string; version?: string }
      return { ok: data.status === "ok", version: data.version }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** List all server projects for the current user (not on ITransport). */
  async listServerProjects(): Promise<Array<{ id: string; name: string; slug: string }>> {
    return this.req("/projects")
  }
}

/** Ping a server URL without constructing a full transport instance. */
export async function pingServer(
  serverUrl: string,
): Promise<{ ok: boolean; version?: string; error?: string }> {
  return new ServerTransport(serverUrl).checkHealth()
}
