import { useState } from "react";
import { Pin, PinOff } from "lucide-react";
import type { NodeIO, Json, RunSource } from "../lib/flowData";

const SOURCE_BADGE: Record<RunSource, { label: string; className: string }> = {
  live: { label: "live on-chain", className: "bg-[#EAF2EA] text-[#3f6b4f]" },
  computed: { label: "computed", className: "bg-[#E9F2F4] text-[#3d6a75]" },
  sample: { label: "simulated", className: "bg-[#FDF3E3] text-[#b0803a]" },
  pinned: { label: "pinned", className: "bg-gray-100 text-gray-500" },
  skipped: { label: "skipped", className: "bg-[#FBE9EC] text-[#C0435A]" },
  error: { label: "error", className: "bg-[#FBE9EC] text-[#C0435A]" },
};

function JsonBlock({ label, data }: { label: string; data: Json }) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-300">{label}</div>
      <pre className="no-scrollbar max-h-44 overflow-auto rounded-2xl bg-[#1a1a1a] p-3.5 font-mono text-[11px] leading-relaxed text-[#C8F7C5]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

/**
 * Per-node run data (Phase 3d): shows the input a node received and the
 * output it produced in the last run, with n8n-style pinning so iterating
 * on a downstream node does not re-roll upstream samples. Every output is
 * badged with its provenance - live reads and computed transforms are real;
 * "simulated" means shaped sample data (the real call happens only in the
 * exported CRE project under your keys).
 */
export default function RunData({
  io,
  pinned,
  onTogglePin,
  source,
  error,
}: {
  io: NodeIO | undefined;
  pinned: boolean;
  onTogglePin: () => void;
  source?: RunSource;
  error?: string;
}) {
  const [tab, setTab] = useState<"output" | "input">("output");
  const badge = source ? SOURCE_BADGE[source] : null;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Run data</span>
        <button
          onClick={onTogglePin}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition active:scale-95 ${
            pinned ? "bg-[#FDF3E3] text-[#b0803a]" : "bg-gray-100 text-gray-500"
          }`}
        >
          {pinned ? <PinOff size={11} /> : <Pin size={11} />}
          {pinned ? "Pinned" : "Pin"}
        </button>
      </div>
      {!io ? (
        <div className="rounded-2xl bg-gray-50 px-4 py-3.5 text-[12px] leading-snug text-gray-400">
          Run the flow (Simulate) or Test module to attach real input/output data here.
          Use {"{{nodeId.field}}"} in any text field to map values between nodes.
        </div>
      ) : (
        <div className="rounded-2xl bg-gray-50 p-3.5">
          <div className="mb-2.5 flex gap-1.5">
            {(["output", "input"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize transition ${
                  tab === t ? "bg-[#1a1a1a] text-white" : "bg-white text-gray-500"
                }`}
              >
                {t}
              </button>
            ))}
            {badge && (
              <span className={`ml-auto self-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.className}`}>
                {badge.label}
              </span>
            )}
          </div>
          {badge?.label === "simulated" && (
            <p className="mb-2 text-[10.5px] leading-snug text-gray-400">
              Shaped sample - the real call fires only in the exported CRE workflow under your keys.
            </p>
          )}
          {error && (
            <p className="mb-2 rounded-xl bg-[#FBE9EC] px-3 py-2 text-[11px] font-medium leading-snug text-[#C0435A]">
              {error}
            </p>
          )}
          <JsonBlock label={tab === "output" ? "This node produced" : "This node received"} data={tab === "output" ? io.output : io.input} />
        </div>
      )}
    </div>
  );
}
