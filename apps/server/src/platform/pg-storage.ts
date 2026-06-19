/**
 * Project registry backed by Postgres — replaces the app-state.json project
 * registry from api_server.rs. Per-project files live at <dataDir>/<id>/...
 */
import path from "node:path"
import { query } from "../db/pool"
import { loadConfig } from "../config"
import type { ProjectDto } from "../types"

interface ProjectRow {
  id: string
  name: string
  storage_uri: string
}

/** Absolute on-disk path for a project's files. */
export function projectDir(projectId: string): string {
  return path.join(loadConfig().dataDir, projectId)
}

function toDto(row: ProjectRow): ProjectDto {
  return { id: row.id, name: row.name, path: projectDir(row.id) }
}

export async function listProjects(): Promise<ProjectDto[]> {
  const rows = await query<ProjectRow>(
    "SELECT id, name, storage_uri FROM projects ORDER BY name",
  )
  return rows.map(toDto)
}

export async function resolveProject(idOrName: string): Promise<ProjectDto | null> {
  const rows = await query<ProjectRow>(
    "SELECT id, name, storage_uri FROM projects WHERE id::text = $1 OR name = $1 LIMIT 1",
    [idOrName],
  )
  return rows[0] ? toDto(rows[0]) : null
}

export async function createProject(id: string, name: string): Promise<ProjectDto> {
  const storageUri = `file://${projectDir(id)}`
  const rows = await query<ProjectRow>(
    `INSERT INTO projects (id, name, storage_uri) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
     RETURNING id, name, storage_uri`,
    [id, name, storageUri],
  )
  return toDto(rows[0]!)
}
