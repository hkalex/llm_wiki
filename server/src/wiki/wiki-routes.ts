import type { FastifyPluginAsync } from "fastify"
import { requireAuth } from "../auth/auth-middleware"
import { assertProjectAccess } from "../projects/project-service"
import { getWikiPage, putWikiPage, deleteWikiPage, listWikiTree, wikiPageExists } from "./wiki-service"

export const wikiRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /projects/:id/wiki  → directory tree
  fastify.get<{ Params: { id: string } }>(
    "/",
    { preHandler: [requireAuth] },
    async (request) => {
      const project = assertProjectAccess(request.params.id, request.user.id)
      return listWikiTree(project.storagePath)
    },
  )

  // HEAD /projects/:id/wiki/*  → existence check
  fastify.head<{ Params: { id: string; "*": string } }>(
    "/*",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const project = assertProjectAccess(request.params.id, request.user.id)
      const exists = wikiPageExists(project.storagePath, request.params["*"])
      reply.code(exists ? 200 : 404).send()
    },
  )

  // GET /projects/:id/wiki/*path  → page content
  fastify.get<{ Params: { id: string; "*": string } }>(
    "/*",
    { preHandler: [requireAuth] },
    async (request) => {
      const project = assertProjectAccess(request.params.id, request.user.id)
      return getWikiPage(project.storagePath, request.params["*"])
    },
  )

  // PUT /projects/:id/wiki/*path  → write page
  fastify.put<{ Params: { id: string; "*": string }; Body: { content: string } }>(
    "/*",
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: "object",
          required: ["content"],
          properties: { content: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const project = assertProjectAccess(request.params.id, request.user.id)
      putWikiPage(project.storagePath, request.params["*"], request.body.content)
      reply.code(200).send({ ok: true })
    },
  )

  // DELETE /projects/:id/wiki/*path  → delete page
  fastify.delete<{ Params: { id: string; "*": string } }>(
    "/*",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const project = assertProjectAccess(request.params.id, request.user.id)
      deleteWikiPage(project.storagePath, request.params["*"])
      reply.code(204).send()
    },
  )
}
