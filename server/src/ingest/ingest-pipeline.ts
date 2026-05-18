import fs from "fs"
import path from "path"
import { getSourceText } from "../sources/source-text"

export interface LlmSettings {
  provider: string
  apiKey: string
  model: string
  baseUrl?: string  // custom endpoint or ollama base URL
}

// ── FILE block parser (ported from src/lib/ingest.ts) ────────────────────

interface ParsedFileBlock {
  path: string
  content: string
}

const OPENER_LINE = /^---\s*FILE:\s*(.+?)\s*---\s*$/i
const CLOSER_LINE = /^---\s*END\s+FILE\s*---\s*$/i
const FENCE_LINE = /^\s{0,3}(```+|~~~+)/

function parseFileBlocks(text: string): { blocks: ParsedFileBlock[]; warnings: string[] } {
  const normalized = text.replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")
  const blocks: ParsedFileBlock[] = []
  const warnings: string[] = []

  let i = 0
  while (i < lines.length) {
    const openerMatch = OPENER_LINE.exec(lines[i])
    if (!openerMatch) { i++; continue }
    const filePath = openerMatch[1].trim()
    i++

    const contentLines: string[] = []
    let fenceMarker: string | null = null
    let fenceLen = 0
    let closed = false

    while (i < lines.length) {
      const line = lines[i]
      const fenceMatch = FENCE_LINE.exec(line)
      if (fenceMatch) {
        const run = fenceMatch[1]
        const char = run[0]
        const len = run.length
        if (fenceMarker === null) { fenceMarker = char; fenceLen = len }
        else if (char === fenceMarker && len >= fenceLen) { fenceMarker = null; fenceLen = 0 }
        contentLines.push(line)
        i++
        continue
      }
      if (fenceMarker === null && CLOSER_LINE.test(line)) { closed = true; i++; break }
      contentLines.push(line)
      i++
    }

    if (!closed) {
      warnings.push(`FILE block "${filePath || "(unnamed)"}" was not closed — likely truncation, block dropped`)
      continue
    }
    if (!filePath) {
      warnings.push("FILE block with empty path skipped")
      continue
    }
    if (!isSafePath(filePath)) {
      warnings.push(`FILE block path rejected (must be under wiki/ with no ..): ${filePath}`)
      continue
    }
    blocks.push({ path: filePath, content: contentLines.join("\n") })
  }

  return { blocks, warnings }
}

function isSafePath(p: string): boolean {
  const normalized = p.replace(/\\/g, "/")
  if (!normalized.startsWith("wiki/")) return false
  return !normalized.split("/").some((seg) => seg === "..")
}

// ── Prompt builders (ported from src/lib/ingest.ts) ──────────────────────

function buildAnalysisPrompt(purpose: string, index: string): string {
  return [
    "You are an expert research analyst. Read the source document and produce a structured analysis.",
    "Do not output chain-of-thought, hidden reasoning, or a thinking transcript. Reason internally and write only the concise final analysis.",
    "",
    "Your analysis should cover:",
    "",
    "## Key Entities",
    "List people, organizations, products, datasets, tools mentioned. For each: name/type, role, whether it likely already exists in the wiki.",
    "",
    "## Key Concepts",
    "List theories, methods, techniques, phenomena. For each: name, brief definition, why it matters, whether it likely exists in the wiki.",
    "",
    "## Main Arguments & Findings",
    "- What are the core claims or results?",
    "- What evidence supports them?",
    "",
    "## Connections to Existing Wiki",
    "- What existing pages does this source relate to?",
    "- Does it strengthen, challenge, or extend existing knowledge?",
    "",
    "## Contradictions & Tensions",
    "- Does anything conflict with existing wiki content?",
    "",
    "## Recommendations",
    "- What wiki pages should be created or updated?",
    "- Any open questions worth flagging?",
    "",
    "Be thorough but concise. Focus on what's genuinely important.",
    "",
    purpose ? `## Wiki Purpose (for context)\n${purpose}` : "",
    index ? `## Current Wiki Index (for checking existing content)\n${index}` : "",
  ].filter(Boolean).join("\n")
}

