import { useEffect, useState } from "react";
import type { Chain } from "../data/services";
import { subscribeBalance, subscribeGas, type TriggerState } from "../web3/triggerFeeds";

/** Live native balance for a wallet-balance node; shares one RPC poll per chain:address. */
export function useBalanceFeed(chain: Chain, address: string): TriggerState {
  const [state, setState] = useState<TriggerState>({ status: "loading" });
  const key = address.trim();
  useEffect(() => (key ? subscribeBalance(chain, key, setState) : undefined), [chain, key]);
  return state;
}

/** Live mainnet gas price in gwei; one shared poll across all gas nodes. */
export function useGasFeed(): TriggerState {
  const [state, setState] = useState<TriggerState>({ status: "loading" });
  useEffect(() => subscribeGas(setState), []);
  return state;
}
