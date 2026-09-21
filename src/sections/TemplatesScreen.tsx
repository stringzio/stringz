import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Search, Play, Plus } from "lucide-react";
import { SERVICES, type ServiceId } from "../data/services";
import Toast, { type ToastData } from "../components/Toast";

interface Template {
  title: string;
  desc: string;
  services: ServiceId[];
  extra: number;
  tint: string;
  visibility: "public" | "private";
}

const TEMPLATES: Template[] = [
  {
    title: "Ping Discord when a Chainlink price feed crosses your target",
    desc: "Watch ETH/USD on any chain, let AI write the alert, and push it to your Discord the moment the threshold is hit…",
    services: ["price-feed", "chatgpt", "discord"],
    extra: 0,
    tint: "#EDF1FB",
    visibility: "public",
  },
  {
    title: "Whale watcher: alert on large wallet movements",
    desc: "Trigger on transfer events from watched wallets, summarize the move with AI, and notify your trading channel…",
    services: ["evm-event", "chatgpt", "slack"],
    extra: 0,
    tint: "#FFFFFF",
    visibility: "public",
  },
  {
    title: "Auto-compound staking rewards every Sunday",
    desc: "Claim pending rewards on a schedule and restake them in one flow — set it once and let CRE run it weekly…",
    services: ["contract-call", "token-transfer"],
    extra: 1,
    tint: "#FBE9EF",
    visibility: "public",
  },
  {
    title: "Bridge USDC to Base and confirm on Slack",
    desc: "Move funds cross-chain with CCIP and post a signed confirmation to your ops channel when it lands…",
    services: ["ccip", "slack"],
    extra: 0,
    tint: "#FFFFFF",
    visibility: "private",
  },
  {
    title: "Weekly DCA: swap ETH → USDC on autopilot",
    desc: "Swap a fixed amount every week at the best route, then email yourself a receipt with the fill price…",
    services: ["swap", "gmail"],
    extra: 1,
    tint: "#EDF1FB",
    visibility: "private",
  },
];

type Filter = "all" | "public" | "private";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "public", label: "Public" },
  { key: "private", label: "Private" },
];
const filterCount = (key: Filter) =>
  key === "all" ? TEMPLATES.length : TEMPLATES.filter((t) => t.visibility === key).length;

export default function TemplatesScreen({ desktop = false, onBack }: { desktop?: boolean; onBack: () => void }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const showToast = (text: string) => {
    setToast({ id: Date.now(), text });
    setTimeout(() => setToast(null), 2200);
  };

  const filtered = TEMPLATES.filter(
    (t) =>
      (filter === "all" || t.visibility === filter) &&
      (t.title + t.desc).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#C6DACA" }}>
      {/* header - solid bg so scrolled cards never show through */}
      <div className="absolute inset-x-0 top-0 z-20 bg-[#C6DACA] px-5 pt-14">
        <div className="flex items-center justify-between">
          {!desktop && (
            <button
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow-md transition active:scale-95"
              aria-label="Back to canvas"
            >
              <ChevronLeft size={19} />
            </button>
          )}
          <button
            onClick={() => showToast("Start from a blank template")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md transition active:scale-95"
            aria-label="New template"
          >
            <Plus size={18} className="text-[#1a1a1a]" />
          </button>
        </div>

        <h1 className="mt-5 text-[27px] font-medium leading-[1.2] tracking-tight text-[#1a1a1a]">
          Start <span className="font-extrabold">Automating</span> in Minutes{" "}
          <span className="font-extrabold">with Ready-Made Templates</span>
        </h1>

        <div className="mt-4 flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-2 text-[12.5px] font-semibold transition ${
                filter === f.key ? "bg-[#1a1a1a] text-white" : "bg-white/80 text-gray-500"
              }`}
            >
              {f.label}{" "}
              <span className={filter === f.key ? "text-gray-300" : "text-gray-400"}>{filterCount(f.key)}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-full bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <Search size={16} className="text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search automations…"
            className="w-full bg-transparent text-[13.5px] font-medium text-[#1a1a1a] outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* cards */}
      <div className="no-scrollbar h-full overflow-y-auto px-5 pb-24 pt-[272px]">
        {filtered.map((t, i) => (
          <motion.div
            key={t.title}
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i, type: "spring", damping: 26, stiffness: 260 }}
            className="mb-4 flex gap-4 rounded-[28px] p-5 ring-1 ring-black/[0.05]"
            style={{ backgroundColor: t.tint, border: t.tint === "#FFFFFF" ? "1px solid #eee" : "none" }}
          >
            <div className="flex flex-col items-center gap-2 pt-1">
              {t.services.slice(0, 3).map((sid) => (
                <div
                  key={sid}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm [&>svg]:h-[22px] [&>svg]:w-[22px]"
                >
                  {SERVICES[sid].icon}
                </div>
              ))}
              {t.extra > 0 && (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[13px] font-bold text-[#1a1a1a] shadow-sm">
                  +{t.extra}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[16px] font-extrabold leading-snug text-[#1a1a1a]">{t.title}</h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">{t.desc}</p>
              <div className="mt-3.5 flex items-center justify-between">
                <span className="rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-[10.5px] font-semibold text-gray-500">
                  {t.services.length + t.extra} module{t.services.length + t.extra === 1 ? "" : "s"}
                </span>
                <button
                  onClick={() => showToast("Template added to your scenarios")}
                  className="flex items-center gap-2 rounded-full bg-[#1a1a1a] py-2 pl-5 pr-4 text-[13px] font-semibold text-white transition active:scale-95"
                >
                  Start <Play size={12} fill="currentColor" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <div className="mt-20 text-center text-[13px] font-medium text-[#4b6053]">
            No templates match “{query}”
          </div>
        )}
      </div>

      <Toast toast={toast} />
    </div>
  );
}
