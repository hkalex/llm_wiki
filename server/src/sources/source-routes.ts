import type { FastifyPluginAsync } from "fastify"
import { requireAuth } from "../auth/auth-middleware"
import { assertProjectAccess } from "../projects/project-service"
import { listSources, deleteSource, saveUploadedSource } from "./source-service"
import { BadRequestError } from "../shared/errors"

export const sourceRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /projects/:id/sources
  fastify.get<{ Params: { id: string } }>(
    "/",
    { preHandler: [requireAuth] },
    async (request) => {
      const project = assertProjectAccess(request.params.id, request.user.id)
      return listSources(project.storagePath)
    },
  )

  // POST /projects/:id/sources  (multipart upload)
  fastify.post<{ Params: { id: string } }>(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const project = assertProjectAccess(request.params.id, request.user.id)

      const data = await request.file()
      if (!data) throw new BadRequestError("No file in request")

      const chunks: Buffer[] = []
      for await (const chunk of data.file) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      const source = saveUploadedSource(project.storagePath, data.filename, buffer)
      reply.code(201).send(source)
    },
  )

  // DELETE /projects/:id/sources/*path
  fastify.delete<{ Params: { id: string; "*": string } }>(
    "/*",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const project = assertProjectAccess(request.params.id, request.user.id)
      deleteSource(project.storagePath, request.params["*"])
      reply.code(204).send()
    },
  )
}
