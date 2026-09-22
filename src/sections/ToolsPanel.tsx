import { useMemo, useState } from "react";
import { Search, ChevronRight, ChevronDown, Sparkles } from "lucide-react";
import { SERVICES, type ServiceId } from "../data/services";
import { isHostedOnly } from "../compiler/cre";

interface ToolItem {
  service: ServiceId;
  desc: string;
}

const SECTIONS: { name: string; items: ToolItem[] }[] = [
  {
    name: "Flow Control",
    items: [
      { service: "flow-control", desc: "Continue or halt the flow based on a condition." },
      { service: "sleep", desc: "Sets how often this flow runs." },
      { service: "variables", desc: "Get, set, or increment a value for later steps." },
    ],
  },
  {
    name: "Triggers",
    items: [{ service: "trigger", desc: "Entry point that starts the flow on a schedule." }],
  },
  {
    name: "Web3",
    items: [
      { service: "evm-event", desc: "Trigger on a smart-contract event log." },
      { service: "price-feed", desc: "Trigger when a Chainlink price feed crosses a value." },
      { service: "wallet-balance", desc: "Trigger when a wallet's native balance crosses a value." },
      { service: "gas-price", desc: "Trigger when mainnet gas crosses a gwei value." },
      { service: "contract-call", desc: "Read from or write to a smart contract." },
      { service: "token-transfer", desc: "Send ERC-20 or native tokens." },
      { service: "ccip", desc: "Send tokens or messages across chains." },
      { service: "swap", desc: "Swap tokens via a DEX aggregator." },
    ],
  },
  {
    name: "Messaging",
    items: [
      { service: "slack", desc: "Send messages or manage channels in Slack." },
      { service: "discord", desc: "Post alerts to a Discord channel via webhook." },
      { service: "telegram", desc: "Send alerts to a Telegram chat or channel." },
      { service: "gmail", desc: "Send emails or watch a mailbox." },
      { service: "webhooks", desc: "Call any webhook endpoint with your own payload." },
    ],
  },
  {
    name: "Connectors",
    items: [
      { service: "http-request", desc: "Call any REST API and use its response." },
      { service: "google-sheets", desc: "Append, edit, or read rows in a spreadsheet." },
      { service: "gdrive", desc: "Upload files or share folders in Google Drive." },
      { service: "youtube", desc: "Search videos or watch comments." },
      { service: "calendar", desc: "Create, list, or delete calendar events." },
    ],
  },
  {
    name: "Productivity",
    items: [
      { service: "chatgpt", desc: "Send prompts, edit images, or summarize text." },
      { service: "notion", desc: "Create pages or update databases." },
      { service: "canva", desc: "Create and export designs." },
      { service: "x", desc: "Post or search tweets." },
    ],
  },
];

/** Matches a search query against an item, its service name, and its actions. */
function matches(item: ToolItem, q: string): boolean {
  const s = SERVICES[item.service];
  return (
    s.name.toLowerCase().includes(q) ||
    item.desc.toLowerCase().includes(q) ||
    item.service.includes(q) ||
    s.actions.some((a) => a.toLowerCase().includes(q))
  );
}

function ToolButton({ item, onAdd }: { item: ToolItem; onAdd: (s: ServiceId) => void }) {
  const s = SERVICES[item.service];
  const icon = (
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 [&>svg]:h-4 [&>svg]:w-4">
      {s.icon}
    </span>
  );

  // Hosted-only nodes can't compile to a CRE workflow yet, so they aren't
  // addable — shown disabled with a "Soon" tag rather than hidden, to keep the
  // roadmap visible and stop users building flows that can't export.
  if (isHostedOnly(item.service)) {
    return (
      <div
        aria-disabled
        title="Runs on the Stringz cloud runner — coming soon"
        className="mb-1.5 flex w-full cursor-not-allowed select-none items-start gap-3 rounded-2xl px-2 py-2 text-left opacity-50"
      >
        {icon}
        <span>
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#1a1a1a]">
            {s.name}
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-gray-400">
              Soon
            </span>
          </span>
          <span className="block text-[11px] leading-snug text-gray-400">{item.desc}</span>
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={() => onAdd(item.service)}
      className="mb-1.5 flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-gray-50 active:bg-gray-100"
    >
      {icon}
      <span>
        <span className="block text-[13px] font-bold text-[#1a1a1a]">{s.name}</span>
        <span className="block text-[11px] leading-snug text-gray-400">{item.desc}</span>
      </span>
    </button>
  );
}

export default function ToolsPanel({
  onAdd,
  onAIHelp,
}: {
  onAdd: (service: ServiceId, name?: string) => void;
  onAIHelp: () => void;
}) {
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const filter = query.trim().toLowerCase();

  const sections = useMemo(
    () =>
      SECTIONS.map((sec) => ({
        ...sec,
        shown: filter ? sec.items.filter((i) => matches(i, filter)) : sec.items,
      })).filter((sec) => sec.shown.length > 0),
    [filter]
  );
  const totalShown = sections.reduce((n, s) => n + s.shown.length, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5">
        <Search size={15} className="shrink-0 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools"
          className="w-full bg-transparent text-[13px] font-medium text-[#1a1a1a] outline-none placeholder:text-gray-400"
        />
        {query && (
          <button onClick={() => setQuery("")} className="shrink-0 text-[11px] font-bold text-gray-400">
            Clear
          </button>
        )}
      </div>

      <div className="no-scrollbar mt-4 flex-1 overflow-y-auto">
        {totalShown === 0 && (
          <div className="px-2 py-8 text-center text-[12.5px] text-gray-400">
            No tools match "{query}".
          </div>
        )}
        {sections.map((sec) => {
          const isClosed = !filter && closed[sec.name];
          return (
            <div key={sec.name} className="mb-4">
              <button
                onClick={() => setClosed((c) => ({ ...c, [sec.name]: !c[sec.name] }))}
                className="mb-2 flex w-full items-center gap-1.5 text-[14px] font-bold text-[#1a1a1a]"
              >
                {isClosed ? (
                  <ChevronRight size={15} className="text-gray-400" />
                ) : (
                  <ChevronDown size={15} className="text-gray-400" />
                )}
                {sec.name}
                <span className="text-[10px] font-semibold text-gray-300">{sec.shown.length}</span>
              </button>
              {!isClosed && sec.shown.map((item) => <ToolButton key={item.service} item={item} onAdd={onAdd} />)}
            </div>
          );
        })}
      </div>

      <button
        onClick={onAIHelp}
        className="mt-3 flex items-center justify-between rounded-full bg-gray-100 py-3 pl-5 pr-3 text-[14px] font-bold text-[#1a1a1a] transition active:scale-[0.98]"
      >
        <span className="flex items-center gap-2">
          AI <Sparkles size={14} className="text-[#3f6b4f]" /> Help
        </span>
        <span className="rounded-full bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-bold text-white">beta</span>
      </button>
    </div>
  );
}
