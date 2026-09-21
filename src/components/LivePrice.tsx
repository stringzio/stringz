import { usePriceFeed } from "../hooks/usePriceFeed";
import { getFeedAddress, type Pair } from "../web3/priceFeeds";
import type { Chain } from "../data/services";

function formatUSD(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: price >= 1000 ? 0 : 2,
  }).format(price);
}

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

/**
 * Live Chainlink price for the price-feed node. `compact` fits the 110px node
 * card (used in place of the action line); default renders the fuller sheet panel.
 * Designed states: loading, ok, stale, unavailable - never an endless spinner.
 */
export default function LivePrice({ chain, pair, compact = false }: { chain: Chain; pair: Pair; compact?: boolean }) {
  const { status, price, updatedAt, stale } = usePriceFeed(chain, pair);
  const unavailable = status === "error" || !getFeedAddress(chain, pair);

  if (compact) {
    return (
      <span className="flex max-w-full items-center justify-center gap-1 whitespace-nowrap text-[9.5px] font-bold leading-tight">
        {unavailable ? (
          <>
            <Dot className="bg-rose-400" />
            <span className="text-rose-500">unavailable</span>
          </>
        ) : status !== "ok" || price === undefined ? (
          <>
            <Dot className="animate-pulse bg-gray-300" />
            <span className="text-gray-400">loading…</span>
          </>
        ) : (
          <>
            <Dot className={stale ? "bg-amber-400" : "bg-emerald-500"} />
            <span className="text-[#3f6b4f]">
              {pair} {formatUSD(price)}
            </span>
          </>
        )}
      </span>
    );
  }

  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{pair} · Chainlink</span>
        {status === "ok" && !unavailable && <Dot className={stale ? "bg-amber-400" : "bg-emerald-500"} />}
      </div>
      {unavailable ? (
        <div className="text-[13.5px] font-medium text-rose-500">Price unavailable for this pair on {chain}.</div>
      ) : status !== "ok" || price === undefined ? (
        <div className="flex items-center gap-2 text-[13.5px] font-medium text-gray-400">
          <Dot className="animate-pulse bg-gray-300" /> Reading on-chain price…
        </div>
      ) : (
        <>
          <div className="text-[22px] font-bold leading-tight text-[#1a1a1a]">{formatUSD(price)}</div>
          <div className="mt-0.5 text-[11.5px] text-gray-400">
            {stale ? "Stale round — " : "Updated "}
            {updatedAt ? ago(updatedAt) : ""}
            {stale ? ", check the RPC endpoint" : ""}
          </div>
        </>
      )}
    </div>
  );
}
