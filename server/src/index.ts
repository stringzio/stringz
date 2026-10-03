import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { trpcServer } from "@hono/trpc-server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";
import { appRouter } from "./trpc/routers";
import { db, schema } from "./db/client";
import { getSessionUser, SESSION_COOKIE } from "./session";
import { oauthApp } from "./oauth";
import { applyBillingEvent, getProvider } from "./billing";
import { cloudSimEnabled, verifyDispatchToken, dispatchRun, ingestEvents, readEventsSince, acquireRunNotifier, startStaleSweeper } from "./sim";
import { chainId } from "../../src/lib/chainIds";

await migrate(db, { migrationsFolder: resolve(import.meta.dir, "db/migrations") });

const app = new Hono();
app.use("*", logger());
app.get("/health", (c) => c.json({ ok: true, service: "flowkit-server" }));

app.route("/oauth", oauthApp);

// Billing webhooks: raw body (HMAC-verified) from the payment rail.
app.post("/billing/webhook", async (c) => {
  const provider = getProvider();
  if (!provider) return c.json({ ok: false, error: "billing not configured" }, 503);
  const raw = await c.req.text();
  const signature = c.req.header("x-cc-webhook-signature") ?? c.req.header("x-signature") ?? null;
  const event = provider.parseWebhook(raw, signature);
  if (!event) return c.json({ ok: false, error: "invalid signature" }, 401);
  await applyBillingEvent(event);
  return c.json({ ok: true });
});

// ABI autodetect (Phase 3d): proxy Sourcify so the browser never deals with
// CORS and we can swap sources later. Verified-contract ABIs only.
app.get("/api/abi", async (c) => {
  const address = c.req.query("address")?.toLowerCase() ?? "";
  const id = chainId(c.req.query("chain") ?? "");
  if (!id || !/^0x[0-9a-f]{40}$/.test(address)) {
    return c.json({ ok: false, error: "Provide a valid chain and 0x-prefixed address." }, 400);
  }
  try {
    const res = await fetch(`https://sourcify.dev/server/v2/contract/${id}/${address}?fields=abi,compilation`);
    if (!res.ok) return c.json({ ok: false, error: "Contract not verified on Sourcify for this chain." }, 404);
    const body = (await res.json()) as {
      abi?: unknown[];
      compilation?: { name?: string; compilerVersion?: string };
    };
    const abi = body.abi;
    if (!Array.isArray(abi)) return c.json({ ok: false, error: "Sourcify response has no ABI." }, 404);
    return c.json({
      ok: true,
      abi,
      contractName: body.compilation?.name ?? null,
      compiler: body.compilation?.compilerVersion ?? null,
    });
  } catch {
    return c.json({ ok: false, error: "ABI lookup failed - try again." }, 502);
  }
});

// Cloud simulation dispatch: Cloud Tasks POSTs here (OIDC-verified) to start
// the Cloud Run Job for a queued run.
app.post("/sim-dispatch", async (c) => {
  if (!cloudSimEnabled) return c.json({ ok: false, error: "Cloud simulation is not enabled on this instance" }, 503);
  const audience = `${process.env.PUBLIC_APP_URL ?? "http://localhost:3000"}/sim-dispatch`;
  const auth = c.req.header("Authorization");
  if (!(await verifyDispatchToken(auth, audience))) return c.json({ ok: false }, 401);
  try {
    const body = (await c.req.json().catch(() => null)) as
      | { runId?: unknown; httpPayload?: unknown; evmTxHash?: unknown }
      | null;
    const runId = typeof body?.runId === "string" ? body.runId : "";
    if (!runId) return c.json({ ok: false, error: "runId is required" }, 400);
    const triggerInput = {
      ...(typeof body?.httpPayload === "string" ? { httpPayload: body.httpPayload } : {}),
      ...(typeof body?.evmTxHash === "string" ? { evmTxHash: body.evmTxHash } : {}),
    };
    const outcome = await dispatchRun(runId, triggerInput);
    if (outcome === "not-found") return c.json({ ok: false }, 404);
    if (outcome === "not-queued") return c.json({ ok: false }, 409);
    return c.json({ ok: true });
  } catch (err) {
    // Cloud Tasks only sees the status code - the message must go to logs.
    console.error(`[sim-dispatch] runJob failed: ${err instanceof Error ? err.message : String(err)}`);
    return c.json({ ok: false, error: err instanceof Error ? err.message : "dispatch failed" }, 500);
  }
});

// Live event ingest from the sim runner (Phase 2). Authenticated with a
// per-run HMAC token delivered as a job env var (the runner SA holds no
// session). Payloads land in Postgres and fan out over LISTEN/NOTIFY; the
// completed run still reconciles from the GCS result object.
app.post("/sim-ingest", async (c) => {
  if (!cloudSimEnabled) return c.json({ ok: false, error: "Cloud simulation is not enabled on this instance" }, 503);
  const runId = c.req.query("runId") ?? "";
  const token = c.req.header("x-run-token");
  const body = (await c.req.json().catch(() => null)) as unknown;
  const events = Array.isArray(body) ? body : body && typeof body === "object" ? [body] : [];
  const result = await ingestEvents(runId, token, events);
  if (result.outcome === "bad-token") return c.json({ ok: false }, 401);
  if (result.outcome === "not-found") return c.json({ ok: false }, 404);
  return c.json({ ok: true, received: result.received ?? 0 });
});

