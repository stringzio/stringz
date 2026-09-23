import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Search, Play, Plus, Lock } from "lucide-react";
import { SERVICES, BLANK_NODES, type ServiceId, type Chain, type FlowNode, type FlowEdge } from "../data/services";

interface Template {
  title: string;
  desc: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  tint: string;
  visibility: "public" | "private";
}

// A template is a real, editable flow: an ordered chain of steps (trigger
// first) laid out on the canvas and connected head-to-tail.
type Step = { service: ServiceId; action: string; chain?: Chain; pair?: string };
function makeFlow(steps: Step[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = steps.map((s, i) => ({
    id: `n${i + 1}`,
    service: s.service,
    action: s.action,
    x: 110 + i * 60,
    y: 140 + i * 150,
    ...(s.chain ? { chain: s.chain } : {}),
    ...(s.pair ? { pair: s.pair } : {}),
  }));
  const edges: FlowEdge[] = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }));
  return { nodes, edges };
}

const TEMPLATES: Template[] = [
  {
    title: "Ping Discord when a Chainlink price feed crosses your target",
    desc: "Watch ETH/USD on any chain, let AI write the alert, and push it to your Discord the moment the threshold is hit…",
    ...makeFlow([
      { service: "price-feed", action: "Price above", chain: "ethereum", pair: "ETH/USD" },
      { service: "chatgpt", action: "Send a prompt" },
      { service: "discord", action: "Post to channel" },
    ]),
    tint: "#EDF1FB",
    visibility: "public",
  },
  {
    title: "Whale watcher: alert on large wallet movements",
    desc: "Trigger on transfer events from watched wallets, summarize the move with AI, and notify your trading channel…",
    ...makeFlow([
      { service: "evm-event", action: "Transfer event", chain: "ethereum" },
      { service: "chatgpt", action: "Summarize text" },
      { service: "slack", action: "Send a message" },
    ]),
    tint: "#FFFFFF",
    visibility: "public",
  },
  {
    title: "Auto-compound staking rewards every Sunday",
    desc: "Claim pending rewards on a schedule and restake them in one flow — set it once and let CRE run it weekly…",
    ...makeFlow([
      { service: "sleep", action: "Every day" },
      { service: "contract-call", action: "Write contract", chain: "ethereum" },
      { service: "token-transfer", action: "Send ERC-20", chain: "ethereum" },
    ]),
    tint: "#FBE9EF",
    visibility: "public",
  },
  {
    title: "Bridge USDC to Base and confirm on Slack",
    desc: "Move funds cross-chain with CCIP and post a signed confirmation to your ops channel when it lands…",
    ...makeFlow([
      { service: "trigger", action: "On demand" },
      { service: "ccip", action: "Cross-chain send", chain: "base" },
      { service: "slack", action: "Send a message" },
    ]),
    tint: "#FFFFFF",
    visibility: "private",
  },
  {
    title: "Weekly DCA: swap ETH → USDC on autopilot",
    desc: "Swap a fixed amount every week at the best route, then email yourself a receipt with the fill price…",
    ...makeFlow([
      { service: "sleep", action: "Every day" },
      { service: "swap", action: "Swap exact in", chain: "ethereum" },
      { service: "gmail", action: "Send an email" },
    ]),
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

export default function TemplatesScreen({
  desktop = false,
  onBack,
  onStart,
}: {
  desktop?: boolean;
  onBack: () => void;
  /** Open a flow on the canvas: a template's graph, or a blank starter. */
  onStart: (name: string, nodes: FlowNode[], edges: FlowEdge[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = TEMPLATES.filter(
    (t) =>
      (filter === "all" || t.visibility === filter) &&
      (t.title + t.desc).toLowerCase().includes(query.toLowerCase())
  );

  const dots = {
    backgroundImage: "radial-gradient(#dfe5df 1.3px, transparent 1.3px)",
    backgroundSize: "20px 20px",
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-white" style={dots}>
      <div className="no-scrollbar h-full overflow-y-auto pb-24">
        {/* sticky header - opaque dotted surface so scrolled cards never show through */}
        <div className="sticky top-0 z-20 bg-white px-5 pt-14 pb-4" style={dots}>
          <div className="mx-auto max-w-5xl">
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
                onClick={() => onStart("Untitled scenario", BLANK_NODES, [])}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/[0.04] transition active:scale-95"
                aria-label="Start a blank flow"
              >
                <Plus size={18} className="text-[#1a1a1a]" />
              </button>
            </div>

            <h1 className="mt-5 text-[27px] font-extrabold leading-[1.2] tracking-tight text-[#1a1a1a]">
              Start automating in minutes with ready-made templates
            </h1>

            {/* filters + search: one row on desktop, stacked on mobile */}
            <div className={`mt-4 flex gap-3 ${desktop ? "items-center justify-between" : "flex-col"}`}>
              <div className="flex shrink-0 gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full px-4 py-2 text-[12.5px] font-semibold transition ${
                      filter === f.key
                        ? "bg-[#1a1a1a] text-white"
                        : "bg-white/80 text-gray-500 ring-1 ring-black/[0.04]"
                    }`}
                  >
                    {f.label}{" "}
                    <span className={filter === f.key ? "text-gray-300" : "text-gray-400"}>{filterCount(f.key)}</span>
                  </button>
                ))}
              </div>

              <div
                className={`flex items-center gap-2 rounded-full bg-white/90 px-4 py-3 shadow-sm ring-1 ring-black/[0.04] ${
                  desktop ? "w-72" : ""
                }`}
              >
                <Search size={16} className="text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search automations…"
                  className="w-full bg-transparent text-[13.5px] font-medium text-[#1a1a1a] outline-none placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* cards */}
        <div className="px-5 pt-2">
        <div className={`mx-auto max-w-5xl ${desktop ? "grid grid-cols-2 gap-4" : "flex flex-col gap-4"}`}>
          {filtered.map((t, i) => {
            const services = t.nodes.map((n) => n.service);
            const shown = services.slice(0, 3);
            const extra = services.length - shown.length;
            return (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.28, ease: "easeOut" }}
              className="flex flex-col rounded-[24px] p-5 ring-1 ring-black/[0.06]"
              style={{ backgroundColor: t.tint === "#FFFFFF" ? "#fff" : t.tint }}
            >
              {/* flow preview: the template's services, left to right, as they run */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {shown.map((sid, idx) => (
                    <div key={`${sid}-${idx}`} className="flex items-center">
                      {idx > 0 && <span className="mx-1.5 h-px w-3.5 bg-black/15" />}
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.04] [&>svg]:h-5 [&>svg]:w-5">
                        {SERVICES[sid].icon}
                      </div>
                    </div>
                  ))}
                  {extra > 0 && (
                    <>
                      <span className="mx-1.5 h-px w-3.5 bg-black/15" />
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/60 text-[12px] font-bold text-gray-500 ring-1 ring-black/[0.04]">
                        +{extra}
                      </div>
                    </>
                  )}
                </div>
                <span className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[10.5px] font-semibold text-gray-500">
                  {t.visibility === "private" && <Lock size={10} strokeWidth={2.5} />}
                  {t.visibility === "private" ? "Private" : "Public"}
                </span>
              </div>

              <h3 className="mt-4 text-[16px] font-extrabold leading-snug text-[#1a1a1a]">{t.title}</h3>
              <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-gray-500">{t.desc}</p>

              <div className="mt-auto flex items-center justify-between border-t border-black/[0.06] pt-3.5">
                <span className="text-[11px] font-semibold text-gray-500">
                  {t.nodes.length} module{t.nodes.length === 1 ? "" : "s"}
                </span>
                <button
                  onClick={() => onStart(t.title, t.nodes, t.edges)}
                  className="flex items-center gap-1.5 rounded-full bg-[#1a1a1a] py-2 pl-4 pr-3.5 text-[12.5px] font-semibold text-white transition hover:bg-black active:scale-95"
                >
                  Start <Play size={11} fill="currentColor" />
                </button>
              </div>
            </motion.div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="mt-20 text-center text-[13px] font-medium text-[#4b6053]">
            No templates match “{query}”
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
