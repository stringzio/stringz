/**
 * Flow data layer (Phase 3d keystone): sample outputs per module, the
 * {{nodeId.path}} expression resolver, and a pure run executor that
 * produces per-node input/output maps. This is what makes "previous node
 * results flow into the next node" real on the canvas, n8n-style, without
 * a backend.
 *
 * Sample data stands in for live chain/API responses until Phase 3d step 3
 * wires real reads; expressions resolve against whatever the io map holds.
 */
import type { FlowNode } from "../data/services";
import { getFieldsFor, fieldValue, fieldVisible } from "../data/fields";
import { CHAIN_SELECTORS } from "../compiler/cre";

export type Json = Record<string, unknown>;
export interface NodeIO {
  input: Json;
  output: Json;
}

/** Param value with the field-registry default as fallback. */
export function param(node: FlowNode, key: string): string {
  const v = node.params?.[key];
  if (v !== undefined && v !== "") return v;
  const def = getFieldsFor(node.service, node.action).find((d) => d.key === key);
  return def ? fieldValue(def, node.params ?? {}) : "";
}

/** Realistic sample output per service/action - enough shape to map fields. */
export function sampleOutput(node: FlowNode): Json {
  const p = (k: string) => param(node, k);
  const action = node.action;
  switch (node.service) {
    case "trigger":
      return { firedAt: new Date().toISOString(), schedule: "*/5 * * * *", bundle: Number(p("bundleCount") || 1) };
    case "sleep":
      return { slept: true, untilNextRun: true };
    case "price-feed":
      return {
        pair: node.pair ?? "ETH/USD",
        price: 2650.42,
        threshold: Number(p("threshold") || 0),
        triggered: true,
        feed: "chainlink-aggregator",
        updatedAt: new Date().toISOString(),
      };
    case "evm-event":
      return action === "Transfer event"
        ? {
            txHash: "0x8f3e2c1d9a7b4f6e5d2c8a1f3b6e9d4c7a2f5e8b1d4c7a3f6e9d2c5b8a1e4",
            blockNumber: 21422314,
            from: p("fromAddress") || "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
            to: p("toAddress") || "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe",
            value: p("minAmount") || "10000",
            tokenId: p("tokenId") || undefined,
          }
        : {
            txHash: "0x3a1f9c2e8b7d4a6f5e2c9b8d1a4f7e6c3b9d2a5e8f1c4b7a6d9e3f2c5b8a1d4e",
            blockNumber: 21422314,
            logIndex: 0,
            event: p("eventSignature") || "LogTriggered",
          };
    case "wallet-balance":
      return {
        chain: node.chain ?? "ethereum",
        address: p("address"),
        balance: 0.4831,
        threshold: Number(p("amount") || 0),
        condition: action,
        triggered: true,
        source: "multicall3-getEthBalance",
        updatedAt: new Date().toISOString(),
      };
    case "gas-price":
      return {
        chain: "ethereum",
        gwei: 12.4,
        threshold: Number(p("thresholdGwei") || 0),
        condition: action,
        triggered: true,
        feed: "chainlink-fast-gas",
        updatedAt: new Date().toISOString(),
      };
    case "contract-call":
      return {
        function: p("functionName") || "balanceOf",
        args: p("args"),
        result: "0x0000000000000000000000000000000000000000000000000000000000000064",
      };
    case "token-transfer":
      return {
        to: p("toAddress"),
        amount: p("amount"),
        token: p("tokenAddress") || "native",
        status: "submitted",
      };
    case "ccip":
      return {
        messageId: "0xab12cd34ef56ab78cd90ef12ab34cd56ef78ab90cd12ef34ab56cd78ef90ab",
        sourceChain: CHAIN_SELECTORS[(node.chain ?? "ethereum") as keyof typeof CHAIN_SELECTORS],
        destChain: CHAIN_SELECTORS[(p("destChain") || "ethereum") as keyof typeof CHAIN_SELECTORS],
      };
    case "swap":
      return action === "Swap exact out"
        ? { quote: "2998.42", expectedOut: p("amountOut"), mode: action, amountOut: p("amountOut"), slippage: p("slippage") }
        : action === "Limit order"
          ? { quote: "2998.42", mode: action, amountIn: p("amountIn"), limitPrice: p("limitPrice") }
          : { quote: "2998.42", expectedOut: "0.333 USDC per ETH", mode: action, amountIn: p("amountIn") };
    case "webhooks":
      return { delivered: true, status: 200 };
    case "slack":
      return { ok: true, channel: p("channel") || "#general", message: p("message"), ts: "1726742400.000100" };
    case "discord":
      return { ok: true, message: p("message"), username: p("username") || "Stringz", messageId: "1284531209456128" };
    case "telegram":
      return action === "Send a photo"
        ? { ok: true, photo: p("photoUrl"), messageId: 4123 }
        : action === "Pin a message"
          ? { ok: true, pinned: true, messageId: Number(p("messageId") || 4123) }
          : { ok: true, message: p("message"), chatId: p("chatId"), messageId: 4123 };
    case "gmail":
      return action === "Watch emails"
        ? { messageId: "18c9a1f2e3b4d5c6", from: "billing@stripe.com", subject: "Your invoice is ready" }
        : { messageId: "18c9a1f2e3b4d5c6", to: p("to"), subject: p("subject") };
    case "chatgpt":
      return { provider: p("provider") || "OpenAI", model: p("model") || "gpt-4o", prompt: p("prompt"), text: "Summary: the bundle shows a healthy position with no imminent risk flags." };
    case "gdrive":
      return action === "Share a folder"
        ? { folderId: p("folderId"), sharedWith: p("shareWith"), role: p("role") }
        : { id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms", name: p("fileName"), mimeType: p("mimeType") };
    case "google-sheets":
      return action === "Get rows"
        ? { spreadsheetId: p("spreadsheetId"), sheet: p("sheet"), rows: [["Date", "Price"], ["2026-09-20", "2650.42"]] }
        : { updatedRows: 1, spreadsheetId: p("spreadsheetId"), sheet: p("sheet") };
    case "youtube":
      return action === "Find by keywords"
        ? { videos: [{ videoId: "dQw4w9WgXcQ", title: p("keywords") || "Chainlink CRE tutorial" }] }
        : action === "Upload a video"
          ? { videoId: "dQw4w9WgXcQ" }
          : { comments: [{ author: "chainlink_fan", text: "Great tutorial!" }] };
    case "calendar":
      return action === "List events"
        ? { eventId: "8f3a2c1d9b4e5f6a", summary: p("summary") || "Team standup", start: "2026-09-21T14:00:00Z" }
        : action === "Create an event"
          ? { eventId: "8f3a2c1d9b4e5f6a", summary: p("summary"), htmlLink: "https://calendar.google.com/event?id=8f3a2c" }
          : { eventId: "8f3a2c1d9b4e5f6a", summary: p("summary") };
    case "notion":
      return action === "Search pages"
        ? { pageId: "3b1f9c2e-8a7d-4e6f-9c1a-2d5b8e4f7a63", url: "https://notion.so/stringz-3b1f9c2e" }
        : { id: "3b1f9c2e-8a7d-4e6f-9c1a-2d5b8e4f7a63", url: "https://notion.so/stringz-3b1f9c2e" };
    case "canva":
      return action === "Create a design"
        ? { designId: "DAF3kL2mN4o" }
        : action === "Export a design"
          ? { designId: p("designId") || "DAF3kL2mN4o", exportUrl: "https://export.canva.com/DAF3kL2mN4o.png" }
          : { templateId: "DAFtmpl01" };
    case "x":
      return { tweetId: "1834567890123456789", text: p("text") || p("query"), handle: p("handle") };
    case "flow-control":
      return { passed: true, condition: `${p("operator")} ${p("value")}`, source: p("source") };
    case "text-parser":
      return action === "Extract pattern"
        ? { action, result: "extracted", matches: ["https://example.com/tx/0x8f3e"] }
        : { action, result: "extracted" };
    case "http-request":
      return { status: 200, body: '{"ok":true,"latencyMs":94}' };
    case "variables":
      return { name: p("name"), value: p("value") || p("amount") || "1" };
    default:
      return { ok: true, action };
  }
}

const EXPR = /\{\{\s*([a-zA-Z0-9_-]+)\.([^}]+?)\s*\}\}/g;

