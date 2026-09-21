import { CHAINS, type Chain } from "../data/services";

export default function ChainBadge({ chain }: { chain: Chain }) {
  const c = CHAINS[chain];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold"
      style={{ backgroundColor: `${c.color}18`, color: c.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
      {c.name}
    </span>
  );
}
