import { CHAINS, type Chain } from "../data/services";
import { useBalanceFeed, useGasFeed } from "../hooks/useTriggerFeed";

function ago(updatedAt: number) {
  const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`} />;
}

/** Adaptive gwei formatting: 0.081 gwei stays readable, 142 gwei stays short. */
function formatGwei(gwei: number): string {
  const digits = gwei >= 100 ? 0 : gwei >= 1 ? 2 : 4;
  return `${gwei.toFixed(digits)} gwei`;
}

interface LiveTriggerProps {
  kind: "balance" | "gas";
  chain?: Chain;
  address?: string;
  compact?: boolean;
}

/**
 * Live readout for the wallet-balance and gas-price trigger nodes. `compact`
 * fits the 110px node card (in place of the action line); default renders
 * the fuller sheet panel. Designed states: no address, loading, ok, error -
 * never an endless spinner.
 */
export default function LiveTrigger({ kind, chain, address, compact = false }: LiveTriggerProps) {
  const balance = useBalanceFeed(chain ?? "ethereum", kind === "balance" ? (address ?? "") : "");
  const gas = useGasFeed();

  if (kind === "gas") {
    if (compact) {
      return (
        <span className="flex max-w-full items-center justify-center gap-1 whitespace-nowrap text-[9.5px] font-bold leading-tight">
          {gas.status === "error" ? (
            <>
              <Dot className="bg-rose-400" />
              <span className="text-rose-500">unavailable</span>
            </>
          ) : gas.status !== "ok" || gas.value === undefined ? (
            <>
              <Dot className="animate-pulse bg-gray-300" />
              <span className="text-gray-400">loading…</span>
            </>
          ) : (
            <>
              <Dot className="bg-emerald-500" />
              <span className="text-[#3f6b4f]">{formatGwei(gas.value)}</span>
            </>
          )}
        </span>
      );
    }
    return (
      <div className="rounded-2xl bg-gray-50 px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Gas · Chainlink Fast Gas</span>
          {gas.status === "ok" && <Dot className="bg-emerald-500" />}
        </div>
        {gas.status === "error" ? (
          <div className="text-[13.5px] font-medium text-rose-500">Gas feed unavailable.</div>
        ) : gas.status !== "ok" || gas.value === undefined ? (
          <div className="flex items-center gap-2 text-[13.5px] font-medium text-gray-400">
            <Dot className="animate-pulse bg-gray-300" /> Reading gas feed…
          </div>
        ) : (
          <>
            <div className="text-[22px] font-bold leading-tight text-[#1a1a1a]">{formatGwei(gas.value)}</div>
            <div className="mt-0.5 text-[11.5px] text-gray-400">Updated {gas.updatedAt ? ago(gas.updatedAt) : ""}</div>
          </>
        )}
      </div>
    );
  }

  const symbol = CHAINS[chain ?? "ethereum"].symbol;
  const noAddress = !address?.trim();
  if (compact) {
    return (
      <span className="flex max-w-full items-center justify-center gap-1 whitespace-nowrap text-[9.5px] font-bold leading-tight">
        {noAddress ? (
          <span className="text-gray-400">set address</span>
        ) : balance.status === "error" ? (
          <>
            <Dot className="bg-rose-400" />
            <span className="text-rose-500">unavailable</span>
          </>
        ) : balance.status !== "ok" || balance.value === undefined ? (
          <>
            <Dot className="animate-pulse bg-gray-300" />
            <span className="text-gray-400">loading…</span>
          </>
        ) : (
          <>
            <Dot className="bg-emerald-500" />
            <span className="text-[#3f6b4f]">
              {balance.value.toFixed(4)} {symbol}
            </span>
          </>
        )}
      </span>
    );
  }
  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Balance · Multicall3</span>
        {balance.status === "ok" && <Dot className="bg-emerald-500" />}
      </div>
      {noAddress ? (
        <div className="text-[13.5px] font-medium text-gray-400">Set a wallet address to watch its balance.</div>
      ) : balance.status === "error" ? (
        <div className="text-[13.5px] font-medium text-rose-500">Balance read failed for this address.</div>
      ) : balance.status !== "ok" || balance.value === undefined ? (
        <div className="flex items-center gap-2 text-[13.5px] font-medium text-gray-400">
          <Dot className="animate-pulse bg-gray-300" /> Reading balance…
        </div>
      ) : (
        <>
          <div className="text-[22px] font-bold leading-tight text-[#1a1a1a]">
            {balance.value.toFixed(4)} {symbol}
          </div>
          <div className="mt-0.5 text-[11.5px] text-gray-400">Updated {balance.updatedAt ? ago(balance.updatedAt) : ""}</div>
        </>
      )}
    </div>
  );
}
