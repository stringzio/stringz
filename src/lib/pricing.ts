/** Shared pricing catalog - the single source for the landing page, the
 *  in-app upgrade sheet, and the checkout. Prices in USD cents; sim limits
 *  are per rolling 30 days. Server enforcement mirrors TIER_SIM_LIMITS. */

export type Tier = "community" | "pro" | "team";

export interface PlanInfo {
  tier: Tier;
  name: string;
  tag: string;
  monthlyCents: number;
  annualCents: number;
  monthlySims: number;
  cta: string;
}

export const PLANS: readonly PlanInfo[] = [
  {
    tier: "community",
    name: "Community",
    tag: "Self-host free forever",
    monthlyCents: 0,
    annualCents: 0,
    monthlySims: 50,
    cta: "Start building",
  },
  {
    tier: "pro",
    name: "Pro",
    tag: "For serious builders",
    monthlyCents: 1900,
    annualCents: 19000,
    monthlySims: 1000,
    cta: "Get started",
  },
  {
    tier: "team",
    name: "Team",
    tag: "Shared quota for small teams",
    monthlyCents: 7900,
    annualCents: 79000,
    monthlySims: 4000,
    cta: "Get started",
  },
] as const;

/** Feature rows for the comparison table; null = not included. */
export const FEATURE_ROWS: readonly { label: string; values: Record<Tier, string | null> }[] = [
  { label: "Cloud simulations / month", values: { community: "50", pro: "1,000", team: "4,000" } },
  { label: "Hosted builder with autosave", values: { community: null, pro: "check", team: "check" } },
  { label: "Ephemeral run secrets", values: { community: null, pro: "check", team: "check" } },
  { label: "Export + self-host", values: { community: "check", pro: "check", team: "check" } },
  { label: "Seats", values: { community: "1", pro: "1", team: "5" } },
  { label: "Priority support", values: { community: null, pro: "check", team: "check" } },
] as const;

export const TIER_SIM_LIMITS: Record<Tier, number> = {
  community: 50,
  pro: 1000,
  team: 4000,
};

export const planByTier = (tier: Tier): PlanInfo =>
  PLANS.find((p) => p.tier === tier) ?? (PLANS[0] as PlanInfo);

export const usd = (cents: number): string =>
  cents === 0 ? "$0" : `$${(cents / 100).toLocaleString("en-US")}`;
