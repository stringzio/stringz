/** Admin dashboard API (read-only monitoring).
 *
 *  Separate from app auth: one operator email (env ADMIN_EMAIL) + password
 *  (env ADMIN_PASSWORD; Secret Manager in prod, never committed). Credentials
 *  are compared as sha256 digests with timingSafeEqual so neither length nor
 *  prefix leaks. Sessions are in-memory (sha256(token) -> expiry): a restart
 *  logs the operator out, acceptable for a monitoring surface, and there is
 *  nothing to clean up. Login is rate-limited (single API instance today;
 *  the window lives in process memory, which the 10-attempt budget makes a
 *  non-issue for an ops login).
 *
 *  All /admin/api responses are read-only aggregates; the only mutations are
 *  login/logout. Cache-Control: no-store everywhere so dashboards and shared
 *  proxies never cache operator data.
 */
import { Hono } from "hono";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sql } from "drizzle-orm";
import { db } from "./db/client";

const ADMIN_COOKIE = "stringz_admin";
const SESSION_TTL_MS = 12 * 3600_000;
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 5 * 60_000;

const adminEmail = () => (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const adminPassword = () => process.env.ADMIN_PASSWORD ?? "";
const adminConfigured = () => adminEmail() !== "" && adminPassword() !== "";

/** Sessions: sha256(cookie token) -> expiry (epoch ms). */
const sessions = new Map<string, number>();
/** Sliding window of login attempts (rate limit). */
const loginAttempts: number[] = [];

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

function isAuthed(cookieHeader: string | undefined): boolean {
  const token = cookieHeader ?? "";
  if (!token) return false;
  const key = sha256(token);
  const expiresAt = sessions.get(key);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    sessions.delete(key);
    return false;
  }
  return true;
}

/** SQLSTATE of the original pg error through drizzle's DrizzleQueryError
 *  wrapper chain (same helper pattern as entitlements.ts). */
