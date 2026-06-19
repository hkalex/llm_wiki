# Deploying LLM Wiki (server)

The same `docker-compose.yml` runs on a home server and in the cloud — only
`.env` differs.

## Quick start

```bash
cp deploy/.env.example deploy/.env
# edit deploy/.env: set POSTGRES_PASSWORD and LLM_WIKI_AUTH_TOKEN

docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
# API on http://localhost:8080 ; health check:
curl -s http://localhost:8080/api/v1/health
```

The server runs DB migrations automatically on boot.

### Remote access with HTTPS (home server)

Point a domain at your home IP (e.g. DuckDNS), set `TLS_DOMAIN` in `.env`, then:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env --profile tls up -d
```

Caddy obtains a Let's Encrypt certificate automatically. SSE (the `/chat`
stream) is forwarded unbuffered (`flush_interval -1`).

### Cloud

Same images. Either keep the `db` service or point `DATABASE_URL` at a managed
Postgres (must have the `pgvector` extension). Set a real `TLS_DOMAIN`, scale
the `server` service behind the proxy.

## Auth

- `LLM_WIKI_AUTH_TOKEN` is the bootstrap **admin** key. Send it as
  `Authorization: Bearer <token>` or `X-LLM-Wiki-Token: <token>`.
- Issue scoped keys for clients/scrapers (`client` / `scraper` / `admin`); the
  scraper key may only call `POST /api/v1/ingest/items`.

## Scaling notes (vector search)

`chunks.embedding` is currently a dimension-agnostic `vector` column scanned
brute-force — fine for a home wiki. For large corpora, pin the embedding
dimension and add an HNSW index, e.g.:

```sql
ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(1536);
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
```

The vector layer is behind an abstraction (`pg-vector-store.ts` /
`pg-search-engine.ts`), so Qdrant / Typesense / managed AI Search backends can
be added without touching routes.
