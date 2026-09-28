/** Thin client for the stringz-pay service (the internal payment rail). The
 *  shared API key lives only in this backend's environment (Secret Manager);
 *  the frontend never touches stringz-pay directly. */

export interface VerifyPaymentInput {
  chain: string;
  txHash: string;
  userId: string;
  plan: string;
}

export interface VerifyPaymentResult {
  credited: boolean;
  alreadyCredited: boolean;
  plan: string;
  userId: string;
  paidThrough: string;
  receipt: {
    chain: string;
    txHash: string;
    from: string;
    token: string;
    amount: string;
    confirmations: number;
  };
}

const baseUrl = () => process.env.STRINGZ_PAY_URL ?? "http://localhost:8080";
const apiKey = () => process.env.STRINGZ_PAY_API_KEY ?? "";

/** Verify a wallet payment with stringz-pay and credit the entitlement.
 *  Throws with stringz-pay's machine-readable code on the front of the
 *  message ("INSUFFICIENT_CONFIRMATIONS: 1/5 confirmations ...") so the
 *  client can tell "wait and retry" apart from "wrong amount". */
export async function verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
  const res = await fetch(`${baseUrl()}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & Partial<VerifyPaymentResult>;
  if (!res.ok) {
    throw new Error(`${body.code ?? "PAY_ERROR"}: ${body.error ?? `Payment verification failed (HTTP ${res.status})`}`);
  }
  return body as VerifyPaymentResult;
}
