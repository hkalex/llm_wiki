import { useWikiStore } from "@/stores/wiki-store"
import { TauriTransport } from "./tauri-transport"
import { ServerTransport } from "./server-transport"
import type { ITransport } from "./transport"

export type { ITransport, FileBase64 } from "./transport"

let _tauri: TauriTransport | null = null

/** Return the active transport based on the current connection mode. */
export function getTransport(): ITransport {
  const { connectionMode, serverUrl } = useWikiStore.getState()
  if (connectionMode === "server" && serverUrl) {
    return new ServerTransport(serverUrl)
  }
  // Singleton: TauriTransport is stateless so one instance is enough.
  return (_tauri ??= new TauriTransport())
}
