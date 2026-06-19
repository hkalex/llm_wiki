/**
 * DataService factory + client-side connection settings (server URL + API
 * token). Web/PWA store these in localStorage; the Tauri thin client can
 * override via setServerUrl/setApiToken backed by its own store.
 */
import { ApiClient } from "./http/api-client"
import { HttpDataService } from "./http/http-data-service"
import type { DataService } from "./types"

export * from "./types"
export { ApiError } from "./http/api-client"

/** The build target — "tauri" (desktop) or "web" (browser/PWA). */
export function getClientTarget(): "tauri" | "web" {
  return typeof __CLIENT_TARGET__ === "undefined" ? "tauri" : __CLIENT_TARGET__
}

/** True when running as a server-backed thin client (browser/PWA). */
export function isWebTarget(): boolean {
  return getClientTarget() === "web"
}

const TOKEN_KEY = "llm-wiki.api-token"
const BASE_URL_KEY = "llm-wiki.server-url"

function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value)
  } catch {
    // storage unavailable (private mode / SSR) — ignore
  }
}

export function getServerUrl(): string {
  const stored = readStorage(BASE_URL_KEY)
  if (stored) return stored
  // Default to same-origin (server serves the web build) or local dev server.
  return typeof window !== "undefined" ? window.location.origin : "http://localhost:8080"
}

export function setServerUrl(url: string): void {
  writeStorage(BASE_URL_KEY, url)
  cached = null
}

export function getApiToken(): string | null {
  return readStorage(TOKEN_KEY)
}

export function setApiToken(token: string): void {
  writeStorage(TOKEN_KEY, token)
  cached = null
}

let cached: DataService | null = null

export function getDataService(): DataService {
  if (!cached) {
    const api = new ApiClient({ baseUrl: getServerUrl(), getToken: getApiToken })
    cached = new HttpDataService(api)
  }
  return cached
}

/** Drop the cached client (after changing server URL / token). */
export function resetDataService(): void {
  cached = null
}
