import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { login, setToken } from "../lib/api"

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await login(email, password)
      if (res.user.role !== "admin") {
        setError("Access denied — admin accounts only")
        return
      }
      setToken(res.token)
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Admin Portal</h1>
        <p>Sign in to manage LLM Wiki</p>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
