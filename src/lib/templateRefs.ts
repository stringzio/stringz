/**
 * Canonical `{{nodeId.field}}` template grammar and reference extraction.
 *
 * The same grammar is resolved at three layers that MUST agree — canvas hover
 * (`TemplateTextarea`), runtime (`flowData.resolveExpressions`) and compile
 * time (`cre.resolveTemplate`). Unknown references silently resolve to `""`
 * everywhere, so a typo'd node id blanks a message body — or worse, an on-chain
 * amount/address — with no signal. This module is the shared source of truth for
 * *finding* those references so callers can surface them loudly.
 */

/** Matches `{{ nodeId.path.to.field }}` (optional inner whitespace). */
export const TEMPLATE_RE = /\{\{\s*([a-zA-Z0-9_-]+)\.([^}]+?)\s*\}\}/g;

export interface TemplateRef {
  /** The referenced node id (before the first dot). */
  nodeId: string;
  /** The field path after the first dot (e.g. `result` or `a.b.0`). */
  path: string;
  /** The full raw token, e.g. `{{price-feed-1.price}}`. */
  raw: string;
}

/** Every `{{nodeId.field}}` reference in `text`, in source order. */
export function extractTemplateRefs(text: string): TemplateRef[] {
  const refs: TemplateRef[] = [];
  // Fresh RegExp so the shared literal's lastIndex is never carried between calls.
  const re = new RegExp(TEMPLATE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    refs.push({ nodeId: m[1], path: m[2].trim(), raw: m[0] });
  }
  return refs;
}

/** References whose node id is not `known` — typos or the literal `{{nodeId.field}}` placeholder. */
export function unknownTemplateRefs(text: string, known: (nodeId: string) => boolean): TemplateRef[] {
  return extractTemplateRefs(text).filter((r) => !known(r.nodeId));
}

/**
 * Walk a dotted/indexed path (`body.latencyMs`, `rows.0.1`) through a value,
 * parsing a JSON string on the fly when a path needs to descend into it. This
 * is what makes a nested field of an HTTP JSON body — or any array/object — usable
 * downstream, uniformly on the canvas and in the exported workflow. Returns
 * `undefined` for a missing path or a non-JSON string that a path tries to enter.
 *
 * NOTE: `cre.ts` emits a byte-for-byte twin of this into the generated workflow —
 * keep the two behaviours identical.
 */
export function resolvePath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur === "string") {
      try {
        cur = JSON.parse(cur);
      } catch {
        return undefined;
      }
    }
    cur = (cur as Record<string, unknown>)[seg.trim()];
  }
  return cur;
}

/** Stringify a resolved leaf for interpolation into a template string. */
export function resolveLeaf(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
