import { useState } from "react"
import { CheckCircle, XCircle, Loader2, Server } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { pingServer } from "@/lib/transport/server-transport"
import type { SettingsDraft, DraftSetter } from "../settings-types"

interface Props {
  draft: SettingsDraft
  setDraft: DraftSetter
}

type PingState = "idle" | "pending" | "ok" | "error"

export function ServerConnectionSection({ draft, setDraft }: Props) {
  const [pingState, setPingState] = useState<PingState>("idle")
  const [pingMessage, setPingMessage] = useState("")

  async function handlePing() {
    const url = draft.serverUrl.trim()
    if (!url) return
    setPingState("pending")
    setPingMessage("")
    const result = await pingServer(url)
    if (result.ok) {
      setPingState("ok")
      setPingMessage(result.version ? `Connected — server v${result.version}` : "Connected")
    } else {
      setPingState("error")
      setPingMessage(result.error ?? "Connection failed")
    }
  }

  const urlTrimmed = draft.serverUrl.trim()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Server className="h-5 w-5" />
          Connection Mode
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Switch between local Desktop Mode (default) and a remote LLM Wiki Server. In Server Mode all LLM
          pipeline execution and wiki storage run on the server — the desktop app becomes a thin client.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="connectionMode"
            value="local"
            checked={draft.connectionMode === "local"}
            onChange={() => setDraft("connectionMode", "local")}
            className="mt-0.5 h-4 w-4"
          />
          <div>
            <span className="text-sm font-medium">Local (Desktop)</span>
            <p className="text-xs text-muted-foreground">
              All processing runs locally. LLM API keys are stored on this device. Default mode.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="connectionMode"
            value="server"
            checked={draft.connectionMode === "server"}
            onChange={() => setDraft("connectionMode", "server")}
            className="mt-0.5 h-4 w-4"
          />
          <div>
            <span className="text-sm font-medium">Server</span>
            <p className="text-xs text-muted-foreground">
              Connect to a self-hosted LLM Wiki Server. API keys stay on the server. Requires a server URL below.
            </p>
          </div>
        </label>
      </div>

      {draft.connectionMode === "server" && (
        <div className="space-y-4 pl-7">
          <div className="space-y-2">
            <Label htmlFor="server-url">Server URL</Label>
            <div className="flex gap-2">
              <Input
                id="server-url"
                value={draft.serverUrl}
                onChange={(e) => {
                  setDraft("serverUrl", e.target.value)
                  setPingState("idle")
                }}
                placeholder="https://llmwiki.example.com"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handlePing}
                disabled={!urlTrimmed || pingState === "pending"}
              >
                {pingState === "pending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Test"
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Full URL including scheme. The app will ping <code>/api/v1/health</code> to verify connectivity.
            </p>
          </div>

          {pingState === "ok" && (
            <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              {pingMessage}
            </p>
          )}
          {pingState === "error" && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              {pingMessage}
            </p>
          )}

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <strong>Phase 1 preview.</strong> Server Mode infrastructure is in place but the server-side HTTP API is not yet implemented. Switching to Server Mode will disable all wiki operations until Phase 2 ships.
          </div>
        </div>
      )}
    </div>
  )
}
