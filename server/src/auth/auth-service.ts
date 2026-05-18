import { createHash } from "crypto"
import { SignJWT, jwtVerify } from "jose"
import bcrypt from "bcryptjs"
import { eq, and, gt } from "drizzle-orm"
import { getDb } from "../db/database"
import { users, sessions } from "../db/schema"
import type { User } from "../db/schema"
import { config } from "../config"
import { UnauthorizedError, ConflictError, BadRequestError } from "../shared/errors"

const SECRET = new TextEncoder().encode(config.jwtSecret)
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function sanitizeUser(user: User) {
  const { passwordHash: _, ...safe } = user
  return safe
}

export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<{ user: ReturnType<typeof sanitizeUser>; token: string }> {
  const db = getDb()

  if (!email || !password || !displayName) {
    throw new BadRequestError("email, password, and display_name are required")
  }

  const existing = db.select().from(users).where(eq(users.email, email.toLowerCase())).get()
  if (existing) throw new ConflictError("Email already registered", "EMAIL_TAKEN")

  const passwordHash = await bcrypt.hash(password, 10)
  const now = Date.now()

  // First registered user becomes admin
  const userCount = db.select().from(users).all().length
  const role = userCount === 0 ? "admin" : "user"

  const id = crypto.randomUUID()
  db.insert(users)
    .values({
      id,
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const user = db.select().from(users).where(eq(users.id, id)).get()!
  const token = await issueToken(user)
  return { user: sanitizeUser(user), token }
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: ReturnType<typeof sanitizeUser>; token: string }> {
  const db = getDb()

  const user = db.select().from(users).where(eq(users.email, email.toLowerCase())).get()
  if (!user) throw new UnauthorizedError("Invalid email or password")
  if (user.status === "suspended") throw new UnauthorizedError("Account suspended")

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new UnauthorizedError("Invalid email or password")

  const token = await issueToken(user)
  return { user: sanitizeUser(user), token }
}

async function issueToken(user: User): Promise<string> {
  const db = getDb()
  const expiresAt = Date.now() + TOKEN_TTL_MS
  const now = Date.now()

  const token = await new SignJWT({ sub: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(SECRET)

  db.insert(sessions)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      createdAt: now,
    })
    .run()

  return token
}

export async function logout(token: string): Promise<void> {
  const db = getDb()
  const h = hashToken(token)
  db.delete(sessions).where(eq(sessions.tokenHash, h)).run()
}

export async function verifyToken(token: string): Promise<User> {
  const db = getDb()

  let payload: { sub?: string }
  try {
    const result = await jwtVerify(token, SECRET)
    payload = result.payload as { sub?: string }
  } catch {
    throw new UnauthorizedError("Invalid or expired token")
  }

  if (!payload.sub) throw new UnauthorizedError("Invalid token payload")

  const now = Date.now()
  const session = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .get()

  if (!session) throw new UnauthorizedError("Session expired or revoked")

  const user = db.select().from(users).where(eq(users.id, payload.sub)).get()
  if (!user) throw new UnauthorizedError("User not found")
  if (user.status === "suspended") throw new UnauthorizedError("Account suspended")

  return user
}
