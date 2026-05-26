/**
 * Transport layer — routes Tauri IPC commands to either the native Tauri
 * invoke() or an HTTP call against the standalone server, depending on
 * the runtime environment.
 *
 * Desktop (Tauri present):  calls go through invoke() as before.
 * Web / mobile (no Tauri):  calls go to the REST server at VITE_SERVER_URL.
 *
 * The exported `invoke()` has the same signature as @tauri-apps/api/core's
 * invoke(), so src/commands/ files only need to change their import path.
 *
 * The exported `listen()` mirrors @tauri-apps/api/event's listen() but
 * falls back to EventSource SSE in web environments.
 */

const SERVER_URL =
  (import.meta.env?.VITE_SERVER_URL as string | undefined) ||
  "http://localhost:19828"

// ── Environment detection ─────────────────────────────────────────────────

/**
 * True when running inside a Tauri webview.
 * `window.__TAURI_INTERNALS__` is injected by the Tauri runtime at startup.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

// ── HTTP helpers ──────────────────────────────────────────────────────────

interface ServerResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

async function httpPost<T>(path: string, body?: unknown): Promise<T> {
  const resp = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => "")
    throw new Error(text || `HTTP ${resp.status}`)
  }
  const json: ServerResponse<T> = await resp.json()
  if (!json.ok) throw new Error(json.error || `Server error ${resp.status}`)
  return json.data as T
}

async function httpGet<T>(path: string): Promise<T> {
  const resp = await fetch(`${SERVER_URL}${path}`)
  if (!resp.ok) {
    const text = await resp.text().catch(() => "")
    throw new Error(text || `HTTP ${resp.status}`)
  }
  const json: ServerResponse<T> = await resp.json()
  if (!json.ok) throw new Error(json.error || `Server error ${resp.status}`)
  return json.data as T
}

// ── Command → HTTP mapping ────────────────────────────────────────────────

type CommandArgs = Record<string, unknown> | undefined

/**
 * Maps each Tauri command name to its HTTP equivalent on the server.
 * Unknown commands throw — add mappings here as new server routes are built.
 */
