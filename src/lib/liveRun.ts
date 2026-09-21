/**
 * Live on-chain prefetch for canvas runs (Phase 3d step 3).
 *
 * Before a run executes, every node that can be read for free on-chain
 * (Chainlink price feeds, native balances via Multicall3, the Fast Gas feed)
 * gets a real read with a 6 s cap. Results become per-node output overrides
 * so expressions and the Run data viewer show real numbers; a failed or slow
 * read silently falls back to the sample catalog in flowData.ts.
 */
import type { FlowNode } from "../data/services";
import { getPrice, type Pair } from "../web3/priceFeeds";
import { getContractRead, getGasPriceGwei, getNativeBalance } from "../web3/chainReads";
import { encodeCallData } from "./callData";
import { param, type Json } from "./flowData";

const READ_TIMEOUT_MS = 6000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("read timeout")), ms)),
  ]);
}

/** Same condition math as the CRE helper in src/compiler/cre.ts. */
function priceTriggered(action: string, price: number, t: number): boolean {
  if (action === "Price above") return price > t;
  if (action === "Price below") return price < t;
  // "Price crosses" is the pre-rename alias of "Price near (within 1%)".
  if (action === "Price near (within 1%)" || action === "Price crosses") return t > 0 && Math.abs(price - t) / t < 0.01;
  return true;
}

export interface LiveOverrides {
  overrides: Record<string, Json>;
  liveCount: number;
}

/**
 * Read every live-readable node in the flow. Never rejects: individual
 * failures are swallowed so a run always proceeds with sample fallback.
 */
export async function collectRunOverrides(nodes: FlowNode[]): Promise<LiveOverrides> {
  const overrides: Record<string, Json> = {};
  let liveCount = 0;
  const jobs = nodes.map(async (node) => {
    try {
      if (node.service === "price-feed" && node.chain && node.pair) {
        const { price, updatedAt } = await withTimeout(getPrice(node.chain, node.pair as Pair), READ_TIMEOUT_MS);
        const threshold = Number(param(node, "threshold") || 0);
        overrides[node.id] = {
          pair: node.pair,
          price,
          threshold,
          triggered: priceTriggered(node.action, price, threshold),
          feed: "chainlink-aggregator",
          updatedAt: new Date(updatedAt).toISOString(),
        };
        liveCount++;
        return;
      }
      if (node.service === "wallet-balance" && node.chain) {
        const address = param(node, "address").trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return;
        const { balance, updatedAt } = await withTimeout(
          getNativeBalance(node.chain, address as `0x${string}`),
          READ_TIMEOUT_MS,
        );
        const threshold = Number(param(node, "amount") || 0);
        const above = node.action === "Balance above";
        overrides[node.id] = {
          chain: node.chain,
          address,
          balance,
          threshold,
          condition: node.action,
          triggered: above ? balance > threshold : balance < threshold,
          source: "multicall3-getEthBalance",
          updatedAt: new Date(updatedAt).toISOString(),
        };
        liveCount++;
        return;
      }
      if (node.service === "gas-price") {
        const { gwei, updatedAt } = await withTimeout(getGasPriceGwei(), READ_TIMEOUT_MS);
        const threshold = Number(param(node, "thresholdGwei") || 0);
        overrides[node.id] = {
          chain: "ethereum",
          gwei,
          threshold,
          condition: node.action,
          triggered: node.action === "Gas above" ? gwei > threshold : gwei < threshold,
          feed: "chainlink-fast-gas",
          updatedAt: new Date(updatedAt).toISOString(),
        };
        liveCount++;
        return;
      }
      if (node.service === "contract-call" && node.action === "Read contract") {
        const address = param(node, "contractAddress").trim();
        const abi = param(node, "abi").trim();
        const functionName = param(node, "functionName").trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !abi || !functionName) return;
        const callData = encodeCallData({ ...node.params, abi, functionName });
        if (callData === "0x") return;
        const result = await withTimeout(getContractRead(node.chain ?? "ethereum", address as `0x${string}`, callData), READ_TIMEOUT_MS);
        let decoded: unknown;
        try {
          const { decodeFunctionResult } = await import("viem");
          decoded = decodeFunctionResult({ abi: JSON.parse(abi), functionName, data: result });
        } catch {
          // Raw return data is still honest when decoding fails.
        }
        overrides[node.id] = {
          chain: node.chain ?? "ethereum",
          address,
          function: functionName,
          args: param(node, "args"),
          result,
          ...(decoded !== undefined ? { decoded } : {}),
        };
        liveCount++;
      }
    } catch {
      // Read failed or timed out - the sample catalog stands in for this node.
    }
  });
  await Promise.all(jobs);
  return { overrides, liveCount };
}
