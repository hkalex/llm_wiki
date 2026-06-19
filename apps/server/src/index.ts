/** Server entry: migrate, build the Fastify app, listen. */
import { buildServer } from "./server"
import { loadConfig } from "./config"
import { runMigrations } from "./db/migrate"

async function main(): Promise<void> {
  const config = loadConfig()
  await runMigrations()
  const app = await buildServer()
  await app.listen({ port: config.port, host: config.host })
  app.log.info(`llm-wiki server listening on ${config.host}:${config.port}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[server] fatal", err)
  process.exit(1)
})
