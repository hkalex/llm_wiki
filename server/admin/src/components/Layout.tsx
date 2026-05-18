import { NavLink, useNavigate } from "react-router-dom"
import { clearToken, logout } from "../lib/api"

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    clearToken()
    navigate("/login", { replace: true })
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">LLM Wiki Admin</div>
        <nav className="sidebar-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/users">Users</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/ingest">Ingest Queue</NavLink>
          <NavLink to="/system">System Settings</NavLink>
        </nav>
        <div className="sidebar-footer">
          <button className="btn btn-secondary btn-sm" onClick={() => void handleLogout()}>
            Logout
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="page">{children}</div>
      </div>
    </div>
  )
}
