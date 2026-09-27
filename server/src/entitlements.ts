import { and, sql } from "drizzle-orm";
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

const activePaidEntitlement = async (userId: string): Promise<{ plan: string; paidThrough: string } | null> => {
  // sp_entitlements stores paid_through as ISO text (stringz-pay's schema),
  // so the recency check happens in JS - never compare text to now() in SQL.
  const rows = await db.execute(
    sql`SELECT plan, paid_through FROM sp_entitlements WHERE user_id = ${userId}`,
  );
  const row = rows.rows[0] as unknown as { plan: string; paid_through: string } | undefined;
  if (!row || row.paid_through <= new Date().toISOString()) return null;
  return { plan: row.plan, paidThrough: row.paid_through };
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
