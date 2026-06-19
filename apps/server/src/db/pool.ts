/** Shared Postgres connection pool. */
import pg from "pg"
import type { Pool as PoolType, PoolClient, QueryResultRow } from "pg"
import { loadConfig } from "../config"

const { Pool } = pg

let pool: PoolType | null = null

export function getPool(): PoolType {
  if (!pool) {
    pool = new Pool({ connectionString: loadConfig().databaseUrl, max: 10 })
  }
  return pool
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params as never[])
  return res.rows
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const out = await fn(client)
    await client.query("COMMIT")
    return out
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}

/** Serialize a number[] into a pgvector literal: [1,2,3]. Cast with $n::vector. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}
