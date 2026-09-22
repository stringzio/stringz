import { Lock } from "lucide-react";
import { getFieldsFor, fieldVisible, fieldValue, resolveOptions, type FieldDef } from "../data/fields";
import type { FlowNode } from "../data/services";
import TemplateTextarea, { type RefInfo } from "../components/TemplateTextarea";
import { extractTemplateRefs } from "../lib/templateRefs";

function FieldInput({
  def,
  value,
  invalid,
  missing,
  opts,
  onChange,
  resolveRef,
  badRef,
}: {
  def: FieldDef;
  value: string;
  invalid: boolean;
  missing: boolean;
  opts: string[];
  onChange: (key: string, value: string) => void;
  resolveRef?: (nodeId: string) => RefInfo | null;
  badRef?: boolean;
}) {
  const ring = invalid || missing || badRef ? "ring-2 ring-[#C0435A]/40" : "focus:ring-2 focus:ring-[#3f6b4f]/30";

  if (def.type === "select") {
    if (opts.length <= 4) {
      return (
        <div className="flex flex-wrap gap-2">
          {opts.map((o) => (
            <button
              key={o}
              onClick={() => onChange(def.key, o)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                value === o ? "bg-[#1a1a1a] text-white" : "bg-gray-100 text-gray-600 active:bg-gray-200"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      );
    }
    return (
      <select
        value={value}
        onChange={(e) => onChange(def.key, e.target.value)}
        className={`w-full appearance-none rounded-2xl bg-gray-50 px-4 py-3 text-[13.5px] font-medium text-[#1a1a1a] outline-none ${ring}`}
      >
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (def.type === "textarea") {
    return (
      <TemplateTextarea
        value={value}
        onChange={(v) => onChange(def.key, v)}
        placeholder={def.placeholder}
        ring={ring}
        resolveRef={resolveRef}
      />
    );
  }

  const isNumber = def.type === "number";
  const isSecret = def.type === "secret-name";
  return (
    <div className="relative">
      {isSecret && <Lock size={13} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />}
      <input
        value={value}
        onChange={(e) => onChange(def.key, e.target.value)}
        placeholder={def.placeholder ?? (isSecret ? (typeof def.defaultValue === "function" ? undefined : def.defaultValue) : undefined)}
        inputMode={isNumber ? "decimal" : undefined}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={`w-full rounded-2xl bg-gray-50 py-3 text-[13.5px] font-medium text-[#1a1a1a] outline-none placeholder:text-gray-300 ${isSecret ? "pl-9 pr-4 font-mono text-[12.5px]" : "px-4"} ${ring}`}
      />
    </div>
  );
}

/** Renders the per-service config fields for the selected node. */
export default function NodeFields({
  node,
  onParam,
  resolveRef,
}: {
  node: FlowNode;
  onParam: (key: string, value: string) => void;
  resolveRef?: (nodeId: string) => RefInfo | null;
}) {
  const params = node.params ?? {};
  const defs = getFieldsFor(node.service, node.action).filter((d) => fieldVisible(d, node.action, params));
  if (defs.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Configuration</div>
      {/* The sheet spans full width on md+ screens - pair fields in two columns. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {defs.map((def) => {
          const value = fieldValue(def, params);
          const opts = resolveOptions(def, params);
          const invalid = !!value && !!def.pattern && !def.pattern.test(value.trim());
          const missing = !!def.required && !value.trim();
          // Templates pointing at a node id that doesn't exist resolve to "" —
          // flag them here so the mistake is visible before export blocks on it.
          const badRefs = resolveRef
            ? extractTemplateRefs(value).filter((r) => !resolveRef(r.nodeId))
            : [];
          const span = def.type === "textarea" || (def.type === "select" && opts.length > 4);
          return (
            <div key={`${node.service}:${def.key}:${def.label}`} className={span ? "md:col-span-2" : undefined}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[13px] font-semibold text-[#1a1a1a]">
                  {def.label}
                  {def.required && <span className="text-[#C0435A]"> *</span>}
                </span>
              </div>
              <FieldInput def={def} value={value} invalid={invalid} missing={missing} opts={opts} onChange={onParam} resolveRef={resolveRef} badRef={badRefs.length > 0} />
              {invalid && def.patternMessage && (
                <div className="mt-1 text-[11.5px] font-medium text-[#C0435A]">{def.patternMessage}</div>
              )}
              {badRefs.length > 0 && (
                <div className="mt-1 text-[11.5px] font-medium leading-snug text-[#C0435A]">
                  {badRefs.length === 1
                    ? `Unknown reference ${badRefs[0].raw} — no node has that id.`
                    : `Unknown references: ${badRefs.map((r) => r.raw).join(", ")} — no node has those ids.`}
                </div>
              )}
              {!invalid && badRefs.length === 0 && def.help && (
                <div className="mt-1 text-[11.5px] leading-snug text-gray-400">{def.help}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
