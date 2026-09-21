import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "./db/client";

export const SESSION_COOKIE = "fk_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.insert(schema.sessions).values({
    id: hash(token),
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, hash(token)), gt(schema.sessions.expiresAt, Date.now())))
    .limit(1);
  return rows[0]?.user ?? null;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await db.delete(schema.sessions).where(eq(schema.sessions.id, hash(token)));
}

// ── SIWE nonces (single-process, 10 min TTL) ────────────────────────────────

const nonces = new Map<string, number>();

export function issueNonce() {
  const nonce = randomBytes(16).toString("hex");
  nonces.set(nonce, Date.now() + 10 * 60 * 1000);
  return nonce;
}

export function consumeNonce(nonce: string) {
  const exp = nonces.get(nonce);
  nonces.delete(nonce);
  return !!exp && exp > Date.now();
}

setInterval(() => {
  const now = Date.now();
  for (const [n, exp] of nonces) if (exp <= now) nonces.delete(n);
}, 60_000).unref();