function buildGenerationPrompt(
  schema: string,
  purpose: string,
  index: string,
  sourceFileName: string,
  overview: string,
): string {
  const sourceBaseName = sourceFileName.replace(/\.[^.]+$/, "")
  return [
    "You are a wiki maintainer. Based on the analysis provided, generate wiki files.",
    "Do not output chain-of-thought, hidden reasoning, or explanatory preamble. Output only the requested FILE blocks.",
    "",
    `## IMPORTANT: Source File`,
    `The original source file is: **${sourceFileName}**`,
    `All wiki pages MUST include this filename in their frontmatter \`sources\` field.`,
    "",
    "## What to generate",
    "",
    `1. A source summary page at **wiki/sources/${sourceBaseName}.md** (MUST use this exact path)`,
    "2. Entity pages in wiki/entities/ for key entities",
    "3. Concept pages in wiki/concepts/ for key concepts",
    "4. An updated wiki/index.md — add new entries, preserve all existing entries",
    "5. A log entry for wiki/log.md (format: ## [YYYY-MM-DD] ingest | Title)",
    "6. An updated wiki/overview.md — comprehensive 2-5 paragraph overview of ALL wiki topics",
    "",
    "## Frontmatter Rules (CRITICAL)",
    "",
    "Every page begins with YAML frontmatter:",
    "1. First line MUST be exactly `---`",
    "2. End with `---` on its own line",
    `3. Required fields: type, title, created, updated, tags (array), related (array of slugs), sources (MUST include "${sourceFileName}")`,
    "4. Use inline YAML arrays: `tags: [foo, bar]`",
    "5. No [[wikilinks]] in frontmatter — body only",
    "",
    "## Output format",
    "",
    "Output file blocks using EXACTLY this format:",
    "---FILE: wiki/path/to/page.md---",
    "(file content here)",
    "---END FILE---",
    "",
    "Your response MUST begin with `---FILE:` as the very first characters. No preamble.",
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    overview ? `## Wiki Overview (current state)\n${overview}` : "",
    index ? `## Current Wiki Index\n${index}` : "",
    schema ? `## Wiki Schema\n${schema}` : "",
  ].filter(Boolean).join("\n")
}

// ── LLM streaming ─────────────────────────────────────────────────────────

type ChatMessage = { role: string; content: string }

