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