async function httpInvoke<T>(command: string, args?: CommandArgs): Promise<T> {
  const a = args || {}
  switch (command) {
    // ── File system ──────────────────────────────────────────────────────
    case "read_file":
      return httpPost<T>("/api/v1/fs/read", { path: a.path })
    case "write_file":
      return httpPost<T>("/api/v1/fs/write", { path: a.path, contents: a.contents })
    case "write_file_atomic":
      return httpPost<T>("/api/v1/fs/write", {
        path: a.path,
        contents: a.contents,
        atomic: true,
      })
    case "list_directory":
      return httpPost<T>("/api/v1/fs/list", { path: a.path })
    case "copy_file":
      return httpPost<T>("/api/v1/fs/copy", {
        source: a.source,
        destination: a.destination,
      })
    case "copy_directory":
      return httpPost<T>("/api/v1/fs/copy-dir", {
        source: a.source,
        destination: a.destination,
      })
    case "preprocess_file":
      return httpPost<T>("/api/v1/fs/preprocess", { path: a.path })
    case "delete_file":
      return httpPost<T>("/api/v1/fs/delete", { path: a.path })
    case "find_related_wiki_pages":
      return httpPost<T>("/api/v1/fs/related-pages", {
        projectPath: a.projectPath,
        sourceName: a.sourceName,
      })
    case "create_directory":
      return httpPost<T>("/api/v1/fs/mkdir", { path: a.path })
    case "file_exists":
      return httpPost<T>("/api/v1/fs/exists", { path: a.path })
    case "get_file_modified_time":
      return httpPost<T>("/api/v1/fs/mtime", { path: a.path })
    case "get_file_size":
      return httpPost<T>("/api/v1/fs/size", { path: a.path })
    case "get_file_md5":
      return httpPost<T>("/api/v1/fs/md5", { path: a.path })
    case "read_file_as_base64":
      return httpPost<T>("/api/v1/fs/read-base64", { path: a.path })

    // ── Project management ───────────────────────────────────────────────
    case "create_project":
      return httpPost<T>("/api/v1/projects", { name: a.name, path: a.path })
    case "open_project":
      return httpPost<T>("/api/v1/projects/open", { path: a.path })
    case "open_project_folder":
      // No-op in web — cannot open Finder/Explorer from a browser
      return undefined as T

    // ── Vector store ─────────────────────────────────────────────────────
    case "vector_upsert_chunks":
      return httpPost<T>("/api/v1/vectors/upsert-chunks", {
        projectPath: a.projectPath,
        pageId: a.pageId,
        chunks: a.chunks,
      })
    case "vector_search_chunks":
      return httpPost<T>("/api/v1/vectors/search-chunks", {
        projectPath: a.projectPath,
        queryEmbedding: a.queryEmbedding,
        topK: a.topK,
      })
    case "vector_delete_page":
      return httpPost<T>("/api/v1/vectors/delete-page", {
        projectPath: a.projectPath,
        pageId: a.pageId,
      })
    case "vector_count_chunks":
      return httpPost<T>("/api/v1/vectors/count-chunks", {
        projectPath: a.projectPath,
      })
    case "vector_legacy_row_count":
      return httpPost<T>("/api/v1/vectors/legacy-count", {
        projectPath: a.projectPath,
      })
    case "vector_drop_legacy":
      return httpPost<T>("/api/v1/vectors/drop-legacy", {
        projectPath: a.projectPath,
      })

    // ── File sync ────────────────────────────────────────────────────────
    case "start_project_file_watcher":
      return httpPost<T>("/api/v1/file-sync/start", {
        projectId: a.projectId,
        projectPath: a.projectPath,
        sourceWatchConfig: a.sourceWatchConfig,
      })
    case "stop_project_file_watcher":
      return httpPost<T>("/api/v1/file-sync/stop", {})
    case "rescan_project_files":
      return httpPost<T>("/api/v1/file-sync/rescan", {
        projectId: a.projectId,
        projectPath: a.projectPath,
        sourceWatchConfig: a.sourceWatchConfig,
      })
    case "get_file_change_queue":
      return httpPost<T>("/api/v1/file-sync/queue", { projectPath: a.projectPath })
    case "retry_file_change_task":
      return httpPost<T>("/api/v1/file-sync/retry", {
        projectId: a.projectId,
        projectPath: a.projectPath,
        taskId: a.taskId,
      })
    case "ignore_file_change_task":
      return httpPost<T>("/api/v1/file-sync/ignore", {
        projectId: a.projectId,
        projectPath: a.projectPath,
        taskId: a.taskId,
      })

    // ── Search ───────────────────────────────────────────────────────────
    case "search_project":
      return httpPost<T>("/api/v1/search", {
        projectPath: a.projectPath,
        query: a.query,
        limit: a.limit,
      })

    // ── Image extraction ──────────────────────────────────────────────────
    case "extract_and_save_pdf_images_cmd":
      return httpPost<T>("/api/v1/fs/extract-pdf-images", {
        sourcePath: a.sourcePath,
        destDir: a.destDir,
        relTo: a.relTo,
      })
    case "extract_and_save_office_images_cmd":
      return httpPost<T>("/api/v1/fs/extract-office-images", {
        sourcePath: a.sourcePath,
        destDir: a.destDir,
        relTo: a.relTo,
      })

    // ── CLI detection ─────────────────────────────────────────────────────
    case "claude_cli_detect":
      return httpGet<T>("/api/v1/cli/claude/detect")
    case "codex_cli_detect":
      return httpGet<T>("/api/v1/cli/codex/detect")

    // ── CLI kill ──────────────────────────────────────────────────────────
    case "claude_cli_kill":
      return httpPost<T>(`/api/v1/cli/claude/${a.streamId}/kill`, {})
    case "codex_cli_kill":
      return httpPost<T>(`/api/v1/cli/codex/${a.streamId}/kill`, {})

    // ── CLI spawn (HTTP path — SSE provides the streaming response) ───────
    case "claude_cli_spawn":
      return httpPost<T>("/api/v1/cli/claude/spawn", {
        streamId: a.streamId,
        model: a.model,
        messages: a.messages,
      })
    case "codex_cli_spawn":
      return httpPost<T>("/api/v1/cli/codex/spawn", {
        streamId: a.streamId,
        model: a.model,
        prompt: a.prompt,
      })

    // ── Server status ─────────────────────────────────────────────────────
    case "clip_server_status":
      return "unknown" as T
    case "api_server_status":
      return httpGet<T>("/health")
        .then(() => "running" as T)
        .catch(() => "stopped" as T)
    case "api_server_reload_config":
      return "ok" as T

    // ── Desktop-only commands (no-op in web) ──────────────────────────────
    case "set_proxy_env":
      // Proxy is configured on the server side via environment variables.
      return "ok" as T

    default:
      throw new Error(`Command "${command}" is not supported in web/server mode`)
  }
}

