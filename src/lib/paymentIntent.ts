/** Payer-signed payment intent (stringzio/stringz-pay#6).
 *
 *  Mirrors stringz-pay's src/core/intents.ts buildIntentMessage BYTE FOR
 *  BYTE: the rail recovers the signer over this exact string, so any drift
 *  between the two breaks checkout with SIGNER_MISMATCH. Any format change
 *  must bump "stringz-pay v1" on both sides in the same deploy window.
 *
 *  Why signing exists: without it, anyone watching the mempool could see a
 *  payer's transfer to the treasury and claim the entitlement with the
 *  observed tx hash before the payer does. The signature binds this claim
 *  to the wallet that actually sent the payment. */

export const PAYMENT_INTENT_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PaymentIntentFields {
  userId: string;
  plan: string;
  chain: string;
  txHash: string;
  /** Unix seconds until the rail accepts this authorization. */
  expires: number;
}

export function buildPaymentIntentMessage(f: PaymentIntentFields): string {
  return [
    "stringz-pay v1 payment authorization",
    `user: ${f.userId}`,
    `plan: ${f.plan}`,
    `chain: ${f.chain}`,
    `transaction: ${f.txHash}`,
    `expires: ${f.expires}`,
  ].join("\n");
}

/** Expiry for a freshly signed checkout intent (module scope so components
 *  can call it from event handlers without a render-purity violation). */
export function paymentIntentExpiry(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) + PAYMENT_INTENT_TTL_SECONDS;
}
