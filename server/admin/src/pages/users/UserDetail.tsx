import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  getUser,
  updateUser,
  deleteUser,
  resetPassword,
  invalidateSessions,
  getUserSettings,
  deleteUserSetting,
  type SafeUser,
} from "../../lib/api"
import ConfirmDialog from "../../components/ConfirmDialog"

export default function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [user, setUser] = useState<SafeUser | null>(null)
  const [userSettings, setUserSettings] = useState<Record<string, string>>({})
  const [displayName, setDisplayName] = useState("")
  const [role, setRole] = useState<"user" | "admin">("user")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<{ action: string } | null>(null)
  const [newPassword, setNewPassword] = useState("")

  useEffect(() => {
    if (!id) return
    getUser(id).then((u) => {
      setUser(u)
      setDisplayName(u.displayName)
      setRole(u.role)
    }).catch((e: unknown) => setError(String(e)))
    getUserSettings(id).then(setUserSettings).catch(() => {})
  }, [id])

  async function handleSave() {
    if (!id) return
    setSaving(true)
    try {
      const updated = await updateUser(id, { display_name: displayName, role })
      setUser(updated)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirm() {
    if (!id || !confirm) return
    try {
      if (confirm.action === "delete") {
        await deleteUser(id)
        navigate("/users", { replace: true })
      } else if (confirm.action === "reset-password") {
        await resetPassword(id, newPassword)
        setNewPassword("")
      } else if (confirm.action === "invalidate-sessions") {
        await invalidateSessions(id)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setConfirm(null)
    }
  }

  async function handleDeleteSetting(key: string) {
    if (!id) return
    try {
      await deleteUserSetting(id, key)
      const updated = { ...userSettings }
      delete updated[key]
      setUserSettings(updated)
    } catch (e) {
      setError(String(e))
    }
  }

  if (!user) return <div className="empty-state">Loading...</div>

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0, flex: 1 }}>User: {user.email}</h1>
        <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ action: "delete" })}>
          Delete User
        </button>
      </div>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-group">
          <label>Email</label>
          <input type="text" value={user.email} disabled />
        </div>
        <div className="form-group">
          <label>Display Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              const pw = prompt("New password (min 8 chars):")
              if (pw && pw.length >= 8) { setNewPassword(pw); setConfirm({ action: "reset-password" }) }
            }}
          >
            Reset Password
          </button>
          <button className="btn btn-secondary" onClick={() => setConfirm({ action: "invalidate-sessions" })}>
            Invalidate Sessions
          </button>
        </div>
      </div>
      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>User Settings</h2>
        {Object.keys(userSettings).length === 0 ? (
          <div className="empty-state">No settings</div>
        ) : (
          <table>
            <thead>
              <tr><th>Key</th><th>Value</th><th></th></tr>
            </thead>
            <tbody>
              {Object.entries(userSettings).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => void handleDeleteSetting(k)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title={
            confirm.action === "delete"
              ? "Delete user"
              : confirm.action === "reset-password"
              ? "Reset password"
              : "Invalidate sessions"
          }
          message={
            confirm.action === "delete"
              ? `Permanently delete ${user.email} and all their data?`
              : confirm.action === "reset-password"
              ? `Set a new password for ${user.email}?`
              : `Log out all active sessions for ${user.email}?`
          }
          dangerous={confirm.action === "delete"}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
