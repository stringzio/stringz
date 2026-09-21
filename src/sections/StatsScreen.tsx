import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, Play } from "lucide-react";
import Toast, { type ToastData } from "../components/Toast";
import { api } from "../lib/api";
import { recentRunsLocal } from "../lib/runLog";
import type { RunRecord } from "../lib/contract";

type Range = "7D" | "30D" | "90D";
const RANGES: Range[] = ["7D", "30D", "90D"];
const RANGE_DAYS: Record<Range, number> = { "7D": 7, "30D": 30, "90D": 90 };

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Per-user run statistics: server flow_runs when signed in, merged with the
 * local run log (signed-out or offline runs). Empty accounts see an honest
 * empty state instead of sample numbers.
 */
export default function StatsScreen({ desktop = false, onBack }: { desktop?: boolean; onBack: () => void }) {
  const [range, setRange] = useState<Range>("7D");
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeq = useRef(0);

  const showToast = (text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    let cancelled = false;
    // Server runs win; the local log (signed-out/offline runs) fills in.
    // Dedupe by id since a run can exist in both after a sync hiccup.
    api.runs
      .recent({ limit: 200 })
      .then((remote) => {
        if (cancelled) return;
        const seen = new Set(remote.map((r) => r.id));
        const merged = [...remote, ...recentRunsLocal().filter((r) => !seen.has(r.id))];
        setRuns(merged);
      })
      .catch(() => !cancelled && setRuns(recentRunsLocal()));
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = runs === null;
  const list = runs ?? [];

  // ── aggregations ──────────────────────────────────────────────────────────
  const days = RANGE_DAYS[range];
  const [now] = useState(() => Date.now());
  const cutoff = now - days * 86400_000;
  const inRange = list.filter((r) => new Date(r.createdAt).getTime() >= cutoff);

  const total = inRange.length;
  const okCount = inRange.filter((r) => r.status === "success").length;
  const successRate = total ? Math.round((okCount / total) * 1000) / 10 : 0;
  const avgDur = total ? inRange.reduce((a, r) => a + r.durationMs, 0) / total / 1000 : 0;
  const distinctFlows = new Set(inRange.map((r) => r.flowName)).size;

  // one bucket per day, oldest first
  const buckets: { label: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(cutoff + (days - 1 - i) * 86400_000);
    buckets.push({ label: fmtDay(dayStart.toISOString()), count: 0 });
  }
  for (const r of inRange) {
    const idx = Math.floor((new Date(r.createdAt).getTime() - cutoff) / 86400_000);
    if (idx >= 0 && idx < days) buckets[idx].count++;
  }
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const labelEvery = Math.ceil(days / 12);

  const byFlow = Object.values(
    list.reduce<Record<string, { name: string; runs: number; last: string }>>((acc, r) => {
      const e = (acc[r.flowName] ??= { name: r.flowName, runs: 0, last: r.createdAt });
      e.runs++;
      if (r.createdAt > e.last) e.last = r.createdAt;
      return acc;
    }, {}),
  )
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 5);

  const recent = list.slice(0, 8);

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      {/* dotted backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(#e5eae5 1.3px, transparent 1.3px)", backgroundSize: "20px 20px" }}
      />

      <div className="no-scrollbar relative h-full overflow-y-auto px-5 pb-24 pt-14">
        {/* header */}
        <div className="sticky top-0 z-10 -mx-5 bg-white/95 px-5 pb-2 pt-14 backdrop-blur">
          <div className="flex items-center justify-between">
            {!desktop && (
              <button
                onClick={onBack}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow-md transition active:scale-95"
                aria-label="Back"
              >
                <ChevronLeft size={19} />
              </button>
            )}
            <div className="flex gap-1 rounded-full bg-white p-1 shadow-md">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3.5 py-2 text-[12px] font-bold transition ${
                    range === r ? "bg-[#1a1a1a] text-white" : "text-gray-500"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <h1 className="mt-5 text-[28px] font-extrabold tracking-tight text-[#1a1a1a]">Statistics</h1>

        {loading ? (
          <div className="mt-16 text-center text-[13.5px] font-medium text-gray-400">Reading your runs…</div>
        ) : list.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10 rounded-[28px] bg-white p-8 text-center ring-1 ring-black/[0.05]"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF2EA] text-[#3f6b4f]">
              <Play size={22} />
            </span>
            <h3 className="mt-4 text-[17px] font-extrabold text-[#1a1a1a]">No runs yet</h3>
            <p className="mx-auto mt-1.5 max-w-[300px] text-[12.5px] leading-snug text-gray-500">
              Hit Run on the canvas and your executions, success rate and timings show up here.
            </p>
            <button
              onClick={onBack}
              className="mt-5 rounded-full bg-[#1a1a1a] px-6 py-3 text-[13px] font-bold text-white transition active:scale-95"
            >
              Open the canvas
            </button>
          </motion.div>
        ) : (
          <>
            {/* KPI row */}
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "Total runs", value: String(total) },
                { label: "Success rate", value: `${successRate}%` },
                { label: "Avg duration", value: total ? `${avgDur.toFixed(1)}s` : "—" },
                { label: "Flows used", value: String(distinctFlows) },
              ].map((k, i) => (
                <motion.div
                  key={k.label}
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.05, type: "spring", damping: 26, stiffness: 260 }}
                  className="rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
                >
                  <div className="text-[11px] font-semibold text-gray-400">{k.label}</div>
                  <div className="mt-1.5 text-[26px] font-extrabold leading-none tracking-tight text-[#1a1a1a]">{k.value}</div>
                  <div className="mt-1.5 text-[11px] font-medium text-gray-400">last {range.toLowerCase()}</div>
                </motion.div>
              ))}
            </div>

            {/* chart card */}
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, type: "spring", damping: 26, stiffness: 260 }}
              className="mt-4 rounded-[28px] bg-white p-5 ring-1 ring-black/[0.05]"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[17px] font-extrabold text-[#1a1a1a]">Runs per day</h3>
                <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-500">Last {range}</span>
              </div>
              <div className="flex h-[220px] items-end gap-1">
                {buckets.map((b, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[9px] font-bold text-gray-400">{b.count || ""}</span>
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.1 + i * 0.015, type: "spring", damping: 24 }}
                      className="w-full origin-bottom rounded-full bg-[#B9CFDD]"
                      style={{ height: `${Math.max(3, (b.count / maxCount) * 170)}px` }}
                    />
                    {i % labelEvery === 0 && <span className="text-[9px] font-medium text-gray-400">{b.label}</span>}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-center gap-6 border-t border-gray-100 pt-3.5">
                <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-gray-500">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#B9CFDD]" /> Executions
                </span>
              </div>
            </motion.div>

            {/* by flow */}
            {byFlow.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, type: "spring", damping: 26, stiffness: 260 }}
                className="mt-6 rounded-[28px] bg-white p-5 ring-1 ring-black/[0.05]"
              >
                <h3 className="mb-1 text-[17px] font-extrabold text-[#1a1a1a]">By flow</h3>
                {byFlow.map((f) => (
                  <button
                    key={f.name}
                    onClick={() => showToast("Per-flow analytics is coming soon")}
                    className="flex w-full items-center justify-between border-b border-gray-50 py-3 text-left transition last:border-0 active:opacity-70"
                  >
                    <div>
                      <div className="text-[13.5px] font-bold text-[#1a1a1a]">{f.name}</div>
                      <div className="text-[11.5px] text-gray-400">{f.runs} runs</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-400">{ago(f.last)}</span>
                      <ChevronRight size={16} className="text-gray-300" />
                    </div>
                  </button>
                ))}
              </motion.div>
            )}

            {/* recent runs */}
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, type: "spring", damping: 26, stiffness: 260 }}
              className="mt-6 rounded-[28px] bg-white p-5 ring-1 ring-black/[0.05]"
            >
              <h3 className="mb-2 text-[17px] font-extrabold text-[#1a1a1a]">Recent runs</h3>
              {recent.map((r, i) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between py-2.5 ${i > 0 ? "border-t border-gray-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${r.status === "success" ? "bg-emerald-500" : "bg-rose-400"}`} />
                    <div>
                      <div className="text-[13.5px] font-semibold text-[#1a1a1a]">{r.flowName}</div>
                      <div className="text-[11.5px] text-gray-500">{ago(r.createdAt)}</div>
                    </div>
                  </div>
                  <span className={`text-[12px] font-medium ${r.status === "success" ? "text-gray-400" : "text-rose-500"}`}>
                    {r.status === "success" ? `${(r.durationMs / 1000).toFixed(1)}s` : "Failed"}
                  </span>
                </div>
              ))}
            </motion.div>

            {/* export */}
            <motion.button
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, type: "spring", damping: 26, stiffness: 260 }}
              onClick={() => showToast("Export opens with analytics")}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border-2 border-dashed border-gray-200 py-3.5 text-[13.5px] font-semibold text-gray-500 transition active:scale-[0.99]"
            >
              <Download size={15} /> Export report
            </motion.button>
          </>
        )}
      </div>

      <Toast toast={toast} />
    </div>
  );
}
