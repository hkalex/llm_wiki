import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
// Hex pattern: iv (32 hex chars) : authTag (32 hex chars) : ciphertext (any hex chars)
const ENCODED_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i

/** Returns true if the value looks like it was produced by encrypt(). */
export function isEncrypted(value: string): boolean {
  return ENCODED_PATTERN.test(value)
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`
}

export function decrypt(encoded: string, key: Buffer): string {
  // Plaintext fallback: if stored before encryption was enabled, return as-is
  if (!ENCODED_PATTERN.test(encoded)) return encoded

  const [ivHex, authTagHex, ciphertextHex] = encoded.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const ciphertext = Buffer.from(ciphertextHex, "hex")

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}
