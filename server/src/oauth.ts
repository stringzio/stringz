import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, schema } from "./db/client";
import { createSession, SESSION_COOKIE } from "./session";

/**
 * OAuth2 login (authorization-code flow) for GitHub (Google's provider slot
 * stays inert - removed from scope 2026-09-20; Apple likewise).
 *
 * The callback URL is derived from the incoming request's origin (or
 * PUBLIC_APP_URL when set), so the same build works on localhost, the Cloud
 * Run URL, a Vercel domain or a custom domain - register each
 * `<origin>/oauth/<provider>/callback` in the provider's app settings.
 *
 * All providers are inert until their *_CLIENT_ID / *_CLIENT_SECRET env vars
 * are set; the frontend shows "SOON" badges based on the config router.
 */

const appUrl = (c: Context) => {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL;
  // Behind proxies the request URL origin is the internal one (Vite's dev
  // proxy on :3000 forwards to :8787; Cloud Run terminates TLS and forwards
  // http). The public origin survives in the Host / forwarded headers:
  // Vite preserves the browser's Host header, Cloud Run sets
  // X-Forwarded-Proto/Host. Falling back to the request origin keeps direct
  // API access (curl, health checks) working.
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
  if (host) {
    const proto = c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  return new URL(c.req.url).origin;
};
const callback = (c: Context, p: string) => `${appUrl(c)}/oauth/${p}/callback`;
const STATE_COOKIE = "fk_oauth_state";
const cookieOpts = { httpOnly: true, sameSite: "Lax" as const, path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" };

function begin(provider: string, authorizeBase: string, params: Record<string, string>, c: Context) {
  const state = randomBytes(16).toString("hex");
  setCookie(c, STATE_COOKIE, `${provider}:${state}`, cookieOpts);
  const q = new URLSearchParams({ ...params, state }).toString();
  return c.redirect(`${authorizeBase}?${q}`);
}

async function finish(c: Context, provider: "google" | "github", accountId: string, name: string | null, email: string | null, avatar: string | null = null) {
  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  if (!expected || expected !== `${provider}:${c.req.query("state")}`) {
    return c.text("Invalid OAuth state - try signing in again.", 400);
  }

  const [account] = await db
    .select()
    .from(schema.oauthAccounts)
    .where(and(eq(schema.oauthAccounts.provider, provider), eq(schema.oauthAccounts.providerAccountId, accountId)))
    .limit(1);

  let userId = account?.userId;
  if (!userId) {
    const existing = email ? (await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1))[0] : undefined;
    if (existing) {
      userId = existing.id;
    } else {
      const id = crypto.randomUUID();
      await db.insert(schema.users).values({ id, name, email: email ?? null, emailPasswordHash: null, walletAddress: null, avatar, createdAt: new Date().toISOString() });
      userId = id;
    }
    await db.insert(schema.oauthAccounts).values({
      id: crypto.randomUUID(), userId, provider, providerAccountId: accountId, createdAt: new Date().toISOString(),
    });
  }
  // Keep the profile fresh on every social login (name/avatar can change at
  // the provider); never overwrite with nulls.
  if (name || avatar) {
    await db.update(schema.users)
      .set({ ...(name ? { name } : {}), ...(avatar ? { avatar } : {}) })
      .where(eq(schema.users.id, userId));
  }

  const token = await createSession(userId);
  setCookie(c, SESSION_COOKIE, token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });
  return c.redirect("/app");
}

export const oauthApp = new Hono();

oauthApp.get("/google", (c) => {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) return c.text("Google login is not configured (GOOGLE_CLIENT_ID missing).", 501);
  return begin("google", "https://accounts.google.com/o/oauth2/v2/auth", {
    client_id: id,
    redirect_uri: callback(c, "google"),
    response_type: "code",
    scope: "openid email profile",
  }, c);
});

oauthApp.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
  if (!code || !id || !secret) return c.text("Google login is not configured.", 501);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: id, client_secret: secret, redirect_uri: callback(c, "google") }),
  });
  if (!tokenRes.ok) return c.text("Google token exchange failed.", 502);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) return c.text("Google profile fetch failed.", 502);
  const info = (await infoRes.json()) as { sub: string; name?: string; email?: string };
  return finish(c, "google", info.sub, info.name ?? null, info.email ?? null);
});

oauthApp.get("/github", (c) => {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) return c.text("GitHub login is not configured (GITHUB_CLIENT_ID missing).", 501);
  return begin("github", "https://github.com/login/oauth/authorize", {
    client_id: id,
    redirect_uri: callback(c, "github"),
    scope: "read:user user:email",
  }, c);
});

oauthApp.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  const { GITHUB_CLIENT_ID: id, GITHUB_CLIENT_SECRET: secret } = process.env;
  if (!code || !id || !secret) return c.text("GitHub login is not configured.", 501);
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: callback(c, "github") }),
  });
  if (!tokenRes.ok) return c.text("GitHub token exchange failed.", 502);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const userRes = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${access_token}`, accept: "application/vnd.github+json", "user-agent": "flowkit" } });
  if (!userRes.ok) return c.text("GitHub profile fetch failed.", 502);
  const gh = (await userRes.json()) as { id: number; name?: string | null; login: string; email?: string | null; avatar_url?: string | null };
  let email = gh.email ?? null;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", { headers: { authorization: `Bearer ${access_token}`, accept: "application/vnd.github+json", "user-agent": "flowkit" } });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as { email: string; primary: boolean }[];
      email = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? null;
    }
  }
  return finish(c, "github", String(gh.id), gh.name ?? gh.login, email, gh.avatar_url ?? null);
});

oauthApp.get("/apple", (c) =>
  c.text("Apple sign-in needs an Apple Developer account. Register the app, then wire Sign in with Apple in your Apple Developer console.", 501),
);
