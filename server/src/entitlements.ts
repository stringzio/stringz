import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db/client";
import { TIER_SIM_LIMITS, type Tier } from "../../src/lib/pricing";

/** Phase 5 Slice 5C: the single entitlements source. Reads the user's plan
 *  plus an active stringz-pay entitlement row (stringz-pay writes
 *  sp_entitlements into this same database) and resolves the effective tier.
 *  A paid tier counts only while paidThrough is in the future; after lapse it
 *  falls back to community limits - the same rule the enqueue path enforces. */

export interface Entitlements {
  tier: Tier;
  monthlySimLimit: number;
  paidThrough: string | null;
  simsUsed30d: number;
  simsRemaining: number;
}

/** SQLSTATE of the original pg error: drizzle wraps failures in a
 *  DrizzleQueryError with the pg error as `cause`, so walk the chain. */
const pgErrorCode = (err: unknown): string | undefined => {
  let cur = err;
  while (cur && typeof cur === "object") {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
};

const activePaidEntitlement = async (userId: string): Promise<{ plan: string; paidThrough: string } | null> => {
  // sp_entitlements stores paid_through as ISO text (stringz-pay's schema),
  // so the recency check happens in JS - never compare text to now() in SQL.
  try {
    const rows = await db.execute(
      sql`SELECT plan, paid_through FROM sp_entitlements WHERE user_id = ${userId}`,
    );
    const row = rows.rows[0] as unknown as { plan: string; paid_through: string } | undefined;
    if (!row || row.paid_through <= new Date().toISOString()) return null;
    return { plan: row.plan, paidThrough: row.paid_through };
  } catch (err) {
    // 42P01 undefined_table: stringz-pay is not deployed against this
    // database (the common self-host shape). Degrade to the local entitlement
    // columns applyBillingEvent maintains for the commerce/x402 rails instead
    // of 500-ing every poll. Any other error is real - let it surface.
    if (pgErrorCode(err) === "42P01") return localPlanEntitlement(userId);
    throw err;
  }
};

/** Self-host fallback (stringz#67): users.plan / plan_renewal_at are written by
 *  applyBillingEvent; they carry 'pro' | 'team' rather than the rail's
 *  plan-product ids, so map them into the shape tierForPlan understands. */
const localPlanEntitlement = async (userId: string): Promise<{ plan: string; paidThrough: string } | null> => {
  const [user] = await db
    .select({
      plan: schema.users.plan,
      planStatus: schema.users.planStatus,
      planRenewalAt: schema.users.planRenewalAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user || user.planStatus !== "active" || !user.planRenewalAt) return null;
  if (user.planRenewalAt <= new Date().toISOString()) return null;
  return { plan: user.plan === "team" ? "team_monthly" : "pro_monthly", paidThrough: user.planRenewalAt };
};

const simsUsedInLast30d = async (userId: string): Promise<number> => {
  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.simulationRuns)
    .where(and(
      sql`${schema.simulationRuns.userId} = ${userId}`,
      sql`${schema.simulationRuns.createdAt} >= ${windowStart}`,
    ));
  // pg returns count(*) as a string (int8); normalize before the schema parse.
  return Number(row?.count ?? 0);
};

function tierForPlan(plan: string | null | undefined): Tier {
  if (plan === "pro_annual" || plan === "pro_monthly") return "pro";
  if (plan === "team_annual" || plan === "team_monthly") return "team";
  return "community";
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const paid = await activePaidEntitlement(userId);
  const tier = paid ? tierForPlan(paid.plan) : "community";
  const monthlySimLimit = TIER_SIM_LIMITS[tier];
  const simsUsed30d = await simsUsedInLast30d(userId);
  return {
    tier,
    monthlySimLimit,
    paidThrough: paid?.paidThrough ?? null,
    simsUsed30d,
    simsRemaining: Math.max(0, monthlySimLimit - simsUsed30d),
  };
}
