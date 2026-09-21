/**
 * Live on-chain reads for the builder: native balances and the Fast Gas feed.
 *
 * Every address here was verified by a real read on 2026-09-20 via public
 * RPC (see tmp-verify/probe-web3.ts / probe-gas.ts in the session notes):
 * - Multicall3 (0xcA11bde05977b3631167028862bE2a173976CA11) answered
 *   getEthBalance with a non-zero balance on all six supported chains.
 * - The Ethereum mainnet Fast Gas / Gwei Chainlink feed proxy
 *   (0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C) answered latestRoundData
 *   with description "Fast Gas / Gwei", decimals 0, answer in wei per gas.
 * The gas feed exists on mainnet only among our chains; other chains render
 * the Gas Price module with a mainnet-only note instead of a number.
 */
import { createPublicClient, fallback, formatUnits, http } from "viem";
import type { Chain } from "../data/services";
import { PUBLIC_RPCS } from "./priceFeeds";

/** Canonical Multicall3 deployment, present on every supported chain. */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  {
    inputs: [{ name: "addr", type: "address" }],
    name: "getEthBalance",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

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
] as const;

/** Chainlink "Fast Gas / Gwei" feed proxy on Ethereum mainnet. */
export const GAS_FEED_ADDRESS = "0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C";

function clientFor(chain: Chain) {
  return createPublicClient({ transport: fallback(PUBLIC_RPCS[chain].map((u) => http(u))) });
}

/** Native-token balance of an address, in whole units (18-decimal chains). */
export async function getNativeBalance(chain: Chain, address: `0x${string}`): Promise<{ balance: number; updatedAt: number }> {
  const client = clientFor(chain);
  const balance = await client.readContract({
    address: MULTICALL3_ADDRESS,
    abi: MULTICALL3_ABI,
    functionName: "getEthBalance",
    args: [address],
  });
  return { balance: Number(formatUnits(balance, 18)), updatedAt: Date.now() };
}

/**
 * Mainnet Fast Gas price in gwei. The feed reports wei per gas with 0
 * decimals, so the raw answer is divided by 1e9.
 */
export async function getGasPriceGwei(): Promise<{ gwei: number; updatedAt: number }> {
  const client = clientFor("ethereum");
  const round = await client.readContract({
    address: GAS_FEED_ADDRESS,
    abi: AGGREGATOR_V3_ABI,
    functionName: "latestRoundData",
  });
  return { gwei: Number(round[1]) / 1e9, updatedAt: Number(round[3]) * 1000 };
}

/** Raw read-only contract call via eth_call; returns hex return data. Throws on failure. */
export async function getContractRead(chain: Chain, address: `0x${string}`, callData: `0x${string}`): Promise<`0x${string}`> {
  const client = clientFor(chain);
  const { data } = await client.call({ to: address, data: callData });
  return (data ?? "0x") as `0x${string}`;
}
