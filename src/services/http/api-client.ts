/**
 * Low-level HTTP transport for the thin clients: base URL + bearer-token
 * injection, JSON helpers, and an SSE reader for streaming chat. Plain browser
 * `fetch` — the server (not the browser) talks to the CORS-hostile provider
 * APIs, so the Tauri HTTP plugin is no longer needed here.
 */

export interface ApiClientOptions {
  baseUrl: string
  getToken?: () => string | null
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export class ApiClient {
  constructor(private readonly opts: ApiClientOptions) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra }
    const token = this.opts.getToken?.()
    if (token) headers["Authorization"] = `Bearer ${token}`
    return headers
  }

  private url(path: string): string {
    return `${this.opts.baseUrl.replace(/\/+$/, "")}${path}`
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path), { headers: this.headers() })
    return this.parse<T>(res)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    })
    return this.parse<T>(res)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "PUT",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    })
    return this.parse<T>(res)
  }

  private async parse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let message = `HTTP ${res.status}`
      try {
        const data = (await res.json()) as { error?: string }
        if (data?.error) message = data.error
      } catch {
        // non-JSON error body
      }
      throw new ApiError(res.status, message)
    }
    return (await res.json()) as T
  }

  /**
   * POST and consume a text/event-stream response, invoking `onFrame(event,
   * data)` per SSE frame. Resolves when the stream ends; aborts via `signal`.
   */
  async stream(
    path: string,
    body: unknown,
    onFrame: (event: string, data: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json", Accept: "text/event-stream" }),
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok || !res.body) {
      throw new ApiError(res.status, `stream failed: HTTP ${res.status}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      // SSE frames are separated by a blank line.
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawFrame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        let event = "message"
        const dataLines: string[] = []
        for (const line of rawFrame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim()
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
        }
        if (dataLines.length > 0) onFrame(event, dataLines.join("\n"))
      }
    }
  }
}
