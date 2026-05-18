import type { FastifyPluginAsync } from "fastify"
import { requireAuth } from "../auth/auth-middleware"
import { listProjects, createProject, deleteProject, getProject } from "./project-service"

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", { preHandler: [requireAuth] }, async (request) => {
    return listProjects(request.user.id)
  })

  fastify.post<{ Body: { name: string } }>(
    "/",
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const project = createProject(request.user.id, request.body.name)
      reply.code(201).send(project)
    },
  )

  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      return getProject(request.params.id, request.user.id)
    },
  )

  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      deleteProject(request.params.id, request.user.id)
      reply.code(204).send()
    },
  )
}
