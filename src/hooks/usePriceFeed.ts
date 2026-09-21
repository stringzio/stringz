import { useEffect, useState } from "react";
import { subscribePrice, type Pair, type PriceState } from "../web3/priceFeeds";
import type { Chain } from "../data/services";

/** Live price for a chain:pair; shares one RPC poll across all subscribers. */
export function usePriceFeed(chain: Chain, pair: Pair): PriceState {
  const [state, setState] = useState<PriceState>({ status: "loading" });
  // subscribePrice emits the cached state synchronously, which also covers
  // chain/pair switches (new key starts at "loading").
  useEffect(() => subscribePrice(chain, pair, setState), [chain, pair]);
  return state;
}
