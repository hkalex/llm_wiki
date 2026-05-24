# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Guideline

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.





## What this is

A cross-platform Tauri 2 desktop app (Rust backend + React 19 / TypeScript frontend) that turns user documents into an interlinked Markdown wiki via a two-step LLM ingest pipeline. The project is an implementation of [Karpathy's LLM Wiki pattern](llm-wiki.md); the central design rule is **LLM-centric, not CRUD-centric** — async streaming, persistent queues, and crash-recovery matter more than typical CRUD concerns.

There is a much more detailed agent guide in [AGENTS.md](AGENTS.md) — read it for the full picture of the ingest pipeline, search pipeline, graph relevance model, and store/component map. This file only covers the essentials and the things that surprised me when first navigating the repo.

## Commands

The scripts that actually exist (see [package.json](package.json)):

```bash
# Frontend-only dev server (Vite on port 1420 — no desktop window)
npm run dev

# Full desktop app in watch mode (spawns Vite via tauri.conf.json's beforeDevCommand)
npm run tauri dev

# Web bundle only: typecheck + vite build → dist/
npm run build

# Full desktop production build → src-tauri/target/release/bundle/
npm run tauri build

# Tests — `test` runs mocks then live-LLM tests sequentially
npm run test
npm run test:mocks    # vitest, excludes *.real-llm.test.ts
npm run test:llm      # vitest, only real-llm files, no parallelism

# Single test file / pattern
npx vitest run path/to/file.test.ts
npx vitest run -t "test name"

# Standalone typecheck (no build)
npm run typecheck
```

There is **no lint or format script** — don't invoke `npm run lint`/`npm run format` (AGENTS.md mentions them but they aren't wired up). TypeScript strict mode via `npm run typecheck` is the only static check.

`npm run tauri build` runs `npm run build` first (per `beforeBuildCommand` in [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)); you rarely need to run them both manually.

## Architecture (the parts that aren't obvious from the tree)

### Frontend ↔ Backend boundary
- Every Rust capability is exposed as a `#[tauri::command]` and registered in [src-tauri/src/lib.rs](src-tauri/src/lib.rs). The TypeScript side wraps these as `invoke<T>("snake_or_camel_name", args)` in [src/commands/fs.ts](src/commands/fs.ts) — that file is the catalog of every IPC call. When adding a command, update *both* sides plus `lib.rs`'s `.invoke_handler()`.
- Rust commands are wrapped by [src-tauri/src/panic_guard.rs](src-tauri/src/panic_guard.rs) which converts panics to JSON errors — don't `unwrap()` casually, but a panic won't crash the app.

### State (Zustand)
- Stores live in [src/stores/](src/stores/) (`wiki-store`, `chat-store`, `activity-store`, `review-store`, `update-store`). [src/App.tsx](src/App.tsx) wires subscriptions on mount and is where persisted state is loaded from `.llm-wiki/` on disk.
- Auto-save is via subscription: changing a store generally writes to disk asynchronously. Don't add manual save calls without checking the existing subscription pattern.

### Two-step ingest is the core workflow
[src/lib/ingest.ts](src/lib/ingest.ts) drives:
1. **Analysis** — LLM reads source → structured analysis (entities, concepts, contradictions).
2. **Generation** — LLM consumes analysis → produces wiki pages, index/log/overview updates, review items.

Supporting machinery you'll touch when changing ingest behavior:
- [src/lib/dedup.ts](src/lib/dedup.ts), [src/lib/dedup-queue.ts](src/lib/dedup-queue.ts) — SHA256 cache, skips unchanged files.
- [src/lib/ingest-queue.ts](src/lib/ingest-queue.ts) — persistent queue (disk-backed, retries up to 3, survives restart).
- [src/stores/activity-store.ts](src/stores/activity-store.ts) — real-time UI for queue state.

Cascade cleanup: deleting a source removes derived wiki pages, prunes `sources[]` from shared entity pages, and strips dead `[[wikilinks]]`. If you touch deletion, preserve all three behaviors.

### Search / retrieval
[src/lib/search.ts](src/lib/search.ts) runs a 4-phase pipeline: tokenized (with CJK bigrams) → optional vector via LanceDB ([src/lib/embedding.ts](src/lib/embedding.ts), backed by [src-tauri/src/commands/vectorstore.rs](src-tauri/src/commands/vectorstore.rs)) → graph expansion using the 4-signal relevance model in [src/lib/graph-relevance.ts](src/lib/graph-relevance.ts) → budget-controlled context assembly (60/20/5/15 split for wiki/chat/index/system).

### LLM providers
Per-provider clients in [src/lib/](src/lib/) (`llm-client.ts`, `llm-providers.ts`, plus `claude-cli-transport.ts`, `codex-cli-transport.ts`). Streaming is fetch-based with SSE/JSON-lines parsing — when adding a provider, replicate the streaming-callback shape the rest of the app expects.

### Multi-format extraction is in Rust
PDF (pdfium-render), DOCX (docx-rs), PPTX (ZIP+XML), XLSX/ODS (calamine), and image extraction all live in [src-tauri/src/commands/file_sync.rs](src-tauri/src/commands/file_sync.rs) and [extract_images.rs](src-tauri/src/commands/extract_images.rs). Don't try to re-parse these formats in TypeScript.

### Chrome extension talks via local HTTP
[src-tauri/src/clip_server.rs](src-tauri/src/clip_server.rs) runs tiny_http on port **19827**. The [extension/](extension/) directory is a Manifest V3 Chrome extension that POSTs clipped pages to that port; [src/lib/clip-watcher.ts](src/lib/clip-watcher.ts) polls every 3s and triggers ingest.

## Test file conventions

Vitest distinguishes four flavors by filename suffix:
- `*.test.ts` — fast unit tests with mocked LLM responses.
- `*.real-llm.test.ts` — calls live LLM APIs; requires env vars (e.g. `OPENAI_API_KEY`). Excluded from `test:mocks`, run serially in `test:llm`.
- `*.scenarios.test.ts` — multi-step workflow tests (ingest → query → verify).
- `*.property.test.ts` — fast-check property-based invariants.

When adding tests, follow these suffixes so they get bucketed correctly.

## Non-obvious gotchas

- **Path normalization** — `normalizePath()` (forward slashes) is used in 22+ files for Windows compatibility. Don't compare raw Windows paths.
- **Unicode-safe slicing** — string operations on filenames use char indexes, not byte indexes, to survive CJK names. Don't reach for `slice(0, n)` on byte buffers.
- **Auto-embedding** — when vector search is enabled in settings, every ingest enqueues an embedding write. Disable in tests or expect LanceDB writes.
- **Source frontmatter is load-bearing** — every wiki page has `sources: []` in YAML frontmatter; cascade cleanup and graph source-overlap both depend on it. Don't strip frontmatter when transforming pages.
- **Tauri command names are inconsistent** — some are camelCase, some snake_case; check [src/commands/fs.ts](src/commands/fs.ts) before guessing.
- **`npm run dev` ≠ desktop app** — bare `npm run dev` only starts Vite. Use `npm run tauri dev` if you need the Rust side running.

## When to escalate to plan mode

For changes that touch the ingest pipeline, search pipeline, store schemas, graph relevance model, or add a new LLM/search provider — these tend to require coordinated edits across Rust + TS + a store, and a plan up front avoids painful rework. Small bug fixes and UI tweaks don't need plan mode.
