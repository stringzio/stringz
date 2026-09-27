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

// ── Chain destinations for checkout (mirror of the stringz-pay registry) ─────

export type PayChain = "base" | "arbitrum" | "avalanche" | "ethereum";

export interface TokenDest {
  symbol: "USDC" | "USDT";
  address: string;
}

export const TREASURY_EVM = "0x3Ef1fdc85B26FC45625f737A0a72AAEe9b77e5D2";

export const PAY_CHAINS: readonly { id: PayChain; label: string; tokens: TokenDest[] }[] = [
  {
    id: "base",
    label: "Base",
    tokens: [
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
      { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" },
    ],
  },
  {
    id: "arbitrum",
    label: "Arbitrum",
    tokens: [{ symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" }],
  },
  {
    id: "avalanche",
    label: "Avalanche",
    tokens: [
      { symbol: "USDC", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
      { symbol: "USDT", address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7" },
    ],
  },
  {
    id: "ethereum",
    label: "Ethereum",
    tokens: [
      { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
      { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
    ],
  },
] as const;

/** A 6-decimal stable's base units equal USD cents at 10^4:1 ($19.00 -> 19_000_000n). */
export const chargeUnits = (cents: number): bigint => BigInt(cents) * 10_000n;
