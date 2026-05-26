# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Wiki is a cross-platform desktop app (Tauri v2 + React 19) that automatically builds and maintains a personal knowledge base from user documents. Based on Andrej Karpathy's LLM Wiki pattern — an LLM incrementally builds a persistent wiki rather than re-deriving knowledge on every query (unlike traditional RAG).

## Commands

```bash
# Development
npm run dev              # Start Vite dev server (frontend only)
npm run tauri dev        # Start full Tauri app with hot reload

# Type checking and build
npm run typecheck        # TypeScript type check only
npm run build            # typecheck + Vite production build

# Testing
npm run test:mocks       # Unit tests (vitest, no real LLM calls)
npm run test:llm         # Integration tests with real LLM (requires .env.test.local)
npm run test             # Both test suites

# Rust (from src-tauri/)
cargo check              # Fast Rust type check
cargo build              # Debug build
```

Real LLM tests require a `.env.test.local` file with API keys (not committed).

## Architecture

**Stack:** Tauri v2 (Rust backend) + React 19 (TypeScript frontend) + Zustand state + shadcn/ui + Tailwind v4

### Rust Backend (`src-tauri/src/`)

- `lib.rs` — Tauri command registry and app setup hook (resource paths, proxy config)
- `commands/fs.rs` — File I/O and document extraction (PDF via pdfium-render, DOCX via docx-rs, PPTX/XLSX via calamine)
- `commands/search.rs` — CJK-aware tokenized search with graph expansion (2-hop BFS)
- `commands/vectorstore.rs` — LanceDB wrapper for vector upsert/search/delete
- `commands/file_sync.rs` — Source folder auto-watch (notify crate), rescan logic
- `commands/extract_images.rs` — Image extraction from PDFs/Office formats, base64 encoded
- `commands/claude_cli.rs` / `codex_cli.rs` — Spawn/kill Claude or Codex CLI subprocesses with streamed stdout
- `api_server.rs` — Local HTTP API at `127.0.0.1:19828` (token-protected): `/health`, `/projects`, `/files`, `/search`, `/graph`, `/sources/rescan`
- `clip_server.rs` — Local HTTP at `127.0.0.1:19827` for Chrome extension to submit web clips

### Frontend (`src/`)

**State (Zustand stores in `src/stores/`):**
- `wiki-store.ts` — Active project, file tree, selected file, view mode
- `chat-store.ts` — Conversations, messages, per-conversation source references
- `activity-store.ts` — Ingest queue (pending/processing/failed tasks with cancel/retry)
- `review-store.ts` — Human-in-the-loop items flagged by LLM (Create Page, Deep Research, Skip)
- `update-store.ts` / `research-store.ts` / `file-sync-store.ts` — Release checks, deep research progress, watcher state

**Core library (`src/lib/`):**
- `ingest.ts` — Orchestrates the 2-step LLM ingest pipeline (Analysis → Generation)
- `dedup-queue.ts` — Disk-backed persistent task queue with crash recovery; deduplicates by SHA256 hash
- `search-rrf.ts` — Reciprocal rank fusion combining keyword + vector search results, 4-signal graph expansion
- `context-budget.ts` — Token accounting across wiki pages, chat history, and system prompt
- `project-store.ts` — Persists LLM config, search API keys, embedding config, language preference
- `persist.ts` — Chat history and review item serialization to disk
- `web-search.ts` — Tavily / SerpApi / SearXNG client abstraction
- `deep-research.ts` — Research topic optimization and search query generation
- `clip-watcher.ts` — Polls for new web clips from browser extension and triggers ingest
- `enrich-wikilinks.ts` — Auto-links wikilinks and builds cross-reference graph

### Ingest Pipeline (2-step chain-of-thought)

1. User imports source (PDF, DOCX, Markdown, web clip, etc.)
2. Tauri `fs.rs` extracts text content
3. Frontend enqueues task in `dedup-queue` (SHA256 for incremental cache)
4. **Step 1 - Analysis:** LLM call; structured analysis stored in temp file
5. **Step 2 - Generation:** LLM call with analysis; produces wiki pages (YAML frontmatter + Markdown)
6. If vector search enabled: new pages sent to `vector_upsert` (LanceDB via Rust)
7. Activity panel shows real-time progress

### Query Pipeline (Chat)

1. Tokenized search (CJK-aware) + optional vector search (LanceDB)
2. 4-signal graph expansion (2-hop BFS): direct links, source overlap, Adamic-Adar, type affinity
3. Reciprocal rank fusion across signals
4. Token budget allocation (`context-budget.ts`)
5. Numbered context pages sent to LLM; user can cite [1], [2], etc.

### Wiki Storage Structure (per project)

```
my-wiki/
├─ purpose.md           # Goals, scope, research thesis
├─ schema.md            # Page types and structure rules
├─ raw/sources/         # Immutable original documents
├─ raw/assets/          # Extracted images
├─ wiki/                # Generated knowledge base
│  ├─ index.md          # Catalog
│  ├─ log.md            # Operation history
│  ├─ overview.md       # Auto-updated global summary
│  └─ entities/, concepts/, sources/, queries/, synthesis/, comparisons/
├─ .obsidian/           # Auto-generated (Obsidian vault compatible)
└─ .llm-wiki/           # App config, chats, review items, vector store
```

### Browser Extension (`extension/`)

Manifest V3 Chrome extension. Uses Readability.js for article extraction and Turndown.js for HTML→Markdown conversion. Submits clips to `clip_server` at port 19827.

## Key Design Decisions

- **No traditional RAG** — the wiki is the retrieval artifact; LLM builds it incrementally rather than chunking raw docs
- **Louvain community detection** — auto-discovers knowledge clusters in the graph (sigma.js + graphology)
- **Multimodal ingest** — images extracted from PDFs get vision-LLM captions and become first-class wiki pages
- **Crash-resilient queue** — `dedup-queue.ts` writes to disk; incomplete tasks resume on restart
- **LLM provider abstraction** — streaming fetch adapters for OpenAI, Anthropic, Google, Ollama, custom endpoints; configured per-project

## TypeScript Config

Strict mode enabled: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Target ES2020 with `bundler` module resolution.