const pgErrorCode = (err: unknown): string | undefined => {
  let cur = err;
  while (cur && typeof cur === "object") {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
};

/** List-price MRR weights (USD cents), mirroring stringz-pay
 *  src/config/plans.ts. Note: stringz-pay may be charging temporary test
 *  prices - this card always estimates at list price. */
const MRR_CENTS: Record<string, number> = {
  pro_monthly: 1900,
  pro_annual: Math.round(19000 / 12),
  team_monthly: 7900,
  team_annual: Math.round(79000 / 12),
};

/** First row / all rows of a raw query (drizzle's execute resolves to the pg
 *  Result object - the rows live on .rows, it is not itself an array). */
const one = async <T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T> =>
  ((await db.execute(q)).rows[0] ?? {}) as T;
const many = async <T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> =>
  (await db.execute(q)).rows as T[];

export const adminApp = new Hono();

// Mounted at /admin/api so the browser page can live at /admin (SPA route) in
// both dev (vite serves the page, only the API prefix is proxied) and prod
// (Hono serves the API, the static fallback serves the page).
adminApp.use("/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

adminApp.post("/login", async (c) => {
  if (!adminConfigured()) return c.json({ ok: false, error: "admin access is not configured" }, 503);
  const now = Date.now();
  while (loginAttempts.length > 0 && loginAttempts[0] < now - LOGIN_WINDOW_MS) loginAttempts.shift();
  if (loginAttempts.length >= MAX_LOGIN_ATTEMPTS) {
    return c.json({ ok: false, error: "too many attempts - try again in a few minutes" }, 429);
  }
  loginAttempts.push(now);

  const body = (await c.req.json().catch(() => null)) as { email?: string; password?: string } | null;
  // Hash both sides before comparing: constant-time across both fields and
  // no length leak even on the env-configured values.
  const emailOk = safeEqual(sha256((body?.email ?? "").trim().toLowerCase()), sha256(adminEmail()));
  const passOk = safeEqual(sha256(body?.password ?? ""), sha256(adminPassword()));
  if (!emailOk || !passOk) return c.json({ ok: false, error: "invalid credentials" }, 401);

  const token = randomBytes(32).toString("hex");
  sessions.set(sha256(token), Date.now() + SESSION_TTL_MS);
  setCookie(c, ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === "production",
  });
  return c.json({ ok: true });
});

adminApp.post("/logout", (c) => {
  const token = getCookie(c, ADMIN_COOKIE);
  if (token) sessions.delete(sha256(token));
  deleteCookie(c, ADMIN_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

adminApp.get("/session", (c) => c.json({ authed: isAuthed(getCookie(c, ADMIN_COOKIE)) }));

adminApp.get("/stats", async (c) => {
  if (!isAuthed(getCookie(c, ADMIN_COOKIE))) return c.json({ ok: false }, 401);
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const d24 = 24 * 3600_000;
  const d7 = 7 * 86400_000;

  const users = await one(sql`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE created_at >= ${ago(d24)})::int AS last24h,
      count(*) FILTER (WHERE created_at >= ${ago(d7)})::int AS last7d,
      count(*) FILTER (WHERE plan <> 'community')::int AS paid_plans
    FROM users`);
  const plans = await many(sql`SELECT plan, count(*)::int AS n FROM users GROUP BY plan ORDER BY n DESC`);

  const runs = await one(sql`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE created_at >= ${ago(d24)})::int AS last24h,
      count(*) FILTER (WHERE created_at >= ${ago(d7)})::int AS last7d,
      count(*) FILTER (WHERE status IN ('queued', 'running'))::int AS active,
      count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      -- Stale rows closed by the sweeper carry full wall time (days of queue
      -- time, not compute) - exclude them so the card reads as executed
      -- compute, not elapsed time.
      coalesce(sum(cost_est_usd) FILTER (WHERE error_class IS DISTINCT FROM 'stale'), 0)::float AS cost_usd,
      coalesce(avg(duration_ms) FILTER (WHERE duration_ms IS NOT NULL), 0)::float AS avg_duration_ms
    FROM simulation_runs`);
  const runStatuses = await many(sql`SELECT status, count(*)::int AS n FROM simulation_runs GROUP BY status ORDER BY n DESC`);

  const flowRuns = await one(sql`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE created_at >= ${ago(d7)})::int AS last7d
    FROM flow_runs`);

  const settlements = await many(sql`SELECT status, count(*)::int AS n FROM payment_settlements GROUP BY status ORDER BY n DESC`);
  const billingEvents = await one<{ total: number }>(sql`SELECT count(*)::int AS total FROM billing_events`);

  // MRR estimate from stringz-pay's entitlements table. Self-host installs
  // without stringz-pay have no sp_entitlements - report null, never 500.
  let mrr: { mrrUsd: number; activePaid: number } | null = null;
  try {
    const active = await many<{ plan: string; n: number }>(sql`
      SELECT plan, count(*)::int AS n FROM sp_entitlements
      WHERE paid_through > ${new Date().toISOString()}
      GROUP BY plan`);
    let cents = 0;
    let activePaid = 0;
    for (const row of active) {
      cents += (MRR_CENTS[row.plan] ?? 0) * row.n;
      activePaid += row.n;
    }
    mrr = { mrrUsd: Math.round((cents / 100) * 100) / 100, activePaid };
  } catch (err) {
    if (pgErrorCode(err) !== "42P01") throw err;
  }

  return c.json({
    users,
    plans,
    runs,
    runStatuses,
    flowRuns,
    settlements,
    billingEvents: billingEvents.total,
    mrr,
  });
});

adminApp.get("/users", async (c) => {
  if (!isAuthed(getCookie(c, ADMIN_COOKIE))) return c.json({ ok: false }, 401);
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
  const total = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM users`);
  const users = await many(sql`
    SELECT u.id, u.email, u.name, u.plan, u.plan_status, u.created_at, u.wallet_address,
      EXISTS(SELECT 1 FROM onboarding o WHERE o.user_id = u.id) AS onboarded
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT ${limit} OFFSET ${offset}`);
  return c.json({ total: total.n, users });
});

adminApp.get("/runs", async (c) => {
  if (!isAuthed(getCookie(c, ADMIN_COOKIE))) return c.json({ ok: false }, 401);
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const runs = await many(sql`
    SELECT r.id, r.status, r.error_class, r.duration_ms, r.cost_est_usd, r.created_at,
      u.email AS user_email
    FROM simulation_runs r
    LEFT JOIN users u ON u.id = r.user_id
    ORDER BY r.created_at DESC
    LIMIT ${limit}`);
  return c.json({ runs });
});
