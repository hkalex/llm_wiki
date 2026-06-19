/** Apply pending migrations. Run via `npm run migrate` or on server boot. */
import { getPool, withTransaction } from "./pool"
import { MIGRATIONS } from "./migrations"

export async function runMigrations(): Promise<void> {
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS _migrations (
       id TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  )
  const applied = new Set(
    (await getPool().query<{ id: string }>("SELECT id FROM _migrations")).rows.map(
      (r) => r.id,
    ),
  )
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    await withTransaction(async (client) => {
      await client.query(migration.sql)
      await client.query("INSERT INTO _migrations (id) VALUES ($1)", [migration.id])
    })
    // eslint-disable-next-line no-console
    console.log(`[migrate] applied ${migration.id}`)
  }
}

// Allow standalone invocation: `tsx src/db/migrate.ts`.
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /db[/\\]migrate\.[tj]s$/.test(process.argv[1])

if (invokedDirectly) {
  runMigrations()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log("[migrate] done")
      return getPool().end()
    })
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[migrate] failed", err)
      process.exit(1)
    })
}
