/**
 * Connection / login gate for the web (PWA) thin client: the user enters the
 * server URL + API token, which are stored client-side and used by the
 * DataService. Renders `children` once a /health check succeeds.
 *
 * Desktop (tauri target) does not use this — it talks to local Tauri compute;
 * see isWebTarget(). Wiring this as the web boot gate happens in main/App for
 * the web build (CLIENT_TARGET=web).
 */
import { useState, type ReactNode } from "react"
import {
  getApiToken,
  getDataService,
  getServerUrl,
  resetDataService,
  setApiToken,
  setServerUrl,
} from "@/services"

type Status = "idle" | "checking" | "connected" | "error"

export function ConnectionGate({ children }: { children: ReactNode }): ReactNode {
  const [url, setUrl] = useState(getServerUrl())
  const [token, setToken] = useState(getApiToken() ?? "")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState("")

  async function connect(): Promise<void> {
    setStatus("checking")
    setError("")
    setServerUrl(url.trim())
    setApiToken(token.trim())
    resetDataService()
    try {
      const health = await getDataService().health()
      if (health.status === "ok") {
        setStatus("connected")
      } else {
        setStatus("error")
        setError("Unexpected health response")
      }
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Connection failed")
    }
  }

  if (status === "connected") return <>{children}</>

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Connect to LLM Wiki</h1>
          <p className="text-sm text-muted-foreground">
            Enter your server URL and API token.
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Server URL</span>
          <input
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://wiki.example.com"
            autoComplete="url"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">API token</span>
          <input
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="lwk_…"
            autoComplete="current-password"
          />
        </label>
        {status === "error" && <p className="text-sm text-destructive">{error}</p>}
        <button
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          onClick={() => void connect()}
          disabled={status === "checking" || !url.trim()}
        >
          {status === "checking" ? "Connecting…" : "Connect"}
        </button>
      </div>
    </div>
  )
}
