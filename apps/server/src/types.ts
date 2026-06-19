/**
 * Server wire DTOs — the `/api/v1` contract shared with the thin clients and
 * the MCP server. Shapes intentionally mirror the existing api_server.rs
 * responses so the current MCP server keeps working against the new server.
 */

export interface ProjectDto {
  id: string
  name: string
  path: string
}

export interface FileNodeDto {
  name: string
  path: string
  is_dir: boolean
  children?: FileNodeDto[]
}

export interface SearchResultDto {
  path: string
  title: string
  snippet: string
  titleMatch: boolean
  score: number
  vectorScore?: number
}

export interface SearchResponseDto {
  mode: "keyword" | "vector" | "hybrid"
  results: SearchResultDto[]
  tokenHits: number
  vectorHits: number
}

export interface ReviewDto {
  id: string
  type: string
  title: string
  description: string
  sourcePath?: string
  affectedPages: string[]
  resolved: boolean
  resolvedAction?: string
  createdAt: number
}

export type ApiKeyScope = "client" | "scraper" | "admin"

/** Resolved identity for an authenticated request. */
export interface AuthContext {
  scope: ApiKeyScope
  /** null = access to all projects. */
  projectIds: string[] | null
}

/** A news/data item pushed by the scraper for ingestion. */
export interface IngestItemDto {
  externalId: string
  title: string
  url?: string
  publishedAt?: string
  contentType?: string
  content?: string
  contentBase64?: string
  folderContext?: string
  tags?: string[]
}