// ── Public invoke() shim ──────────────────────────────────────────────────

let _tauriInvoke: (<T>(cmd: string, args?: Record<string, unknown>) => Promise<T>) | null = null

/**
 * Drop-in replacement for `invoke` from `@tauri-apps/api/core`.
 * Routes to Tauri IPC in desktop builds, HTTP in web/mobile builds.
 *
 * Usage (replaces the existing import in src/commands/):
 *   import { invoke } from "@/lib/transport"
 */
export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isTauri()) {
    if (!_tauriInvoke) {
      const mod = await import("@tauri-apps/api/core")
      _tauriInvoke = mod.invoke
    }
    return _tauriInvoke<T>(command, args)
  }
  return httpInvoke<T>(command, args)
}

// ── SSE connection pool ───────────────────────────────────────────────────

/**
 * Shared EventSource instances keyed by full URL.
 * Multiple listen() calls for the same stream (e.g. data + done) share one
 * connection; the pool entry is closed when the last listener unsubscribes.
 */
interface SseEntry {
  es: EventSource
  refs: number
}
const _ssePool = new Map<string, SseEntry>()

function _acquireSse(fullUrl: string): EventSource {
  let entry = _ssePool.get(fullUrl)
  if (!entry) {
    entry = { es: new EventSource(fullUrl), refs: 0 }
    _ssePool.set(fullUrl, entry)
  }
  entry.refs++
  return entry.es
}

function _releaseSse(fullUrl: string) {
  const entry = _ssePool.get(fullUrl)
  if (!entry) return
  entry.refs--
  if (entry.refs <= 0) {
    entry.es.close()
    _ssePool.delete(fullUrl)
  }
}

// ── Public listen() shim ──────────────────────────────────────────────────

interface SseTarget {
  /** Path relative to SERVER_URL */
  sseUrl: string
  /**
   * SSE event type to subscribe to.
   * "message" → the default unnamed `data:` events.
   * Anything else → a named event sent as `event: <name>\ndata: ...\n\n`.
   */
  eventType: string
}

/**
 * Subscribe to a Tauri event (desktop) or an SSE stream (web/mobile).
 * Returns an unsubscribe/close function following Tauri's unlisten pattern.
 *
 * Key difference from @tauri-apps/api/event listen():
 *   The handler receives the payload directly (not wrapped in an Event object).
 *   i.e. handler(payload) not handler(event) — no event.payload access needed.
 *
 * In Tauri: delegates to @tauri-apps/api/event listen() and unwraps .payload.
 * In web:   opens an EventSource to the matching server SSE endpoint.
 *           Streams that share a URL (data + :done) reuse one connection.
 */
