# ── Stage 1: deps ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: build ────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# ── Stage 3: production ───────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]

# ── Stage 4: development ──────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app
ENV NODE_ENV=development
RUN npm install -g tsx
EXPOSE 3000
CMD ["tsx", "watch", "src/index.ts"]