// Live run-event stream for the builder (Phase 2). Session-authed; only the
// owning user can read a run's stream. Replays the buffered events, then
// relays new ones until the runner's result event arrives.
app.get("/sim/stream", async (c) => {
  if (!cloudSimEnabled) return c.json({ ok: false, error: "Cloud simulation is not enabled on this instance" }, 503);
  const user = await getSessionUser(getCookie(c, SESSION_COOKIE));
  if (!user) return c.json({ ok: false }, 401);
  const runId = c.req.query("runId") ?? "";
  if (!runId) return c.json({ ok: false, error: "runId is required" }, 400);
  const [row] = await db.select().from(schema.simulationRuns).where(eq(schema.simulationRuns.id, runId)).limit(1);
  if (!row || row.userId !== user.id) return c.json({ ok: false }, 404);

  return streamSSE(c, async (stream) => {
    const abort = c.req.raw.signal;
    let lastSeq = 0n;
    let wake: (() => void) | null = null;
    let closed = false;
    const pending = new Set<string>();
    const notifier = await acquireRunNotifier((rid) => {
      pending.add(rid);
      wake?.();
    });
    const cleanup = () => {
      if (closed) return;
      closed = true;
      notifier.close();
      wake?.();
    };
    abort.addEventListener("abort", cleanup);
    try {
      await stream.writeSSE({ event: "ready", data: JSON.stringify({ runId }) });
      for (;;) {
        pending.delete(runId);
        const batch = await readEventsSince(runId, lastSeq);
        for (const { seq, event } of batch) {
          lastSeq = seq;
          const t = typeof event.t === "string" ? event.t : "log";
          await stream.writeSSE({ event: t, data: JSON.stringify(event) });
          if (t === "result") {
            await stream.writeSSE({ event: "done", data: JSON.stringify({ runId }) });
            return;
          }
        }
        let timer: ReturnType<typeof setTimeout> | null = null;
        const woke = await Promise.race([
          new Promise<"notify">((resolve) => {
            wake = () => resolve("notify");
          }),
          new Promise<"heartbeat">((resolve) => {
            timer = setTimeout(() => resolve("heartbeat"), 20000);
          }),
        ]).finally(() => {
          if (timer) clearTimeout(timer);
          wake = null;
        });
        if (closed) return;
        if (woke === "heartbeat" && !pending.has(runId)) {
          try {
            await stream.writeSSE({ event: "ping", data: "{}" });
          } catch {
            return; // client gone
          }
        }
      }
    } finally {
      abort.removeEventListener("abort", cleanup);
      cleanup();
    }
  });
});

app.use("/trpc/*", async (c, next) => {
  const sessionToken = getCookie(c, SESSION_COOKIE);
  const user = await getSessionUser(sessionToken);
  const secure = process.env.NODE_ENV === "production";
  return trpcServer({
    router: appRouter,
    createContext: () => ({
      user,
      sessionToken,
      setSessionCookie: (token: string) =>
        setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure }),
      clearSessionCookie: () => deleteCookie(c, SESSION_COOKIE, { path: "/" }),
    }),
  })(c, next);
});

const port = Number(process.env.SERVER_PORT ?? 8787);

// Production: serve the built web app from the same origin (STATIC_DIR).
// Registered last so /trpc, /oauth and /health keep priority; the SPA
// fallback serves index.html for client-side routes (/app, /auth, ...).
if (process.env.STATIC_DIR) {
  const { serveStatic } = await import("@hono/node-server/serve-static");
  // Cache policy: hashed assets are content-addressed and cacheable forever;
  // index.html must always revalidate, otherwise browsers heuristically cache
  // it and keep serving a stale app (old chunk names) after every deploy.
  app.use("/assets/*", async (c, next) => {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    await next();
  });
  app.use("/*", async (c, next) => {
    c.header("Cache-Control", "no-cache");
    await next();
  });
  app.use("/assets/*", serveStatic({ root: process.env.STATIC_DIR }));
  // Top-level public files (favicon.svg, robots.txt, og images, ...). serveStatic
  // calls next() when no file matches, so client routes still reach the SPA
  // fallback below instead of 404ing.
  app.use("/*", serveStatic({ root: process.env.STATIC_DIR }));
  app.get("*", serveStatic({ path: `${process.env.STATIC_DIR}/index.html` }));
}

serve({ fetch: app.fetch, port });
// Teardown must not depend on a client polling the run: close stale rows
// (kill execution, purge secrets, free the inflight slot) every minute.
startStaleSweeper();
console.log(`[flowkit-server] listening on http://localhost:${port} (db: postgres ${process.env.DATABASE_URL ? "configured" : "MISSING DATABASE_URL"}, static: ${process.env.STATIC_DIR ?? "off"})`);
