import { useEffect, useState } from "react"
import { listProjects, renameProject, deleteProject, type ProjectWithOwner } from "../../lib/api"
import ConfirmDialog from "../../components/ConfirmDialog"

const PAGE_SIZE = 20

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ProjectList() {
  const [projects, setProjects] = useState<ProjectWithOwner[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [confirm, setConfirm] = useState<ProjectWithOwner | null>(null)

  async function load() {
    try {
      const res = await listProjects({ page, limit: PAGE_SIZE })
      setProjects(res.projects)
      setTotal(res.total)
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => { void load() }, [page])

  async function handleRename(id: string) {
    try {
      await renameProject(id, editName)
      setEditingId(null)
      void load()
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleDelete() {
    if (!confirm) return
    try {
      await deleteProject(confirm.id)
      setConfirm(null)
      void load()
    } catch (e) {
      setError(String(e))
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <h1 className="page-title">Projects</h1>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Owner</th>
              <th>Pages</th>
              <th>Sources</th>
              <th>Storage</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr><td colSpan={7} className="empty-state">No projects</td></tr>
            )}
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  {editingId === p.id ? (
                    <span style={{ display: "flex", gap: 4 }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ width: 160 }}
                        autoFocus
                      />
                      <button className="btn btn-primary btn-sm" onClick={() => void handleRename(p.id)}>Save</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                    </span>
                  ) : (
                    p.name
                  )}
                </td>
                <td>{p.ownerEmail}</td>
                <td>{p.pageCount}</td>
                <td>{p.sourceCount}</td>
                <td>{formatBytes(p.storageBytes)}</td>
                <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setEditingId(p.id); setEditName(p.name) }}
                  >
                    Rename
                  </button>
                  {" "}
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirm(p)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Prev
          </button>
          <span>{page} / {totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          title="Delete project"
          message={`Permanently delete "${confirm.name}" and all its files?`}
          dangerous
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
