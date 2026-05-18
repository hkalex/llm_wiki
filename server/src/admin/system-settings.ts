import fs from "fs"
import path from "path"
import { config } from "../config"

const SYSTEM_SETTINGS_PATH = path.resolve(process.cwd(), "data", "system-settings.json")

export interface SystemSettingsOverrides {
  registrationOpen?: boolean
  ingestRateLimitPerHour?: number
  storageQuotaMb?: number
}

let overrides: SystemSettingsOverrides = {}

function load() {
  try {
    if (fs.existsSync(SYSTEM_SETTINGS_PATH)) {
      overrides = JSON.parse(fs.readFileSync(SYSTEM_SETTINGS_PATH, "utf-8")) as SystemSettingsOverrides
    }
  } catch {
    overrides = {}
  }
}

load()

export function getSystemSettings() {
  return {
    defaultLlmProvider: config.defaultLlmProvider,
    defaultLlmModel: config.defaultLlmModel,
    defaultLlmApiKeyConfigured: !!config.defaultLlmApiKey,
    ingestRateLimitPerHour: overrides.ingestRateLimitPerHour ?? config.ingestRateLimitPerHour,
    storageQuotaMb: overrides.storageQuotaMb ?? Math.round(config.storageQuotaBytes / (1024 * 1024)),
    registrationOpen: overrides.registrationOpen ?? true,
  }
}

export function patchSystemSettings(updates: SystemSettingsOverrides) {
  if (updates.registrationOpen !== undefined) overrides.registrationOpen = updates.registrationOpen
  if (updates.ingestRateLimitPerHour !== undefined) overrides.ingestRateLimitPerHour = updates.ingestRateLimitPerHour
  if (updates.storageQuotaMb !== undefined) overrides.storageQuotaMb = updates.storageQuotaMb

  fs.mkdirSync(path.dirname(SYSTEM_SETTINGS_PATH), { recursive: true })
  fs.writeFileSync(SYSTEM_SETTINGS_PATH, JSON.stringify(overrides, null, 2))
  return getSystemSettings()
}
