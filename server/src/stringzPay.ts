/** Thin client for the stringz-pay service (the internal payment rail). The
 *  shared API key lives only in this backend's environment (Secret Manager);
 *  the frontend never touches stringz-pay directly. */

import type { VerifyPaymentResult } from "../../src/lib/contract";

/** The rail's success shape (stringz-pay only returns this on HTTP 200;
 *  rejections arrive as thrown coded errors). */
export type VerifiedPayment = Extract<VerifyPaymentResult, { outcome: "credited" }>;

export interface VerifyPaymentInput {
  chain: string;
  txHash: string;
  userId: string;
  plan: string;
}

const baseUrl = () => process.env.STRINGZ_PAY_URL ?? "http://localhost:8080";
const apiKey = () => process.env.STRINGZ_PAY_API_KEY ?? "";

/** Verify a wallet payment with stringz-pay and credit the entitlement.
 *  Throws with stringz-pay's machine-readable code on the front of the
 *  message ("INSUFFICIENT_CONFIRMATIONS: 1/5 confirmations ...") so the
 *  client can tell "wait and retry" apart from "wrong amount". */
export async function verifyPayment(input: VerifyPaymentInput): Promise<VerifiedPayment> {
  const res = await fetch(`${baseUrl()}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & Partial<VerifyPaymentResult>;
  if (!res.ok) {
    // 5xx is exceptional (stringz-pay down, store error) - throw uncoded so
    // it surfaces as a real error, never as a business rejection.
    if (res.status >= 500) throw new Error(`stringz-pay HTTP ${res.status}: ${body.error ?? "upstream failure"}`);
    throw new Error(`${body.code ?? "PAY_ERROR"}: ${body.error ?? `Payment verification failed (HTTP ${res.status})`}`);
  }
  return body as VerifiedPayment;
}

/** A fresh transfer is invisible to the chain for its first seconds
 *  (TX_NOT_FOUND) and immature until the chain's confirmation depth
 *  (INSUFFICIENT_CONFIRMATIONS). Both are "wait" states, so the server
 *  absorbs them instead of every client re-implementing the same poll loop
 *  over a lossy wire. Non-transient codes are real rejections and fail
 *  fast. Idempotency lives in stringz-pay (unique (chain, tx_hash) credit),
 *  so retries can never double-credit. */
const RETRY_ATTEMPTS = Number(process.env.VERIFY_RETRY_ATTEMPTS ?? 10);
const RETRY_INTERVAL_MS = Number(process.env.VERIFY_RETRY_INTERVAL_MS ?? 3_500);
const TRANSIENT_CODES = /^(TX_NOT_FOUND|INSUFFICIENT_CONFIRMATIONS)$/;

export async function verifyPaymentWithRetry(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await verifyPayment(input);
      return {
        outcome: "credited",
        credited: result.credited,
        alreadyCredited: result.alreadyCredited,
        plan: result.plan,
        userId: result.userId,
        paidThrough: result.paidThrough,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const coded = /^([A-Z_]+): (.*)$/s.exec(msg);
      if (coded && TRANSIENT_CODES.test(coded[1])) {
        if (attempt < RETRY_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
          continue;
        }
        // Chain still catching up after the full budget: the credit lands in
        // the entitlements read when it confirms - the client watches that.
        return { outcome: "pending" };
      }
      if (coded) return { outcome: "rejected", code: coded[1], message: coded[2] };
      throw err;
    }
  }
}
