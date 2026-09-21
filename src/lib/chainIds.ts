/** FlowKit chain id -> EVM chain id (Sourcify / viem / explorers).
 *  Self-contained on purpose: the server imports this file and cannot pull
 *  in the services catalog (it contains JSX icons). */
export const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  avalanche: 43114,
};

export function chainId(chain: string): number | null {
  return CHAIN_IDS[chain] ?? null;
}
