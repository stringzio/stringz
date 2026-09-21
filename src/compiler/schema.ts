/**
 * FlowKit Blueprint — the JSON intermediate representation between the
 * visual canvas and executable backends (Chainlink CRE; Gelato Web3
 * Functions shut down 2026-03-31 and were retired).
 *
 * Invariant: FlowKit only *describes* flows. Signing, keys and funds
 * always stay with the user's wallet / the execution backend.
 */
import { SERVICES, type FlowNode, type FlowEdge } from "../data/services";
import { validateNodeParams, fieldVisible, fieldValue, getFieldsFor } from "../data/fields";

export interface BlueprintNode {
  id: string;
  module: string;        // service id
  action: string;        // chosen action label
  chain?: string;        // FlowKit chain id (web3 modules only)
  params: Record<string, string>; // user-configured params (price-feed also stores its pair here)
}

export interface BlueprintEdge {
  from: string;
  to: string;
}

export interface Blueprint {
  specVersion: "flowkit.blueprint/v1";
  meta: {
    name: string;
    createdAt: string;
    backends: "cre"[];
  };
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

export type BlueprintErrorCode =
  | "NO_NODES"
  | "DISCONNECTED"
  | "MULTIPLE_TRIGGERS"
  | "NO_TRIGGER"
  | "MISSING_PARAMS"
  | "UNSUPPORTED_MODULE";

export class BlueprintError extends Error {
  readonly code: BlueprintErrorCode;
  constructor(message: string, code: BlueprintErrorCode) {
    super(message);
    this.name = "BlueprintError";
    this.code = code;
  }
}

/** Topological order starting from trigger nodes (no incoming edges). */
function orderNodes(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const incoming = new Map<string, number>();
  nodes.forEach((n) => incoming.set(n.id, 0));
  edges.forEach((e) => incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1));
  const queue = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  const ordered: FlowNode[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  while (queue.length) {
    const n = queue.shift()!;
    ordered.push(n);
    edges
      .filter((e) => e.from === n.id)
      .forEach((e) => {
        const next = byId.get(e.to);
        if (!next) return;
        incoming.set(e.to, (incoming.get(e.to) ?? 1) - 1);
        if ((incoming.get(e.to) ?? 0) === 0) queue.push(next);
      });
  }
  return ordered;
}

export function toBlueprint(name: string, nodes: FlowNode[], edges: FlowEdge[]): Blueprint {
  if (nodes.length === 0) throw new BlueprintError("The canvas is empty.", "NO_NODES");

  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  const detached = nodes.filter((n) => nodes.length > 1 && !connected.has(n.id));
  if (detached.length > 0)
    throw new BlueprintError(
      `Detached module(s): ${detached.map((n) => SERVICES[n.service].name).join(", ")} — connect them or remove them.`,
      "DISCONNECTED"
    );

  const triggers = nodes.filter((n) => !edges.some((e) => e.to === n.id));
  if (triggers.length === 0)
    throw new BlueprintError("No trigger found — every flow needs a starting module.", "NO_TRIGGER");
  if (triggers.length > 1)
    throw new BlueprintError(
      `Multiple triggers (${triggers.map((t) => SERVICES[t.service].name).join(", ")}) — a flow can only have one entry point.`,
      "MULTIPLE_TRIGGERS"
    );

  const ordered = orderNodes(nodes, edges);

  const paramProblems = ordered.flatMap((n) =>
    validateNodeParams(n.service, SERVICES[n.service].name, n.action, n.params ?? {})
  );
  if (paramProblems.length > 0)
    throw new BlueprintError(
      `Missing or invalid configuration:\n${paramProblems.map((p) => `- ${p}`).join("\n")}`,
      "MISSING_PARAMS"
    );

  return {
    specVersion: "flowkit.blueprint/v1",
    meta: {
      name,
      createdAt: new Date().toISOString(),
      backends: ["cre"],
    },
    nodes: ordered.map((n): BlueprintNode => {
      const params: Record<string, string> = { ...(n.params ?? {}) };
      if (n.service === "price-feed") params.pair = n.pair ?? "ETH/USD";
      // Resolve select defaults so compiled output never depends on UI state.
      for (const def of getFieldsFor(n.service, n.action)) {
        if (fieldVisible(def, n.action, params) && !(def.key in params)) {
          const v = fieldValue(def, params);
          if (v) params[def.key] = v;
        }
      }
      return {
        id: n.id,
        module: n.service,
        action: n.action,
        ...(n.chain ? { chain: n.chain } : {}),
        params,
      };
    }),
    edges: edges.map((e) => ({ from: e.from, to: e.to })),
  };
}

/** Deterministic pretty-printed JSON (what the Export button downloads). */
export function serializeBlueprint(bp: Blueprint): string {
  return JSON.stringify(bp, null, 2);
}
