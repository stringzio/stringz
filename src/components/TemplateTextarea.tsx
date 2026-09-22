import { useRef } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { SERVICES } from "../data/services";
import type { FlowNode } from "../data/services";
import type { Json } from "../lib/flowData";
import { TEMPLATE_RE } from "../lib/templateRefs";

/** What a `{{nodeId.field}}` token resolves to, for the hover popover. */
export interface RefInfo {
  node: FlowNode;
  output: Json;
}

/**
 * The shared `{{nodeId.field}}` grammar (single source of truth in templateRefs),
 * so the highlight and the actual substitution never disagree. A fresh instance
 * keeps this component's stateful `.exec` loop isolated from other consumers.
 */
const TOKEN_RE = new RegExp(TEMPLATE_RE.source, "g");

type Segment =
  | { kind: "text"; text: string }
  | { kind: "token"; token: string; nodeId: string; path: string };

function segment(value: string): Segment[] {
  const parts: Segment[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(value)) !== null) {
    if (m.index > last) parts.push({ kind: "text", text: value.slice(last, m.index) });
    parts.push({ kind: "token", token: m[0], nodeId: m[1], path: m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < value.length) parts.push({ kind: "text", text: value.slice(last) });
  return parts;
}

/** Walk "a.b.0.c" through a Json payload (mirrors flowData.lookup). */
function lookup(payload: unknown, path: string): unknown {
  let cur: unknown = payload;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[seg.trim()];
  }
  return cur;
}

function typeLabel(v: unknown): string {
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  return typeof v;
}

function preview(v: unknown): string {
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function TokenChip({
  token,
  nodeId,
  path,
  resolveRef,
}: {
  token: string;
  nodeId: string;
  path: string;
  resolveRef?: (nodeId: string) => RefInfo | null;
}) {
  const info = resolveRef?.(nodeId) ?? null;
  const resolved = !!info;
  const firstSeg = path.split(".")[0];
  const hit = info ? lookup(info.output, path) : undefined;
  const fieldFound = hit !== undefined;

  return (
    <HoverCard openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>
        {/* -mx-0.5 cancels the px-0.5 so surrounding text stays aligned with the
            transparent textarea underneath; only background/color differ. */}
        <span
          className={`pointer-events-auto -mx-0.5 rounded px-0.5 ${
            resolved ? "bg-[#1a1a1a] text-white" : "bg-gray-200 text-gray-400"
          }`}
        >
          {token}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 border-gray-100 p-3">
        {!info ? (
          <div>
            <div className="text-[12.5px] font-semibold text-[#1a1a1a]">Unresolved reference</div>
            <div className="mt-1 text-[11.5px] leading-snug text-gray-500">
              No node with ID <span className="font-mono text-gray-700">{nodeId}</span>. Open the source
              node to copy its ID.
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: SERVICES[info.node.service].tint }}
              >
                <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{SERVICES[info.node.service].icon}</span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-semibold text-[#1a1a1a]">
                  {SERVICES[info.node.service].name}
                </div>
                <div className="truncate font-mono text-[10.5px] text-gray-400">{nodeId}</div>
              </div>
            </div>

            <div className="mt-2.5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Output
            </div>
            <div className="space-y-0.5">
              {Object.entries(info.output).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2">
                  <span
                    className={`font-mono text-[11.5px] ${
                      k === firstSeg ? "font-semibold text-[#1a1a1a]" : "text-gray-600"
                    }`}
                  >
                    {k}
                  </span>
                  <span className="shrink-0 text-[10.5px] text-gray-400">{typeLabel(v)}</span>
                </div>
              ))}
            </div>

            <div className="mt-2.5 border-t border-gray-100 pt-2 text-[11px] leading-snug">
              {fieldFound ? (
                <span className="text-gray-500">
                  <span className="font-mono text-gray-700">.{path}</span> → {preview(hit)}
                </span>
              ) : (
                <span className="text-gray-500">
                  <span className="font-mono text-gray-700">.{path}</span> is not in this node's output.
                </span>
              )}
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * A textarea that inline-highlights {{nodeId.field}} template tokens. The real
 * <textarea> handles all editing (transparent text + visible caret); a mirrored
 * backdrop painted on top renders the visible, highlighted text. Only token
 * chips receive pointer events, so hovering one opens an output-structure
 * popover while clicks elsewhere still fall through to the textarea for the caret.
 */
export default function TemplateTextarea({
  value,
  onChange,
  placeholder,
  ring,
  resolveRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ring: string;
  resolveRef?: (nodeId: string) => RefInfo | null;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const box =
    "w-full rounded-2xl px-4 py-3 text-[13.5px] font-medium leading-normal whitespace-pre-wrap break-words";

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        rows={3}
        spellCheck={false}
        className={`${box} relative resize-none bg-gray-50 text-transparent caret-[#1a1a1a] outline-none ${ring}`}
      />
      <div
        ref={backdropRef}
        aria-hidden
        className={`${box} pointer-events-none absolute inset-0 overflow-hidden text-[#1a1a1a]`}
      >
        {value === "" && placeholder ? <span className="text-gray-300">{placeholder}</span> : null}
        {segment(value).map((s, i) =>
          s.kind === "text" ? (
            <span key={i}>{s.text}</span>
          ) : (
            <TokenChip key={i} token={s.token} nodeId={s.nodeId} path={s.path} resolveRef={resolveRef} />
          ),
        )}
        {/* guards a trailing newline so the mirror keeps the textarea's height */}
        {"​"}
      </div>
    </div>
  );
}
