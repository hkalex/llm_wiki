import { useEffect, useState } from "react"
import { getSystemSettings, updateSystemSettings, type SystemSettings } from "../../lib/api"

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [rateLimit, setRateLimit] = useState(20)
  const [quotaMb, setQuotaMb] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSystemSettings()
      .then((s) => {
        setSettings(s)
        setRegistrationOpen(s.registrationOpen)
        setRateLimit(s.ingestRateLimitPerHour)
        setQuotaMb(s.storageQuotaMb)
      })
      .catch((e: unknown) => setError(String(e)))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const updated = await updateSystemSettings({
        registrationOpen,
        ingestRateLimitPerHour: rateLimit,
        storageQuotaMb: quotaMb,
      })
      setSettings(updated)
      setSaved(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <div className="empty-state">Loading...</div>

  return (
    <div>
      <h1 className="page-title">System Settings</h1>
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Environment (read-only)</h2>
        <table>
          <tbody>
            <tr>
              <td><strong>Default LLM Provider</strong></td>
              <td>{settings.defaultLlmProvider}</td>
            </tr>
            <tr>
              <td><strong>Default LLM Model</strong></td>
              <td>{settings.defaultLlmModel}</td>
            </tr>
            <tr>
              <td><strong>Default API Key</strong></td>
              <td>{settings.defaultLlmApiKeyConfigured ? "Configured" : "Not set"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Overrides</h2>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={registrationOpen}
              onChange={(e) => setRegistrationOpen(e.target.checked)}
              style={{ width: "auto", marginRight: 8 }}
            />
            Registration open (new users can sign up)
          </label>
        </div>
        <div className="form-group">
          <label>Ingest rate limit (jobs per hour, 0 = unlimited)</label>
          <input
            type="number"
            min={0}
            value={rateLimit}
            onChange={(e) => setRateLimit(parseInt(e.target.value, 10) || 0)}
            style={{ maxWidth: 160 }}
          />
        </div>
        <div className="form-group">
          <label>Storage quota per user (MB, 0 = unlimited)</label>
          <input
            type="number"
            min={0}
            value={quotaMb}
            onChange={(e) => setQuotaMb(parseInt(e.target.value, 10) || 0)}
            style={{ maxWidth: 160 }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <span style={{ color: "var(--success)", fontSize: 13 }}>Saved</span>}
        </div>
      </div>
    </div>
  )
}
