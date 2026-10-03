/** S2b settle-later queue (stringz#62).
 *
 *  billing.verify absorbs the chain's "not yet" states with a bounded retry
 *  budget, then answers "pending" - but before this module nothing re-invoked
 *  the rail, so a payment that confirmed after the budget only credited when
 *  the user retried or support stepped in (the last silent-failure mode in
 *  billing). Now a pending verify parks the payment in payment_settlements
 *  and this worker re-invokes stringz-pay on a backoff until it credits or
 *  the tx proves unpayable, then dead-letters with the reason.
 *
 *  Safety: the rail's credit is idempotent (unique (chain, tx_hash)), so
 *  worker retries can never double-credit; the (chain, tx_hash) unique index
 *  here makes enqueue idempotent too, so a user retrying while a row is
 *  queued never duplicates work. The claim flip (queued -> processing with
 *  WHERE status='queued') is atomic, so multiple API instances cannot pick
 *  the same row; rows stranded in 'processing' by a crash are reset to
 *  'queued' once they go quiet.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "./db/client";
import { verifyPayment, type VerifyPaymentInput } from "./stringzPay";

const TICK_MS = Number(process.env.SETTLE_TICK_MS ?? 30_000);
const BASE_BACKOFF_MS = Number(process.env.SETTLE_BACKOFF_MS ?? 30_000);
const MAX_BACKOFF_MS = Number(process.env.SETTLE_MAX_BACKOFF_MS ?? 900_000);
const MAX_ATTEMPTS = Number(process.env.SETTLE_MAX_ATTEMPTS ?? 96);
/** A row claimed but not finished (crashed worker) is fair game again. */
const STUCK_PROCESSING_MS = 10 * 60_000;
/** Same "wait" states verifyPaymentWithRetry absorbs inline. */
const TRANSIENT_CODES = /^(TX_NOT_FOUND|INSUFFICIENT_CONFIRMATIONS)$/;
/** One tick drains at most this many rows - a backlog drains steadily without
 *  starving the tick of other rows and without hammering the rail. */
const BATCH_LIMIT = 10;

/** Park a payment for worker settlement. Idempotent per (chain, txHash). */
export async function enqueueSettlement(input: VerifyPaymentInput): Promise<void> {
  const now = new Date().toISOString();
  try {
    await db
      .insert(schema.paymentSettlements)
      .values({
        id: randomUUID(),
        userId: input.userId,
        chain: input.chain,
        txHash: input.txHash,
        plan: input.plan,
        status: "queued",
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  } catch (err) {
    // Enqueue failure must not turn a "pending" answer into an error: the
    // user retry path still exists. Log loudly so the gap is visible.
    console.error("[settle] enqueue failed:", err);
  }
}

const backoffFor = (attempts: number) => Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);

async function processRow(row: typeof schema.paymentSettlements.$inferSelect): Promise<void> {
  const now = new Date().toISOString();
  const claimed = await db
    .update(schema.paymentSettlements)
    .set({ status: "processing", updatedAt: now })
    .where(and(eq(schema.paymentSettlements.id, row.id), eq(schema.paymentSettlements.status, "queued")))
    .returning({ id: schema.paymentSettlements.id });
  if (claimed.length === 0) return; // another instance took it

  const short = `${row.chain}:${row.txHash.slice(0, 10)}…`;
  const input: VerifyPaymentInput = { chain: row.chain, txHash: row.txHash, userId: row.userId, plan: row.plan };
  try {
    await verifyPayment(input);
    await db
      .update(schema.paymentSettlements)
      .set({ status: "credited", lastError: null, updatedAt: new Date().toISOString() })
      .where(eq(schema.paymentSettlements.id, row.id));
    console.log(`[settle] credited ${short} on attempt ${row.attempts + 1}`);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const coded = /^([A-Z_]+): (.*)$/s.exec(msg);
    const attempts = row.attempts + 1;
    const settledAt = new Date().toISOString();
    if ((coded && !TRANSIENT_CODES.test(coded[1])) || attempts >= MAX_ATTEMPTS) {
      // Proven unpayable (WRONG_RECIPIENT, UNDERPAID, TX_FAILED, ...) or the
      // confirmation runway is over: dead-letter with the reason.
      const reason = coded ? coded[1] : `attempts exhausted after ${attempts} tries`;
      await db
        .update(schema.paymentSettlements)
        .set({ status: "dead", attempts, lastError: reason, updatedAt: settledAt })
        .where(eq(schema.paymentSettlements.id, row.id));
      console.warn(`[settle] dead-lettered ${short} (${reason})`);
      return;
    }
    // Still "wait": requeue with exponential backoff. An uncoded failure
    // (rail 5xx) lands here too - transient infrastructure, not a verdict.
    await db
      .update(schema.paymentSettlements)
      .set({
        status: "queued",
        attempts,
        lastError: coded ? coded[1] : "RAIL_ERROR",
        nextAttemptAt: new Date(Date.now() + backoffFor(attempts)).toISOString(),
        updatedAt: settledAt,
      })
      .where(eq(schema.paymentSettlements.id, row.id));
  }
}

let settleTimer: ReturnType<typeof setInterval> | null = null;

export function startSettlementWorker(intervalMs = TICK_MS): void {
  if (settleTimer) return;
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const nowIso = new Date().toISOString();
      const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_MS).toISOString();
      const due = await db
        .select()
        .from(schema.paymentSettlements)
        .where(
          sql`(${schema.paymentSettlements.status} = 'queued' and ${schema.paymentSettlements.nextAttemptAt} <= ${nowIso})
            or (${schema.paymentSettlements.status} = 'processing' and ${schema.paymentSettlements.updatedAt} < ${stuckCutoff})`,
        )
        .orderBy(asc(schema.paymentSettlements.nextAttemptAt))
        .limit(BATCH_LIMIT);
      // Reset claims lost to a crash, then process what is due.
      for (const row of due) {
        if (row.status === "processing") {
          await db
            .update(schema.paymentSettlements)
            .set({ status: "queued", updatedAt: nowIso })
            .where(eq(schema.paymentSettlements.id, row.id));
        }
      }
      for (const row of due) await processRow(row);
    } catch (err) {
      console.error("[settle] worker tick failed:", err);
    } finally {
      ticking = false;
    }
  };
  settleTimer = setInterval(() => void tick(), intervalMs);
  void tick();
}
