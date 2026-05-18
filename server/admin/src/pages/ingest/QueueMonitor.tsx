import { useEffect, useState } from "react"
import {
  listIngestQueue,
  cancelIngestJob,
  drainQueue,
  resumeQueue,
  type IngestItemWithOwner,
} from "../../lib/api"
import ConfirmDialog from "../../components/ConfirmDialog"

const PAGE_SIZE = 50

export default function QueueMonitor() {
  const [items, setItems] = useState<IngestItemWithOwner[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState("")
  const [drained, setDrained] = useState(false)
  const [confirm, setConfirm] = useState<{ action: string; item?: IngestItemWithOwner } | null>(null)

  async function load() {
    try {
      const res = await listIngestQueue({ page, limit: PAGE_SIZE })
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 5000)
    return () => clearInterval(t)
  }, [page])

  async function handleCancel(item: IngestItemWithOwner) {
    try {
      await cancelIngestJob(item.id)
      void load()
    } catch (e) {
      setError(String(e))
    } finally {
      setConfirm(null)
    }
  }

  async function handleCancelAllFailed() {
    const failed = items.filter((i) => i.status === "failed")
    for (const item of failed) {
      try { await cancelIngestJob(item.id) } catch { /* continue */ }
    }
    setConfirm(null)
    void load()
  }

  async function handleDrain() {
    try { await drainQueue(); setDrained(true) } catch (e) { setError(String(e)) }
  }

  async function handleResume() {
    try { await resumeQueue(); setDrained(false) } catch (e) { setError(String(e)) }
  }

  const failedCount = items.filter((i) => i.status === "failed").length
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20, gap: 8 }}>
        <h1 className="page-title" style={{ marginBottom: 0, flex: 1 }}>Ingest Queue</h1>
        {failedCount > 0 && (
          <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ action: "cancel-all-failed" })}>
            Cancel All Failed ({failedCount})
          </button>
        )}
        {drained ? (
          <button className="btn btn-primary btn-sm" onClick={() => void handleResume()}>Resume Queue</button>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => void handleDrain()}>Drain Queue</button>
        )}
      </div>
      {drained && (
        <div className="card" style={{ marginBottom: 16, background: "#fef9c3", borderColor: "#fde047", color: "#854d0e" }}>
          Queue is drained. No new jobs will be processed.
        </div>
      )}
      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Source File</th>
              <th>Project</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Retries</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className="empty-state">Queue is empty</td></tr>
            )}
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.sourcePath.split(/[\\/]/).pop()}
                </td>
                <td>{item.projectName}</td>
                <td>{item.ownerEmail}</td>
                <td><span className={`badge badge-${item.status}`}>{item.status}</span></td>
                <td>{item.retryCount}</td>
                <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                <td>
                  {item.status !== "done" && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirm({ action: "cancel", item })}
                    >
                      Cancel
                    </button>
                  )}
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
      {confirm?.action === "cancel" && confirm.item && (
        <ConfirmDialog
          title="Cancel job"
          message={`Cancel ingest job for "${confirm.item.sourcePath.split(/[\\/]/).pop()}"?`}
          dangerous
          onConfirm={() => void handleCancel(confirm.item!)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.action === "cancel-all-failed" && (
        <ConfirmDialog
          title="Cancel all failed jobs"
          message={`Remove all ${failedCount} failed jobs from the queue?`}
          dangerous
          onConfirm={() => void handleCancelAllFailed()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
