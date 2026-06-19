// esbuild bundle for the server. Code-splitting keeps the lazily-imported
// Tauri CLI transports (claude/codex) in separate chunks that the server never
// loads for HTTP providers, so @tauri-apps stays out of the Node load path.
// The "@" alias resolves core imports (@/lib/*) to the repo-root src/.
import { build } from "esbuild"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  splitting: true,
  outdir: "dist",
  alias: { "@": path.resolve(dir, "../../src") },
  logLevel: "info",
})
