/**
 * Shared polling stores for the wallet-balance and gas-price triggers.
 *
 * Mirrors the priceFeeds store: one interval drives every subscribed key,
 * refreshes are skipped while the tab is hidden, and the cached state is
 * emitted synchronously on subscribe so chain/address switches start at
 * "loading" without a flash of stale data.
 */
import type { Chain } from "../data/services";
import { getGasPriceGwei, getNativeBalance } from "./chainReads";

export interface TriggerState {
  status: "loading" | "ok" | "error";
  value?: number;
  updatedAt?: number;
}

type Listener = (state: TriggerState) => void;

interface Entry {
  read: () => Promise<{ value: number; updatedAt: number }>;
  listeners: Set<Listener>;
  state: TriggerState;
  inflight: Promise<void> | null;
}

const entries = new Map<string, Entry>();
let timer: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 30 * 1000;

async function refresh(entry: Entry) {
  if (entry.inflight) return entry.inflight;
  entry.inflight = (async () => {
    try {
      const { value, updatedAt } = await entry.read();
      entry.state = { status: "ok", value, updatedAt };
    } catch {
      if (entry.state.status !== "ok") entry.state = { status: "error" };
    } finally {
      entry.inflight = null;
      entry.listeners.forEach((cb) => cb(entry.state));
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

function subscribe(key: string, read: Entry["read"], listener: Listener): () => void {
  let entry = entries.get(key);
  if (!entry) {
    entry = { read, listeners: new Set(), state: { status: "loading" }, inflight: null };
    entries.set(key, entry);
  }
  entry.listeners.add(listener);
  listener(entry.state);
  ensureTimer();
  void refresh(entry);
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) entries.delete(key);
    if (entries.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Live native balance for a wallet-balance node; shared per chain:address. */
export function subscribeBalance(chain: Chain, address: string, listener: Listener): () => void {
  const addr = address.trim().toLowerCase();
  return subscribe(`bal:${chain}:${addr}`, async () => {
    const { balance, updatedAt } = await getNativeBalance(chain, addr as `0x${string}`);
    return { value: balance, updatedAt };
  }, listener);
}

/** Live mainnet gas price in gwei; one shared poll for all gas nodes. */
export function subscribeGas(listener: Listener): () => void {
  return subscribe("gas", async () => {
    const { gwei, updatedAt } = await getGasPriceGwei();
    return { value: gwei, updatedAt };
  }, listener);
}
