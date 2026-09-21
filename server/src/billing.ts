/**
 * Billing (Phase 3c). Money moves only on the payment rail - Stringz stores
 * entitlement state. Rail: x402 (primary, seam until the facilitator
 * subscription endpoints are conformed) or Coinbase Commerce (fallback,
 * concrete). Neither configured -> checkout answers with a clear error.
 */
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "./db/client";

export type Plan = "community" | "pro";

export const PLANS: Record<Plan, { savedFlows: number; label: string }> = {
  community: { savedFlows: 3, label: "Community" },
  pro: { savedFlows: 250, label: "Pro" },
};

export interface CheckoutInput {
  userId: string;
  email: string | null;
  baseUrl: string; // e.g. https://flowkit-api-...run.app
}

export interface CheckoutResult {
  url: string; // hosted checkout the user is sent to
}

export interface BillingEvent {
  provider: string;
  type: string; // subscription.active | subscription.canceled | charge.confirmed | ...
  ref: string;
  userId: string;
  plan: Plan;
  renewalAt: string | null;
  raw: unknown;
}

interface BillingProvider {
  name: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** Verify rail signature over the RAW body and map it to a billing event. Null = invalid. */
  parseWebhook(rawBody: string, signature: string | null): BillingEvent | null;
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function hmac(secret: string, raw: string) {
  return createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}

/** Coinbase Commerce (concrete): charges API + shared-secret webhooks. */
const commerceProvider: BillingProvider = {
  name: "commerce",
  async createCheckout({ userId, email, baseUrl }) {
    const key = process.env.COMMERCE_API_KEY;
    if (!key) throw new Error("COMMERCE_API_KEY not configured");
    const res = await fetch("https://api.commerce.coinbase.com/v2/charges", {
      method: "POST",
      headers: { "content-type": "application/json", "X-CC-Api-Key": key, "X-CC-Version": "2018-03-22" },
      body: JSON.stringify({
        name: "Stringz Pro",
        description: "Stringz Pro - hosted cloud, managed vault, monitoring, 3 team seats",
        pricing_type: "fixed_price",
        local_price: { amount: "29.00", currency: "USD" },
        metadata: { userId, email: email ?? "" },
        redirect_url: `${baseUrl}/app`,
        cancel_url: `${baseUrl}/app`,
      }),
    });
    if (!res.ok) throw new Error(`commerce charge failed (${res.status})`);
    const body = (await res.json()) as { data?: { hosted_url?: string; id?: string } };
    if (!body.data?.hosted_url) throw new Error("commerce charge missing hosted_url");
    return { url: body.data.hosted_url };
  },
  parseWebhook(rawBody, signature) {
    const secret = process.env.COMMERCE_WEBHOOK_SECRET;
    if (!secret || !signature) return null;
    if (!safeEqual(hmac(secret, rawBody), signature)) return null;
    const evt = JSON.parse(rawBody) as {
      type: string;
      data: { id?: string; metadata?: { userId?: string }; timeline?: { status?: string }[] };
    };
    const userId = evt.data?.metadata?.userId;
    if (!userId || !evt.data?.id) return null;
    const ok = evt.type === "charge:confirmed" || evt.type === "charge:resolved";
    return {
      provider: "commerce",
      type: evt.type,
      ref: evt.data.id,
      userId,
      plan: ok ? "pro" : "community",
      renewalAt: ok ? new Date(Date.now() + 30 * 86400_000).toISOString() : null,
      raw: evt,
    };
  },
};

/**
 * x402 (primary rail, seam): subscription sessions are facilitator-specific.
 * The request/response shape below follows the standard facilitator flow
 * (POST /subscriptions + HMAC webhook); conform it to the chosen
 * facilitator's docs (e.g. CDP) when X402_API_KEY is provisioned.
 */
const x402Provider: BillingProvider = {
  name: "x402",
  async createCheckout({ userId, baseUrl }) {
    const facilitator = process.env.X402_FACILITATOR_URL;
    const key = process.env.X402_API_KEY;
    if (!facilitator || !key) throw new Error("X402 facilitator not configured");
    const res = await fetch(`${facilitator.replace(/\/$/, "")}/subscriptions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        plan: "pro",
        amount: "29.00",
        asset: "USDC",
        interval: "month",
        metadata: { userId },
        successUrl: `${baseUrl}/app`,
      }),
    });
    if (!res.ok) throw new Error(`x402 subscription failed (${res.status})`);
    const body = (await res.json()) as { checkoutUrl?: string };
    if (!body.checkoutUrl) throw new Error("x402 subscription missing checkoutUrl");
    return { url: body.checkoutUrl };
  },
  parseWebhook(rawBody, signature) {
    const secret = process.env.X402_WEBHOOK_SECRET;
    if (!secret || !signature) return null;
    if (!safeEqual(hmac(secret, rawBody), signature)) return null;
    const evt = JSON.parse(rawBody) as {
      type?: string;
      subscriptionId?: string;
      userId?: string;
      renewalAt?: string;
    };
    if (!evt.userId || !evt.subscriptionId) return null;
    const active = evt.type === "subscription.active" || evt.type === "subscription.renewed";
    return {
      provider: "x402",
      type: evt.type ?? "unknown",
      ref: evt.subscriptionId,
      userId: evt.userId,
      plan: active ? "pro" : "community",
      renewalAt: active ? (evt.renewalAt ?? null) : null,
      raw: evt,
    };
  },
};

export function getProvider(): BillingProvider | null {
  const which = process.env.BILLING_PROVIDER;
  if (which === "commerce") return commerceProvider;
  if (which === "x402") return x402Provider;
  return null;
}

// ── webhook application ─────────────────────────────────────────────────────

/** Flip entitlements from a verified rail event + write the audit row. */
export async function applyBillingEvent(ev: BillingEvent): Promise<void> {
  await db
    .update(schema.users)
    .set({
      plan: ev.plan,
      planStatus: ev.plan === "pro" ? "active" : "canceled",
      planRenewalAt: ev.renewalAt,
      planProvider: ev.provider,
      planRef: ev.ref,
    })
    .where(eq(schema.users.id, ev.userId));
  await db.insert(schema.billingEvents).values({
    id: randomUUID(),
    userId: ev.userId,
    provider: ev.provider,
    type: ev.type,
    ref: ev.ref,
    payload: ev.raw as Record<string, unknown>,
    createdAt: new Date().toISOString(),
  });
}