async function streamOpenAI(
  settings: LlmSettings,
  messages: ChatMessage[],
  onToken: (t: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const baseUrl = (settings.baseUrl ?? "https://api.openai.com").replace(/\/$/, "")
  const url = `${baseUrl}/v1/chat/completions`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      stream: true,
      temperature: 0.1,
      max_tokens: 8192,
    }),
    signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`LLM API error HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data: ")) continue
        const data = trimmed.slice(6)
        if (data === "[DONE]") continue
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
          const content = parsed.choices?.[0]?.delta?.content
          if (content) onToken(content)
        } catch {
          // ignore parse errors on individual SSE frames
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function streamAnthropic(
  settings: LlmSettings,
  messages: ChatMessage[],
  onToken: (t: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const baseUrl = (settings.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "")
  const url = `${baseUrl}/v1/messages`

  const systemMsg = messages.find((m) => m.role === "system")
  const convMessages = messages.filter((m) => m.role !== "system")

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": settings.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.model,
      system: systemMsg?.content ?? "",
      messages: convMessages,
      stream: true,
      temperature: 0.1,
      max_tokens: 8192,
    }),
    signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Anthropic API error HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data: ")) continue
        try {
          const parsed = JSON.parse(trimmed.slice(6)) as {
            type: string
            delta?: { type: string; text?: string }
          }
          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
            onToken(parsed.delta.text ?? "")
          }
        } catch {
          // ignore
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function streamLlm(
  settings: LlmSettings,
  messages: ChatMessage[],
  onToken: (t: string) => void,
  signal: AbortSignal,
): Promise<void> {
  if (settings.provider === "anthropic") {
    return streamAnthropic(settings, messages, onToken, signal)
  }
  return streamOpenAI(settings, messages, onToken, signal)
}

// ── Filesystem helpers ────────────────────────────────────────────────────

function readFileSafe(filePath: string): string {
  try { return fs.readFileSync(filePath, "utf-8") } catch { return "" }
}

// ── Main pipeline ─────────────────────────────────────────────────────────

/**
 * Run the two-step LLM ingest pipeline server-side.
 * sourcePath is relative to raw/sources/ (e.g. "doc.pdf" or "subdir/doc.pdf").
 * Returns paths of wiki files written (relative to storagePath).
 */
export async function runIngestPipeline(
  storagePath: string,
  sourcePath: string,
  llmSettings: LlmSettings,
  onProgress: (detail: string) => void,
  signal: AbortSignal,
): Promise<string[]> {
  const sourceFileName = path.basename(sourcePath)

  onProgress("Reading source...")
  const sourceText = await getSourceText(storagePath, sourcePath)
  if (!sourceText.trim()) {
    throw new Error("Source produced no text — binary format may not be supported in server mode")
  }

  const truncatedContent = sourceText.length > 50000
    ? sourceText.slice(0, 50000) + "\n\n[...truncated...]"
    : sourceText

  const schema = readFileSafe(path.join(storagePath, "schema.md"))
  const purpose = readFileSafe(path.join(storagePath, "purpose.md"))
  const index = readFileSafe(path.join(storagePath, "wiki", "index.md"))
  const overview = readFileSafe(path.join(storagePath, "wiki", "overview.md"))

  // ── Step 1: Analysis ──────────────────────────────────────────────────
  onProgress("Step 1/2: Analyzing source...")
  let analysis = ""

  await streamLlm(
    llmSettings,
    [
      { role: "system", content: buildAnalysisPrompt(purpose, index) },
      {
        role: "user",
        content: `Analyze this source document:\n\n**File:** ${sourceFileName}\n\n---\n\n${truncatedContent}`,
      },
    ],
    (token) => { analysis += token },
    signal,
  )

  if (signal.aborted) return []
  if (!analysis.trim()) throw new Error("Analysis step produced no output — check LLM settings")

  // ── Step 2: Generation ────────────────────────────────────────────────
  onProgress("Step 2/2: Generating wiki pages...")
  let generation = ""

  await streamLlm(
    llmSettings,
    [
      { role: "system", content: buildGenerationPrompt(schema, purpose, index, sourceFileName, overview) },
      {
        role: "user",
        content: [
          `Source document to process: **${sourceFileName}**`,
          "",
          "## Stage 1 Analysis (context only — do not repeat)",
          "",
          analysis,
          "",
          "## Original Source Content",
          "",
          truncatedContent,
          "",
          "---",
          "",
          `Now emit the FILE blocks for the wiki files derived from **${sourceFileName}**.`,
          "Your response MUST begin with `---FILE:` as the very first characters.",
          "No preamble. No analysis prose. Start immediately.",
        ].join("\n"),
      },
    ],
    (token) => { generation += token },
    signal,
  )

  if (signal.aborted) return []

  // ── Step 3: Parse and write ───────────────────────────────────────────
  onProgress("Writing files...")
  const { blocks, warnings } = parseFileBlocks(generation)

  for (const w of warnings) console.warn("[ingest-server]", w)

  const wikiDir = path.join(storagePath, "wiki")
  const writtenPaths: string[] = []

  for (const block of blocks) {
    const fullPath = path.resolve(storagePath, block.path)
    // Guard: must remain inside wiki/
    if (!fullPath.startsWith(wikiDir + path.sep)) {
      console.warn("[ingest-server] Rejected unsafe path:", block.path)
      continue
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, block.content, "utf-8")
    writtenPaths.push(block.path)
  }

  // Ensure source summary page exists
  const sourceBaseName = sourceFileName.replace(/\.[^.]+$/, "")
  const sourceSummaryRelPath = `wiki/sources/${sourceBaseName}.md`
  const hasSourceSummary = writtenPaths.some((p) => p.startsWith("wiki/sources/"))

  if (!hasSourceSummary && !signal.aborted) {
    const date = new Date().toISOString().slice(0, 10)
    const fallback = [
      "---",
      `type: source`,
      `title: "Source: ${sourceFileName}"`,
      `created: ${date}`,
      `updated: ${date}`,
      `sources: ["${sourceFileName}"]`,
      `tags: []`,
      `related: []`,
      "---",
      "",
      `# Source: ${sourceFileName}`,
      "",
      analysis ? analysis.slice(0, 3000) : "(Analysis not available)",
      "",
    ].join("\n")

    const fallbackPath = path.join(storagePath, sourceSummaryRelPath)
    fs.mkdirSync(path.dirname(fallbackPath), { recursive: true })
    fs.writeFileSync(fallbackPath, fallback, "utf-8")
    writtenPaths.push(sourceSummaryRelPath)
  }

  return writtenPaths
}
