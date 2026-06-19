# Client migration guide (thin web/PWA + Tauri thin client)

The server (`apps/server`) and the client data layer (`src/services`) are done.
What remains is rewiring the React UI to consume the server instead of running
compute locally. This work **must be done against a runnable `vite` build**
(Node ≥ 20.19 / 22) so each step is verified in the browser — doing it blind
risks regressing the working desktop app. Each step is gated by `isWebTarget()`
(`src/services`) so the desktop (`tauri`) path is untouched until ready.

Build the web target with: `CLIENT_TARGET=web npm run build` (or `dev`).

## 1. Web boot + project selection
- In `src/main.tsx` / `src/App.tsx`, when `isWebTarget()`: wrap the app in
  `ConnectionGate` (`src/components/auth/connection-gate.tsx`), then load
  projects via `getDataService().listProjects()` and set the active project in
  `useWikiStore` (so `project.id` is the server UUID — required by chat/search).
- Skip the desktop boot path (open-last-project-from-disk) in web mode.

## 2. Views → DataService (gate each with `isWebTarget()`)
Rewire these call sites to call `getDataService()` in web mode, keeping the
existing local path in the `else` branch:
- File tree / content: `src/commands/fs.ts` callers → `listFiles` / `readFile`.
- Search view (`src/components/search/`) → `dataService.search`.
- Reviews (`src/stores/review-store`, review view) → `listReviews` + a resolve
  endpoint (add `POST /projects/:id/reviews/:rid/resolve` server-side).
- Graph view (`src/components/graph/`) → `GET /projects/:id/graph`.
- Settings (`src/components/settings/sections/*`) → `getConfig`/`putConfig`;
  render secret fields masked (server returns presence flags).

## 3. Chat → server SSE (the marquee change)
In `src/components/chat/chat-panel.tsx` `handleSend`, add at the top:
```ts
if (isWebTarget()) { await handleSendViaServer(text, images); return }
```
`handleSendViaServer`: `addMessage("user", …)`, `setStreaming(true)`, then
`getDataService().streamChat(projectId, { text, history }, onEvent, signal)`:
- `token` → `appendStreamToken`; accumulate
- `reasoning` → wrap as `<think>` and `appendStreamToken`
- `refs` → collect references
- `done` → `finalizeStream(accumulated, references)`; `setStreaming(false)`
- `error` → `finalizeStream(message)`; `setStreaming(false)`
Delete nothing from the local path; the server already does the RAG + provider
streaming (it reuses the same core `streamChat`).

## 4. Responsive (Phase 5)
- `src/components/layout/app-layout.tsx`: below `md`, replace the mouse-drag
  3-column layout with a single column + `Sheet` drawers + bottom nav (touch has
  no `col-resize`).
- `graph/graph-view.tsx` (sigma/WebGL) and `editor/wiki-editor.tsx` (Milkdown):
  add touch/read-only fallbacks on phones (highest-effort items).

## 5. PWA offline (Phase 5)
- Add `vite-plugin-pwa` (verify Vite 8 compatibility first), enabled only for
  `CLIENT_TARGET=web`. NetworkFirst for `/api/v1/*`; never cache POST/SSE;
  precache the app shell. The manifest already exists (`public/`).

## 6. Tauri thin client (Phase 6)
- Strip the compute commands from `src-tauri/src/lib.rs` (vectorstore, search,
  file_sync, extract_images, claude/codex cli, api_server, clip_server, proxy);
  drop `src-tauri/pdfium/`. Keep optional native niceties (dialog/opener/tray).
- Point the webview at a configurable server URL (reuse `ConnectionGate`); build
  with `CLIENT_TARGET=web` but packaged as the desktop shell. Slim desktop CI.

## 7. Web clipper extension (Phase 6)
- `extension/popup.js` + `manifest.json`: replace the hardcoded
  `http://127.0.0.1:19827` with a configurable server URL + token (options page
  in `chrome.storage`). Map: `/status`→`GET /api/v1/health`,
  `/projects`→`GET /api/v1/projects`, clip→`POST /api/v1/ingest/items` with a
  single item (`folderContext: "clips"`) using a scraper/client token.

## 8. Serve the web build from the server
- `CLIENT_TARGET=web npm run build` → copy `dist/` into the server image; set
  `WEB_DIR=/app/web`. The server already serves it (SPA fallback) — single
  origin, clean CORS + SSE. Update `deploy/server.Dockerfile` to build+copy the
  web bundle, and `docker-compose.yml` as needed.
