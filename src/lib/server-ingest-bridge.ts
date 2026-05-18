/**
 * Bridges server-side SSE ingest events into the client activity store.
 * Call startServerIngestBridge when opening a server-mode project,
 * stopServerIngestBridge when leaving one.
 */

import { useWikiStore } from "@/stores/wiki-store"
import { useActivityStore } from "@/stores/activity-store"
import { ServerTransport } from "@/lib/transport/server-transport"
import { getFileName } from "@/lib/path-utils"

let _unsubscribe: (() => void) | null = null
// Map server itemId → activity store activityId
const itemToActivity = new Map<string, string>()

export function startServerIngestBridge(projectId: string): void {
  stopServerIngestBridge()

  const { serverUrl } = useWikiStore.getState()
  if (!serverUrl) return

  const transport = new ServerTransport(serverUrl)
  _unsubscribe = transport.subscribeIngestEvents(projectId, (event) => {
    const activity = useActivityStore.getState()
    const type = event.type as string

    if (type === "snapshot") {
      const items = (event.items ?? []) as Array<{
        id: string
        sourcePath: string
        status: string
        errorMessage?: string | null
        retryCount?: number
      }>
      for (const item of items) {
        if (itemToActivity.has(item.id)) continue
        if (item.status === "done") continue

        const status = item.status === "failed" ? "error" : "running"
        const detail =
          item.status === "processing"
            ? "Processing..."
            : item.status === "failed"
            ? (item.errorMessage ?? "Failed")
            : "Queued..."

        const activityId = activity.addItem({
          type: "ingest",
          title: getFileName(item.sourcePath),
          status,
          detail,
          filesWritten: [],
        })
        itemToActivity.set(item.id, activityId)
      }
      return
    }

    const itemId = event.itemId as string | undefined
    if (!itemId) return

    if (type === "queued") {
      if (itemToActivity.has(itemId)) return
      const activityId = activity.addItem({
        type: "ingest",
        title: getFileName((event.sourcePath as string) ?? ""),
        status: "running",
        detail: "Queued...",
        filesWritten: [],
      })
      itemToActivity.set(itemId, activityId)
      return
    }

    const activityId = itemToActivity.get(itemId)
    if (!activityId) return

    switch (type) {
      case "progress":
        activity.updateItem(activityId, { detail: (event.detail as string) ?? "" })
        break
      case "done":
        activity.updateItem(activityId, {
          status: "done",
          filesWritten: (event.filesWritten as string[]) ?? [],
        })
        itemToActivity.delete(itemId)
        break
      case "error":
        activity.updateItem(activityId, {
          status: "error",
          detail: (event.message as string) ?? "Error",
        })
        itemToActivity.delete(itemId)
        break
      case "retry": {
        const retryCount = (event.retryCount as number) ?? 1
        const message = (event.message as string) ?? ""
        activity.updateItem(activityId, { detail: `Retry ${retryCount}/3: ${message}` })
        break
      }
      case "cancelled":
        activity.updateItem(activityId, { status: "done", detail: "Cancelled" })
        itemToActivity.delete(itemId)
        break
    }
  })
}

export function stopServerIngestBridge(): void {
  _unsubscribe?.()
  _unsubscribe = null
  itemToActivity.clear()
}
