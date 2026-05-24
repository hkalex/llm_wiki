# Known Issues

Issues identified during the Phase 6 code review that are not yet fixed.
Critical and High issues from that review have already been addressed.

---

## Medium

### M1 — `@fastify/rate-limit` installed but unused

**File:** `server/package.json`

`@fastify/rate-limit` was added as a dependency during Phase 6 but the actual rate
limiting uses a hand-rolled in-process sliding window instead. The package is dead weight
in the production Docker image: it increases install time, image size, and the attack
surface (an unused package that receives CVEs still needs patching).

**Fix:** Remove `@fastify/rate-limit` from `dependencies` in `package.json` and run
`npm install` to update the lock file. No source changes needed — the hand-rolled
implementation in `ingest-routes.ts` is the one that runs.

---

### M2 — `rateLimitStore` Map grows unboundedly

**File:** `server/src/ingest/ingest-routes.ts`

The module-level `rateLimitStore: Map<string, number[]>` is never pruned. Old timestamps
are filtered on each read (sliding window), but the Map entry itself is never deleted.
Over time this accumulates one entry per user who has ever called the ingest endpoint,
even if their timestamp array is now empty. Practically harmless (a few KB per user),
but it is a resource leak.

**Fix:** After filtering timestamps, delete the Map entry when the array is empty:

```typescript
if (timestamps.length === 0) {
  rateLimitStore.delete(userId)
} else {
  rateLimitStore.set(userId, timestamps)
}
```

---

### M3 — `getUserStorageBytes` is O(all files) on every upload

**File:** `server/src/sources/source-service.ts`

The quota check calls `getUserStorageBytes`, which does a synchronous recursive
`readdirSync`/`statSync` walk over every source file across all of the user's projects.
For a self-hosted single-user server this is fine. In a multi-user deployment with
thousands of files it becomes a blocking pause in the Node event loop on every upload.

**Fix:** Maintain a running storage total in the database (updated on upload and delete)
and query that instead of walking the filesystem on every request.

---

## Low

### L1 — Dev Dockerfile stage is fragile

**File:** `server/docker/Dockerfile`

The `development` stage installs `tsx` globally but has no `COPY` or `RUN npm ci` for
project dependencies. It works in practice only because `docker-compose.dev.yml` mounts
the host source tree at `/app` (which shadows the image contents). If someone tries to
run the dev stage without the volume mount, it will fail with missing modules.

**Fix:** Add `COPY package.json package-lock.json ./` and `RUN npm ci` to the
`development` stage so it is self-contained:

```dockerfile
FROM node:20-alpine AS development
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
RUN npm install -g tsx
COPY src ./src
EXPOSE 3000
CMD ["tsx", "watch", "src/index.ts"]
```

Note: the compose volume mount still overrides `src/` at runtime, so hot-reload
continues to work — but the stage is no longer broken without the mount.
