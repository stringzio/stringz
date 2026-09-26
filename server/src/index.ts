import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { trpcServer } from "@hono/trpc-server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { appRouter } from "./trpc/routers";
import { db } from "./db/client";
import { getSessionUser, SESSION_COOKIE } from "./session";
import { oauthApp } from "./oauth";
import { applyBillingEvent, getProvider } from "./billing";
import { cloudSimEnabled, verifyDispatchToken, dispatchRun } from "./sim";
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
    const body = (await c.req.json().catch(() => null)) as { runId?: unknown } | null;
    const runId = typeof body?.runId === "string" ? body.runId : "";
    if (!runId) return c.json({ ok: false, error: "runId is required" }, 400);
    const outcome = await dispatchRun(runId);
    if (outcome === "not-found") return c.json({ ok: false }, 404);
    if (outcome === "not-queued") return c.json({ ok: false }, 409);
    return c.json({ ok: true });
  } catch (err) {
    // Cloud Tasks only sees the status code - the message must go to logs.
    console.error(`[sim-dispatch] runJob failed: ${err instanceof Error ? err.message : String(err)}`);
    return c.json({ ok: false, error: err instanceof Error ? err.message : "dispatch failed" }, 500);
  }
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
  app.use("/assets/*", serveStatic({ root: process.env.STATIC_DIR }));
  // Top-level public files (favicon.svg, robots.txt, og images, ...). serveStatic
  // calls next() when no file matches, so client routes still reach the SPA
  // fallback below instead of 404ing.
  app.use("/*", serveStatic({ root: process.env.STATIC_DIR }));
  app.get("*", serveStatic({ path: `${process.env.STATIC_DIR}/index.html` }));
}

serve({ fetch: app.fetch, port });
console.log(`[flowkit-server] listening on http://localhost:${port} (db: postgres ${process.env.DATABASE_URL ? "configured" : "MISSING DATABASE_URL"}, static: ${process.env.STATIC_DIR ?? "off"})`);
