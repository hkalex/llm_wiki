import { useEffect, useState } from "react"
import { getStats, drainQueue, resumeQueue, type AdminStats } from "../lib/api"

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [drained, setDrained] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getStats().then(setStats).catch((e: unknown) => setError(String(e)))
  }, [])

  async function handleDrain() {
    try {
      await drainQueue()
      setDrained(true)
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleResume() {
    try {
      await resumeQueue()
      setDrained(false)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0, flex: 1 }}>Dashboard</h1>
        {drained ? (
          <button className="btn btn-primary btn-sm" onClick={() => void handleResume()}>Resume Queue</button>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => void handleDrain()}>Drain Queue</button>
        )}
      </div>
      {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}
      {stats ? (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="label">Total Users</div>
              <div className="value">{stats.users.total}</div>
            </div>
            <div className="stat-card">
              <div className="label">Active Users</div>
              <div className="value">{stats.users.active}</div>
            </div>
            <div className="stat-card">
              <div className="label">Suspended</div>
              <div className="value">{stats.users.suspended}</div>
            </div>
            <div className="stat-card">
              <div className="label">Admins</div>
              <div className="value">{stats.users.admin}</div>
            </div>
            <div className="stat-card">
              <div className="label">Total Projects</div>
              <div className="value">{stats.projects.total}</div>
            </div>
            <div className="stat-card">
              <div className="label">Pending Ingest</div>
              <div className="value">{stats.ingest.pending}</div>
            </div>
            <div className="stat-card">
              <div className="label">Processing</div>
              <div className="value">{stats.ingest.processing}</div>
            </div>
            <div className="stat-card">
              <div className="label">Failed</div>
              <div className="value">{stats.ingest.failed}</div>
            </div>
          </div>
          {drained && (
            <div className="card" style={{ background: "#fef9c3", borderColor: "#fde047", color: "#854d0e" }}>
              Queue is drained. No new ingest jobs will be processed until you resume.
            </div>
          )}
        </>
      ) : (
        !error && <div className="empty-state">Loading...</div>
      )}
    </div>
  )
}