export async function listen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (isTauri()) {
    const { listen: tauriListen } = await import("@tauri-apps/api/event")
    return tauriListen<T>(event, (e) => handler(e.payload))
  }

  const target = tauriEventToSse(event)
  if (!target) {
    console.warn(`[transport] No SSE mapping for Tauri event "${event}" — skipping`)
    return () => {}
  }

  const fullUrl = `${SERVER_URL}${target.sseUrl}`
  const es = _acquireSse(fullUrl)

  const msgHandler = (e: MessageEvent) => {
    try {
      handler(JSON.parse(e.data) as T)
    } catch {
      // ignore parse errors
    }
  }

  if (target.eventType === "message") {
    es.addEventListener("message", msgHandler)
  } else {
    es.addEventListener(target.eventType, msgHandler)
  }

  es.onerror = () => {
    console.warn(`[transport] SSE connection error for "${event}"`)
  }

  return () => {
    if (target.eventType === "message") {
      es.removeEventListener("message", msgHandler)
    } else {
      es.removeEventListener(target.eventType, msgHandler)
    }
    _releaseSse(fullUrl)
  }
}

/**
 * Maps Tauri event names to server SSE endpoint paths + event types.
 *
 * CLI data events  → unnamed `data:` SSE messages  (eventType "message")
 * CLI done events  → named   `event: done` messages (eventType "done")
 *
 * Both data and done subscribe to the same SSE URL so they share one
 * EventSource connection via the pool above.
 *
 * File-sync events are handled by project-file-sync.ts directly via
 * /api/v1/file-sync/events (a single SSE connection per project).
 */
function tauriEventToSse(event: string): SseTarget | null {
  // "claude-cli:{streamId}" → line-by-line data events
  const claudeData = event.match(/^claude-cli:([^:]+)$/)
  if (claudeData) return { sseUrl: `/api/v1/cli/claude/${claudeData[1]}/events`, eventType: "message" }

  // "claude-cli:{streamId}:done" → named done event on the same stream
  const claudeDone = event.match(/^claude-cli:([^:]+):done$/)
  if (claudeDone) return { sseUrl: `/api/v1/cli/claude/${claudeDone[1]}/events`, eventType: "done" }

  // "codex-cli:{streamId}" → line-by-line data events
  const codexData = event.match(/^codex-cli:([^:]+)$/)
  if (codexData) return { sseUrl: `/api/v1/cli/codex/${codexData[1]}/events`, eventType: "message" }

  // "codex-cli:{streamId}:done" → named done event on the same stream
  const codexDone = event.match(/^codex-cli:([^:]+):done$/)
  if (codexDone) return { sseUrl: `/api/v1/cli/codex/${codexDone[1]}/events`, eventType: "done" }

  // File-sync events share a single SSE connection managed by the server.
  // Named event types match the Tauri event suffix after "file-sync://".
  if (event === "file-sync://queue-updated")
    return { sseUrl: "/api/v1/file-sync/events", eventType: "queue-updated" }
  if (event === "file-sync://changed")
    return { sseUrl: "/api/v1/file-sync/events", eventType: "changed" }

  return null
}

// ── convertFileSrc shim ───────────────────────────────────────────────────

/**
 * Drop-in replacement for `convertFileSrc` from `@tauri-apps/api/core`.
 * Must remain synchronous — callers use it directly in JSX and sync mappers.
 *
 * In Tauri: applies the Tauri v2 asset:// protocol URL format (stable since
 *   Tauri v1; same logic as @tauri-apps/api/core's own implementation).
 * In web:   returns a server URL for the file-asset endpoint so the browser
 *   can load local files served by the standalone server.
 */
export function convertFileSrc(filePath: string, protocol = "asset"): string {
  if (isTauri()) {
    // Mirror @tauri-apps/api/core's convertFileSrc implementation.
    // Windows uses https://<protocol>.localhost/<path>; other platforms
    // use <protocol>://localhost/<path>.
    const encoded = encodeURIComponent(filePath)
    return typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")
      ? `https://${protocol}.localhost/${encoded}`
      : `${protocol}://localhost/${encoded}`
  }
  // Server serves arbitrary local files at /api/v1/fs/asset?path=<encoded>
  return `${SERVER_URL}/api/v1/fs/asset?path=${encodeURIComponent(filePath)}`
}
