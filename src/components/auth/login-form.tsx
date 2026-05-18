import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setServerToken } from "@/lib/server-auth"
import { useWikiStore } from "@/stores/wiki-store"

interface Props {
  onSuccess: () => void
}

type Mode = "login" | "register"

export function LoginForm({ onSuccess }: Props) {
  const serverUrl = useWikiStore((s) => s.serverUrl)
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!serverUrl) return
    setError("")
    setLoading(true)
    try {
      const endpoint = mode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register"
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, display_name: displayName }

      const res = await fetch(`${serverUrl.replace(/\/$/, "")}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { token?: string; message?: string }
      if (!res.ok) {
        setError(data.message ?? `HTTP ${res.status}`)
        return
      }
      if (!data.token) {
        setError("Server did not return a token")
        return
      }
      setServerToken(data.token)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {mode === "login" ? "Sign in" : "Create account"}
          </h1>
          <p className="text-sm text-muted-foreground">{serverUrl}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
                autoFocus
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus={mode === "login"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "At least 8 characters" : ""}
              required
              minLength={mode === "register" ? 8 : undefined}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === "login" ? "Signing in…" : "Creating account…"}
              </>
            ) : mode === "login" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? "No account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login")
              setError("")
            }}
            className="underline hover:text-foreground"
          >
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  )
}
