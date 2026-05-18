import { useState, useEffect } from "react"
import { Plus, Folder, Loader2, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getServerToken, clearServerToken } from "@/lib/server-auth"
import { useWikiStore } from "@/stores/wiki-store"

interface ServerProject {
  id: string
  name: string
  slug: string
  createdAt: number
}

interface Props {
  onProjectSelected: (project: ServerProject) => void
  onLogout: () => void
}

export function ServerProjectPicker({ onProjectSelected, onLogout }: Props) {
  const serverUrl = useWikiStore((s) => s.serverUrl).replace(/\/$/, "")
  const [projects, setProjects] = useState<ServerProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [createLoading, setCreateLoading] = useState(false)

  const token = getServerToken()

  async function fetchProjects() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) { onLogout(); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setProjects(await res.json() as ServerProject[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProjects() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreateLoading(true)
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (res.status === 401) { onLogout(); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const project = await res.json() as ServerProject
      setCreating(false)
      setNewName("")
      onProjectSelected(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project")
    } finally {
      setCreateLoading(false)
    }
  }

  function handleLogout() {
    clearServerToken()
    onLogout()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Your projects</h1>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1.5 h-4 w-4" />
            Sign out
          </Button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {!loading && projects.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground">No projects yet. Create one to get started.</p>
        )}

        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onProjectSelected(p)}
                className="flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left hover:bg-accent"
              >
                <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="font-medium">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>

        {creating ? (
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              autoFocus
              className="flex-1"
            />
            <Button type="submit" disabled={createLoading || !newName.trim()}>
              {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New project
          </Button>
        )}
      </div>
    </div>
  )
}
