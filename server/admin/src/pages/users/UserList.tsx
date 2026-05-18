import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  listUsers,
  suspendUser,
  activateUser,
  deleteUser,
  type SafeUser,
} from "../../lib/api"
import ConfirmDialog from "../../components/ConfirmDialog"

const PAGE_SIZE = 20

export default function UserList() {
  const [users, setUsers] = useState<SafeUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [role, setRole] = useState("")
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState<{ action: string; user: SafeUser } | null>(null)

  async function load() {
    try {
      const res = await listUsers({ search, role, status, page, limit: PAGE_SIZE })
      setUsers(res.users)
      setTotal(res.total)
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => { void load() }, [search, role, status, page])

  async function handleConfirm() {
    if (!confirm) return
    try {
      if (confirm.action === "suspend") {
        const updated = await suspendUser(confirm.user.id)
        setUsers((u) => u.map((x) => (x.id === updated.id ? updated : x)))
      } else if (confirm.action === "activate") {
        const updated = await activateUser(confirm.user.id)
        setUsers((u) => u.map((x) => (x.id === updated.id ? updated : x)))
      } else if (confirm.action === "delete") {
        await deleteUser(confirm.user.id)
        void load()
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setConfirm(null)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <h1 className="page-title">Users</h1>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search email or name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}>
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Projects</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={7} className="empty-state">No users found</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.displayName}</td>
                <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                <td><span className={`badge badge-${u.status}`}>{u.status}</span></td>
                <td>{u.projectCount}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link className="btn btn-secondary btn-sm" to={`/users/${u.id}`}>View</Link>
                  {" "}
                  {u.status === "active" ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => setConfirm({ action: "suspend", user: u })}>
                      Suspend
                    </button>
                  ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => setConfirm({ action: "activate", user: u })}>
                      Activate
                    </button>
                  )}
                  {" "}
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ action: "delete", user: u })}>
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
          title={confirm.action === "delete" ? "Delete user" : confirm.action === "suspend" ? "Suspend user" : "Activate user"}
          message={
            confirm.action === "delete"
              ? `Permanently delete ${confirm.user.email} and all their projects?`
              : confirm.action === "suspend"
              ? `Suspend ${confirm.user.email}? They will be logged out.`
              : `Reactivate ${confirm.user.email}?`
          }
          dangerous={confirm.action === "delete"}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
