import { config } from "../config"

type Level = "debug" | "info" | "warn" | "error"

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...meta,
  })
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n")
  } else {
    process.stdout.write(line + "\n")
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (config.nodeEnv === "development") log("debug", msg, meta)
  },
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
}
