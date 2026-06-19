# LLM Wiki server image. Build context = repo root (the server bundles the
# reused core from ../../src). Multi-stage: build with esbuild, run slim.
#
#   docker build -f deploy/server.Dockerfile -t llm-wiki-server .

FROM node:22-slim AS builder
WORKDIR /repo
# Install server deps first (cached unless package files change).
COPY apps/server/package.json apps/server/package-lock.json* ./apps/server/
RUN cd apps/server && npm ci
# Bring in the reused core (src/lib/*) and the server source, then bundle.
COPY src ./src
COPY apps/server ./apps/server
RUN cd apps/server && npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY apps/server/package.json apps/server/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /repo/apps/server/dist ./dist
EXPOSE 8080
# dist/index.js runs migrations on boot, then listens.
CMD ["node", "dist/index.js"]
