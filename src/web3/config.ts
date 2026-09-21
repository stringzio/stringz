import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  mainnet, base, arbitrum, optimism, polygon, avalanche,
  baseSepolia, sepolia,
} from "wagmi/chains";
import type { Chain as FlowChain } from "../data/services";

const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined;

if (import.meta.env.DEV && !projectId) {
  console.warn(
    "[Stringz] VITE_WC_PROJECT_ID is not set - using the public demo project id. " +
      "Register your own at https://cloud.walletconnect.com for production."
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: "Stringz",
  // Demo fallback; override via VITE_WC_PROJECT_ID in .env (never commit it -
  // Vite inlines env values into the bundle, so treat the id as public).
  projectId: projectId || "flowkit-demo",
  chains: [mainnet, base, arbitrum, optimism, polygon, avalanche, baseSepolia, sepolia],
  ssr: false,
});

/** Map FlowKit chain ids → viem chain objects (mainnet first, testnet second) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const VIEM_CHAINS: Record<FlowChain, any[]> = {
  ethereum: [mainnet, sepolia],
  base: [base, baseSepolia],
  arbitrum: [arbitrum],
  optimism: [optimism],
  polygon: [polygon],
  avalanche: [avalanche],
};

/** FlowKit chain id → wagmi/viem chain (mainnet) */
export function toViemChain(c: FlowChain) {
  return VIEM_CHAINS[c][0];
}

/** FlowKit chain id → testnet (for simulations) */
export function toTestnet(c: FlowChain) {
  return VIEM_CHAINS[c][1] ?? sepolia;
}
