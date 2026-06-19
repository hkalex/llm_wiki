/**
 * Schema migrations, inlined as strings so they bundle into dist/ (no runtime
 * file lookups). Each runs once, tracked in `_migrations`.
 *
 * Design (per the plan): wiki/source content stays files-on-disk as the source
 * of truth; Postgres holds the rebuildable derived index (pages FTS + chunk
 * vectors), plus durable state (reviews, ingest dedup cache, api keys, config).
 *
 * `chunks.embedding` is declared `vector` without a fixed dimension so any
 * embedding provider works out of the box (brute-force scan). Large-scale
 * deployments should pin a dimension and add an HNSW index — a documented
 * hardening step, see deploy/README.
 */

export interface Migration {
  id: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    id: "001_init",
    sql: /* sql */ `
      CREATE EXTENSION IF NOT EXISTS vector;

      CREATE TABLE IF NOT EXISTS projects (
        id          UUID PRIMARY KEY,
        name        TEXT NOT NULL,
        storage_uri TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS pages (
        project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        page_id      TEXT NOT NULL,
        rel_path     TEXT NOT NULL,
        title        TEXT NOT NULL DEFAULT '',
        type         TEXT NOT NULL DEFAULT '',
        content_hash TEXT NOT NULL DEFAULT '',
        fts          tsvector,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, page_id)
      );
      CREATE INDEX IF NOT EXISTS pages_fts_idx ON pages USING gin (fts);

      CREATE TABLE IF NOT EXISTS chunks (
        project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        chunk_id     TEXT NOT NULL,
        page_id      TEXT NOT NULL,
        chunk_index  INTEGER NOT NULL,
        chunk_text   TEXT NOT NULL,
        heading_path TEXT NOT NULL DEFAULT '',
        embedding    vector,
        PRIMARY KEY (project_id, chunk_id)
      );
      CREATE INDEX IF NOT EXISTS chunks_page_idx ON chunks (project_id, page_id);

      CREATE TABLE IF NOT EXISTS reviews (
        project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        id              TEXT NOT NULL,
        type            TEXT NOT NULL DEFAULT '',
        title           TEXT NOT NULL DEFAULT '',
        description     TEXT NOT NULL DEFAULT '',
        source_path     TEXT,
        affected_pages  TEXT[] NOT NULL DEFAULT '{}',
        options         JSONB,
        resolved        BOOLEAN NOT NULL DEFAULT false,
        resolved_action TEXT,
        created_at      BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (project_id, id)
      );

      CREATE TABLE IF NOT EXISTS ingest_cache (
        project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_name   TEXT NOT NULL,
        external_id   TEXT,
        hash          TEXT NOT NULL,
        files_written TEXT[] NOT NULL DEFAULT '{}',
        ts            BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (project_id, source_name)
      );
      CREATE INDEX IF NOT EXISTS ingest_cache_ext_idx
        ON ingest_cache (project_id, external_id);

      CREATE TABLE IF NOT EXISTS api_keys (
        id          UUID PRIMARY KEY,
        name        TEXT NOT NULL DEFAULT '',
        key_hash    TEXT NOT NULL UNIQUE,
        scope       TEXT NOT NULL DEFAULT 'client',
        project_ids UUID[],
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used   TIMESTAMPTZ,
        revoked     BOOLEAN NOT NULL DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS server_config (
        key   TEXT PRIMARY KEY,
        value JSONB NOT NULL
      );
    `,
  },
]
