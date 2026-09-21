/**
 * Live Chainlink price-feed reads for the canvas.
 *
 * Every address below was verified by an on-chain `latestRoundData` read
 * (Sep 2026) returning a fresh round at the expected magnitude. Combos that
 * failed to verify (e.g. BTC/USD on Base, LINK/USD on Optimism/Avalanche)
 * are simply absent from the registry - the UI renders those pairs disabled.
 *
 * Reads go through public RPC endpoints with a viem `fallback` transport
 * (Option A, PRD §7 Phase 1.3): no API keys, nothing secret in the bundle.
 * Phase 2b can replace this module with server-side reads without touching
 * canvas code.
 */
import { createPublicClient, fallback, formatUnits, http } from "viem";
import type { Chain } from "../data/services";

export const PRICE_PAIRS = ["ETH/USD", "BTC/USD", "LINK/USD"] as const;
export type Pair = (typeof PRICE_PAIRS)[number];
export const DEFAULT_PAIR: Pair = "ETH/USD";

/** Chainlink AggregatorV3 proxy addresses, verified on-chain. Lowercase on purpose (EIP-55 not required for reads). */
export const FEEDS: Record<Chain, Partial<Record<Pair, `0x${string}`>>> = {
  ethereum: {
    "ETH/USD": "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419",
    "BTC/USD": "0xf4030086522a5beea4988f8ca5b36dbc97bee88c",
    "LINK/USD": "0x2c1d072e956affc0d435cb7ac38ef18d24d9127c",
  },
  base: {
    "ETH/USD": "0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70",
  },
  arbitrum: {
    "ETH/USD": "0x639fe6ab55c921f74e7fac1ee960c0b6293ba612",
    "BTC/USD": "0x6ce185860a4963106506c203335a2910413708e9",
    "LINK/USD": "0x86e53cf1b870786351da77a57575e79cb55812cb",
  },
  optimism: {
    "ETH/USD": "0x13e3ee699d1909e989722e753853ae30b17e08c5",
    "BTC/USD": "0xd702dd976fb76fffc2d3963d037dfdae5b04e593",
  },
  polygon: {
    "ETH/USD": "0xf9680d99d6c9589e2a93a78a04a279e509205945",
    "BTC/USD": "0xc907e116054ad103354f2d350fd2514433d57f6f",
    "LINK/USD": "0xd9ffdb71ebe7496cc440152d43986aae0ab76665",
  },
  avalanche: {
    "ETH/USD": "0x976b3d034e162d8bd72d6b9c989d545b839003b0",
    "BTC/USD": "0x2779d32d5166baaa2b2b658333ba7e6ec0c65743",
  },
};

/**
 * Public RPC endpoints per chain (all exercised by the on-chain verification).
 * Browser-CORS verified 2026-09-19 via OPTIONS preflight: every endpoint here
 * answers Access-Control-Allow-Origin. LlamaRPC was removed the same day -
 * its endpoints returned HTTP 525 with no CORS headers from browser origins,
 * which both broke live prices and spammed the console with fetch errors.
 */
export const PUBLIC_RPCS: Record<Chain, string[]> = {
  ethereum: [
    "https://ethereum-rpc.publicnode.com",
    "https://cloudflare-eth.com",
    "https://rpc.ankr.com/eth",
    "https://eth-mainnet.public.blastapi.io",
    "https://1rpc.io/eth",
  ],
  base: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
  ],
  arbitrum: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
  ],
  optimism: [
    "https://mainnet.optimism.io",
    "https://optimism-rpc.publicnode.com",
  ],
  polygon: [
    "https://polygon-rpc.com",
    "https://polygon-bor-rpc.publicnode.com",
  ],
  avalanche: [
    "https://api.avax.network/ext/bc/C/rpc",
    "https://avalanche-c-chain-rpc.publicnode.com",
  ],
};

const AGGREGATOR_V3_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { internalType: "uint80", name: "roundId", type: "uint80" },
      { internalType: "int256", name: "answer", type: "int256" },
      { internalType: "uint256", name: "startedAt", type: "uint256" },
      { internalType: "uint256", name: "updatedAt", type: "uint256" },
      { internalType: "uint80", name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "decimals", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
] as const;

/** Feeds are heartbeat-based; flag rounds older than this as stale. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 30 * 1000;

export interface PriceState {
  status: "loading" | "ok" | "error";
  price?: number;
  updatedAt?: number;
  stale?: boolean;
}

type Listener = (state: PriceState) => void;

/** Feed address for a chain/pair, or null when unregistered (UI shows the pair disabled). */
export function getFeedAddress(chain: Chain, pair: string): `0x${string}` | null {
  return FEEDS[chain][pair as Pair] ?? null;
}

/** One-shot read; throws when the pair is unregistered or the read fails. */
export async function getPrice(chain: Chain, pair: Pair): Promise<{ price: number; updatedAt: number }> {
  const address = getFeedAddress(chain, pair);
  if (!address) throw new Error(`No ${pair} feed on ${chain}`);
  const client = createPublicClient({ transport: fallback(PUBLIC_RPCS[chain].map((u) => http(u))) });
  const [round, decimals] = await Promise.all([
    client.readContract({ address, abi: AGGREGATOR_V3_ABI, functionName: "latestRoundData" }),
    client.readContract({ address, abi: AGGREGATOR_V3_ABI, functionName: "decimals" }),
  ]);
  return { price: Number(formatUnits(round[1], decimals)), updatedAt: Number(round[3]) * 1000 };
}

// ── Shared polling store ────────────────────────────────────────────────────
// Nodes on the same chain:pair share a single RPC poll. One interval drives
// every subscribed key; refreshes are skipped while the tab is hidden.

interface Entry {
  chain: Chain;
  pair: Pair;
  listeners: Set<Listener>;
  state: PriceState;
  inflight: Promise<void> | null;
}

const entries = new Map<string, Entry>();
let timer: ReturnType<typeof setInterval> | null = null;

function key(chain: Chain, pair: Pair) {
  return `${chain}:${pair}`;
}

function notify(entry: Entry) {
  entry.state = { ...entry.state, stale: entry.state.updatedAt ? Date.now() - entry.state.updatedAt > STALE_AFTER_MS : false };
  entry.listeners.forEach((cb) => cb(entry.state));
}

async function refresh(entry: Entry) {
  if (entry.inflight) return entry.inflight;
  entry.inflight = (async () => {
    try {
      const { price, updatedAt } = await getPrice(entry.chain, entry.pair);
      entry.state = { status: "ok", price, updatedAt };
    } catch {
      // Keep showing the last good price if we have one; surface an error otherwise.
      if (entry.state.status !== "ok") entry.state = { status: "error" };
    } finally {
      entry.inflight = null;
      notify(entry);
    }
  })();
  return entry.inflight;
}

function tick() {
  if (typeof document !== "undefined" && document.hidden) return;
  entries.forEach((entry) => {
    if (entry.listeners.size > 0) void refresh(entry);
  });
}

function ensureTimer() {
  if (!timer) timer = setInterval(tick, POLL_INTERVAL_MS);
}

/** Subscribe to live prices for a chain:pair. Returns an unsubscribe function. */
export function subscribePrice(chain: Chain, pair: Pair, listener: Listener): () => void {
  const k = key(chain, pair);
  let entry = entries.get(k);
  if (!entry) {
    entry = { chain, pair, listeners: new Set(), state: { status: "loading" }, inflight: null };
    entries.set(k, entry);
  }
  entry.listeners.add(listener);
  listener(entry.state);
  ensureTimer();
  void refresh(entry);
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) entries.delete(k);
    if (entries.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
