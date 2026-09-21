import { Check, Sparkles } from "lucide-react";
import Sheet from "./Sheet";

const COMMUNITY = [
  "Everything in the open-source repo",
  "Unlimited local flows and simulation",
  "Deploy to CRE under your own keys",
];
const PRO = [
  "250 saved flows (hosted, autosave, backups)",
  "Managed secrets vault (encrypted, per workspace)",
  "Flow monitoring and alerts",
  "3 team seats with shared flows",
  "Priority support",
];

/**
 * Pro upgrade prompt. Shown when a Community user hits a Pro-gated feature:
 * they can see exactly what Pro adds, but checkout stays honest - billing is
 * not live yet, so the CTA says "Coming soon" instead of charging anyone.
 */
export default function ProSheet({
  open,
  onClose,
  feature,
}: {
  open: boolean;
  onClose: () => void;
  /** What the user tried to do, e.g. "Save more than 3 flows". */
  feature?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Pro">
      {feature && (
        <p className="mb-4 rounded-2xl bg-[#FDF3E3] px-4 py-3 text-[12.5px] font-medium leading-snug text-[#7a5a22]">
          {feature} is a Pro feature.
        </p>
      )}

      <div className="mb-3 rounded-2xl bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-bold text-[#1a1a1a]">Community</span>
          <span className="rounded-full bg-white px-3 py-1 text-[10.5px] font-bold text-gray-500 shadow-sm">$0 · current</span>
        </div>
        <ul className="mt-2.5 space-y-1.5">
          {COMMUNITY.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[12px] text-gray-500">
              <Check size={13} className="mt-0.5 shrink-0 text-gray-400" /> {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-[#1a1a1a] p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[14px] font-bold text-white">
            <Sparkles size={14} className="text-[#E8A33D]" /> Pro
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-bold text-white/70">$29/mo</span>
        </div>
        <ul className="mt-2.5 space-y-1.5">
          {PRO.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[12px] text-white/80">
              <Check size={13} className="mt-0.5 shrink-0 text-[#8fb89c]" /> {f}
            </li>
          ))}
        </ul>
        <button
          disabled
          className="mt-4 w-full cursor-not-allowed rounded-full bg-white/10 py-3 text-[13px] font-bold text-white/50"
        >
          Coming soon - billing is not live yet
        </button>
      </div>

      <p className="mt-4 text-center text-[11px] leading-snug text-gray-400">
        Pro runs in the cloud we operate - that is how the open core gets funded. Self-hosting the
        open-source builder stays free forever.
      </p>
    </Sheet>
  );
}