/** Look up "a.b.0.c" in a Json payload. */
function lookup(payload: unknown, path: string): unknown {
  let cur = payload;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[seg.trim()];
  }
  return cur;
}

/**
 * Resolve {{nodeId.path.to.field}} expressions in text against the io map.
 * Unknown references resolve to an empty string so a half-built flow still runs.
 */
export function resolveExpressions(text: string, io: Record<string, NodeIO>): string {
  return text.replace(EXPR, (_whole, nodeId: string, path: string) => {
    const hit = lookup(io[nodeId]?.output, path);
    if (hit === undefined || hit === null) return "";
    return typeof hit === "object" ? JSON.stringify(hit) : String(hit);
  });
}

/** Resolve expressions in every string param of a node (against current io). */
export function resolvedParams(node: FlowNode, io: Record<string, NodeIO>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.params ?? {})) {
    out[k] = typeof v === "string" ? resolveExpressions(v, io) : v;
  }
  return out;
}

/** Canonical text form of a previous step's output (what conditions/parsers see). */
function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Mirrors the CRE helper's condition math (src/compiler/cre.ts testCondition). */
function evalCondition(operator: string, input: string, value: string): boolean {
  if (operator === "is greater than" || operator === "is less than") {
    const a = Number(input);
    const b = Number(value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return operator === "is greater than" ? a > b : a < b;
  }
  if (operator === "contains") return input.includes(value);
  if (operator === "does not contain") return !input.includes(value);
  if (operator === "equals") return input === value;
  return input !== value;
}

/**
 * Pure modules we can honestly execute in-browser (no secrets, no network):
 * text parsing, condition gates and variables. Returns null for everything
 * else (samples stand in), so the Run data viewer shows real transformations
 * instead of generic shapes.
 */
function executeLocal(
  node: FlowNode,
  p: Record<string, string>,
  input: Json,
  vars: Record<string, string>,
): { output: Json; halt?: boolean } | null {
  if (node.service === "text-parser") {
    const src = (p.input ?? "").trim() ? (p.input ?? "") : asText(input);
    if (node.action === "Replace text") {
      return { output: { action: node.action, result: src.split(p.find ?? "").join(p.replaceWith ?? "") } };
    }
    if (node.action === "Split text") {
      const part = Number(p.part ?? "1") || 1;
      return { output: { action: node.action, result: src.split(p.separator ?? "")[part - 1] ?? "" } };
    }
    const presets: Record<string, string> = {
      "Email address": String.raw`\S+@\S+\.\S+`,
      URL: String.raw`https?://\S+`,
      Number: String.raw`-?\d+(\.\d+)?`,
    };
    const pattern = p.patternKind === "Custom pattern" ? (p.pattern ?? "") : (presets[p.patternKind ?? ""] ?? String.raw`\S+`);
    const matches = src.match(new RegExp(pattern, "g")) ?? [];
    return { output: { action: node.action, result: matches.join(", "), matches } };
  }

  if (node.service === "flow-control") {
    const sourceIsVar = p.source === "Variable";
    const inputText = sourceIsVar ? (vars[p.variable ?? ""] ?? "") : asText(input);
    const operator = p.operator ?? "contains";
    const value = p.value ?? "";
    const passed = evalCondition(operator, inputText, value);
    const halt = node.action === "Stop if match" ? passed : node.action === "Continue if match" ? !passed : false;
    return {
      output: {
        passed,
        value: inputText,
        condition: `${operator} ${value}`,
        source: p.source ?? "Previous step result",
        checked: inputText,
        ...(halt && p.haltMessage ? { note: p.haltMessage } : {}),
      },
      halt,
    };
  }

  if (node.service === "variables") {
    if (node.action === "Set variable") {
      vars[p.name ?? ""] = p.value ?? "";
      return { output: { name: p.name, value: p.value ?? "" } };
    }
    if (node.action === "Get variable") {
      return { output: { name: p.name, value: vars[p.name ?? ""] ?? "" } };
    }
    const amount = Number(p.amount ?? "1") || 0;
    const next = (Number(vars[p.name ?? ""]) || 0) + amount;
    vars[p.name ?? ""] = String(next);
    return { output: { name: p.name, value: String(next), delta: amount } };
  }

  return null;
}

/**
 * Execute a linear run. `order` is the node-id sequence; `pinned` outputs
 * override everything, `live` overrides (real on-chain reads from
 * liveRun.ts) beat samples, and the sample catalog is the fallback. Pass a
 * prefix of the sequence to run a node's slice with real upstream data
 * (n8n's "execute node").
 */
/**
 * Execute a linear run. `order` is the node-id sequence; `pinned` outputs
 * override everything, `live` overrides (real on-chain reads from
 * liveRun.ts) beat samples, and the sample catalog is the fallback.
 *
 * Returns the io map plus a per-node provenance map so the UI can say
 * honestly which outputs are live reads, which were computed in-browser,
 * and which are simulated samples (actions never fire from the canvas).
 */
export type RunSource = "live" | "computed" | "sample" | "pinned" | "skipped" | "error";

export interface RunResult {
  io: Record<string, NodeIO>;
  provenance: Record<string, RunSource>;
  /** nodeId -> human-readable failure reason; those nodes render red. */
  errors: Record<string, string>;
}

/**
 * Modules that call an external API need a credential, and the in-browser
 * run never has it (Stringz stores secret names, never values - PRD §1.1).
 * Rather than green-checking a step that did nothing, the run flags it:
 * returns the missing secret name so the UI can mark the node red.
 */
function missingCredentialError(node: FlowNode): string | null {
  for (const def of getFieldsFor(node.service, node.action)) {
    if (def.type !== "secret-name" || !def.required) continue;
    if (!fieldVisible(def, node.action, node.params ?? {})) continue;
    const name = fieldValue(def, node.params ?? {});
    if (!name.trim()) return `${def.label} is not set.`;
    return `Needs ${name} in your .env - browser runs never hold key values, so this step was not executed.`;
  }
  return null;
}

export function executeRun(
  nodes: FlowNode[],
  order: string[],
  pinned: Record<string, Json>,
  live?: Record<string, Json>,
): RunResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const io: Record<string, NodeIO> = {};
  const provenance: Record<string, RunSource> = {};
  const errors: Record<string, string> = {};
  const vars: Record<string, string> = {};
  let prevOutput: Json = { trigger: "manual", at: new Date().toISOString() };
  let haltedBy: string | null = null;
  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;
    const input = prevOutput;
    let output: Json;
    if (haltedBy) {
      // A gate halted the flow - downstream nodes never ran, so say so.
      output = { skipped: true, reason: `flow halted at "${haltedBy}"` };
      provenance[id] = "skipped";
    } else if (pinned[id]) {
      output = pinned[id];
      provenance[id] = "pinned";
    } else if (live?.[id]) {
      output = live[id];
      provenance[id] = "live";
    } else {
      const resolved = resolvedParams(node, io);
      const credError = missingCredentialError({ ...node, params: resolved });
      if (credError) {
        output = { error: credError };
        provenance[id] = "error";
        errors[id] = credError;
      } else {
        let local: { output: Json; halt?: boolean } | null = null;
        let crashed: string | null = null;
        try {
          local = executeLocal(node, resolved, input, vars);
        } catch (e) {
          crashed = e instanceof Error ? e.message : String(e);
        }
        if (crashed) {
          output = { error: crashed };
          provenance[id] = "error";
          errors[id] = crashed;
        } else if (local) {
          output = local.output;
          provenance[id] = "computed";
        } else {
          output = sampleOutput({ ...node, params: resolved });
          provenance[id] = "sample";
        }
        if (local?.halt) haltedBy = id;
      }
    }
    io[id] = { input, output };
    prevOutput = output;
  }
  return { io, provenance, errors };
}
