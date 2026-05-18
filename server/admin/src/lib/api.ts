/// <reference types="vite/client" />

export const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000/api/v1"

export function getToken(): string | null {
  return localStorage.getItem("admin_token")
}
export function setToken(t: string): void {
  localStorage.setItem("admin_token", t)
}
export function clearToken(): void {
  localStorage.removeItem("admin_token")
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface SafeUser {
  id: string
  email: string
  displayName: string
  role: "user" | "admin"
  status: "active" | "suspended"
  createdAt: number
  updatedAt: number
  projectCount: number
}

export interface ProjectWithOwner {
  id: string
  userId: string
  name: string
  slug: string
  storagePath: string
  createdAt: number
  updatedAt: number
  ownerEmail: string
  pageCount: number
  sourceCount: number
  storageBytes: number
}

export interface Project {
  id: string
  userId: string
  name: string
  slug: string
  storagePath: string
  createdAt: number
  updatedAt: number
}

export interface IngestItemWithOwner {
  id: string
  projectId: string
  sourcePath: string
  status: "pending" | "processing" | "done" | "failed"
  retryCount: number
  errorMessage: string | null
  createdAt: number
  updatedAt: number
  projectName: string
  ownerEmail: string
}

export interface AdminStats {
  users: { total: number; active: number; suspended: number; admin: number }
  projects: { total: number }
  ingest: { pending: number; processing: number; failed: number }
}

export interface SystemSettings {
  defaultLlmProvider: string
  defaultLlmModel: string
  defaultLlmApiKeyConfigured: boolean
  ingestRateLimitPerHour: number
  storageQuotaMb: number
  registrationOpen: boolean
}

// ── Core fetch ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((body as { message?: string }).message ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Auth ───────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<{ token: string; user: SafeUser }> {
  return apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
}

export async function logout(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" })
}

// ── Stats ──────────────────────────────────────────────────────────────────

export async function getStats(): Promise<AdminStats> {
  return apiFetch("/admin/stats")
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function listUsers(params?: {
  search?: string
  role?: string
  status?: string
  page?: number
  limit?: number
}): Promise<{ users: SafeUser[]; total: number; page: number; limit: number }> {
  const q = new URLSearchParams()
  if (params?.search) q.set("search", params.search)
  if (params?.role) q.set("role", params.role)
  if (params?.status) q.set("status", params.status)
  if (params?.page) q.set("page", String(params.page))
  if (params?.limit) q.set("limit", String(params.limit))
  return apiFetch(`/admin/users?${q}`)
}

export async function getUser(id: string): Promise<SafeUser> {
  return apiFetch(`/admin/users/${id}`)
}

export async function createUser(data: {
  email: string
  password: string
  display_name: string
  role?: string
}): Promise<SafeUser> {
  return apiFetch("/admin/users", { method: "POST", body: JSON.stringify(data) })
}

export async function updateUser(
  id: string,
  data: { display_name?: string; role?: string; status?: string },
): Promise<SafeUser> {
  return apiFetch(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) })
}

export async function deleteUser(id: string): Promise<void> {
  return apiFetch(`/admin/users/${id}`, { method: "DELETE" })
}

export async function suspendUser(id: string): Promise<SafeUser> {
  return apiFetch(`/admin/users/${id}/suspend`, { method: "POST" })
}

export async function activateUser(id: string): Promise<SafeUser> {
  return apiFetch(`/admin/users/${id}/activate`, { method: "POST" })
}

export async function resetPassword(id: string, newPassword: string): Promise<void> {
  return apiFetch(`/admin/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  })
}

export async function invalidateSessions(id: string): Promise<void> {
  return apiFetch(`/admin/users/${id}/invalidate-sessions`, { method: "POST" })
}

export async function getUserSettings(id: string): Promise<Record<string, string>> {
  return apiFetch(`/admin/users/${id}/settings`)
}

export async function updateUserSettings(id: string, data: Record<string, string>): Promise<Record<string, string>> {
  return apiFetch(`/admin/users/${id}/settings`, { method: "PATCH", body: JSON.stringify(data) })
}

export async function deleteUserSetting(id: string, key: string): Promise<void> {
  return apiFetch(`/admin/users/${id}/settings/${encodeURIComponent(key)}`, { method: "DELETE" })
}

// ── Projects ───────────────────────────────────────────────────────────────

export async function listProjects(params?: {
  page?: number
  limit?: number
}): Promise<{ projects: ProjectWithOwner[]; total: number; page: number; limit: number }> {
  const q = new URLSearchParams()
  if (params?.page) q.set("page", String(params.page))
  if (params?.limit) q.set("limit", String(params.limit))
  return apiFetch(`/admin/projects?${q}`)
}

export async function getProject(id: string): Promise<ProjectWithOwner> {
  return apiFetch(`/admin/projects/${id}`)
}

export async function renameProject(id: string, name: string): Promise<ProjectWithOwner> {
  return apiFetch(`/admin/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) })
}

export async function deleteProject(id: string): Promise<void> {
  return apiFetch(`/admin/projects/${id}`, { method: "DELETE" })
}

export async function transferProject(id: string, newOwnerId: string): Promise<ProjectWithOwner> {
  return apiFetch(`/admin/projects/${id}/transfer`, {
    method: "POST",
    body: JSON.stringify({ new_owner_id: newOwnerId }),
  })
}

// ── Ingest ─────────────────────────────────────────────────────────────────

export async function listIngestQueue(params?: {
  page?: number
  limit?: number
}): Promise<{ items: IngestItemWithOwner[]; total: number }> {
  const q = new URLSearchParams()
  if (params?.page) q.set("page", String(params.page))
  if (params?.limit) q.set("limit", String(params.limit))
  return apiFetch(`/admin/ingest/queue?${q}`)
}

export async function cancelIngestJob(jobId: string): Promise<void> {
  return apiFetch(`/admin/ingest/${jobId}`, { method: "DELETE" })
}

export async function drainQueue(): Promise<void> {
  return apiFetch("/admin/ingest/drain", { method: "POST" })
}

export async function resumeQueue(): Promise<void> {
  return apiFetch("/admin/ingest/resume", { method: "POST" })
}

// ── System settings ────────────────────────────────────────────────────────

export async function getSystemSettings(): Promise<SystemSettings> {
  return apiFetch("/admin/system/settings")
}

export async function updateSystemSettings(data: Partial<SystemSettings>): Promise<SystemSettings> {
  return apiFetch("/admin/system/settings", { method: "PATCH", body: JSON.stringify(data) })
}
