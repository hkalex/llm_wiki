import type { FastifyReply, FastifyRequest } from "fastify"
import { canAccessProject } from "../auth/auth"
import { resolveProject } from "../platform/pg-storage"
import type { ProjectDto } from "../types"

/** Resolve the :id param to a project and authorize the request, or reply with an error. */
export async function loadProject(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ProjectDto | null> {
  const { id } = request.params as { id: string }
  const project = await resolveProject(id)
  if (!project) {
    await reply.code(404).send({ error: "project not found" })
    return null
  }
  if (!canAccessProject(request, project.id)) {
    await reply.code(403).send({ error: "no access to this project" })
    return null
  }
  return project
}
