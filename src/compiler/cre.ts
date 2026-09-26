/**
 * Chainlink CRE project generator.
 *
 * Input:  a validated Stringz Blueprint
 * Output: a multi-file CRE workflow project (Record<path, contents>) that the
 *         user runs locally with `cre workflow simulate` and, after Chainlink
 *         DON access is approved, deploys with `cre workflow deploy`.
 *
 * Gelato Web3 Functions shut down on 2026-03-31; CRE is the live execution
 * backend (PRD §1.1: local simulation is self-serve, DON deploy is
 * approval-gated, keys and secrets always stay with the user).
 */
import type { Blueprint, BlueprintNode } from "./schema";
import { BlueprintError } from "./schema";
import { getFeedAddress, PUBLIC_RPCS, type Pair } from "../web3/priceFeeds";
import { GAS_FEED_ADDRESS, MULTICALL3_ADDRESS } from "../web3/chainReads";
import type { Chain as FlowChain, ServiceId } from "../data/services";
import { SERVICES } from "../data/services";
import { getFieldsFor, fieldVisible, fieldValue, AI_PROVIDER_SECRET, GUARDRAIL_SERVICES } from "../data/fields";
import { encodeCallData } from "../lib/callData";

/** Stringz chain id -> CRE chainSelectorName (getNetwork lookup). Shared with the sample catalog. */
export const CHAIN_SELECTORS: Record<FlowChain, string> = {
  ethereum: "ethereum-mainnet",
  base: "ethereum-mainnet-base-1",
  arbitrum: "ethereum-mainnet-arbitrum-1",
  optimism: "ethereum-mainnet-optimism-1",
  polygon: "polygon-mainnet",
  avalanche: "avalanche-mainnet",
};

/** What exported CRE projects can actually run today; the rest need the hosted runner. */
const EXPORTABLE_SERVICES = [
  "webhooks", "slack", "discord", "telegram", "http-request", "text-parser",
  "variables", "flow-control", "trigger", "sleep", "price-feed", "wallet-balance",
  "gas-price", "evm-event", "contract-call", "token-transfer", "swap", "ccip",
] as const;
const EXPORTABLE_MODULES = EXPORTABLE_SERVICES.join(", ");

/**
 * True for the app-integration nodes that only run on the hosted Stringz runner
 * (ChatGPT, Gmail, Google Drive/Sheets, YouTube, Calendar, Notion, Canva, X) and
 * cannot compile to a CRE workflow yet. Single source of truth for the palette
 * (disabled) and the export gate (`cloudRunnerError`).
 */
export function isHostedOnly(service: ServiceId): boolean {
  return !(EXPORTABLE_SERVICES as readonly string[]).includes(service);
}

/** The secret for these services is an API key or bot token, not a callable URL - they need the hosted Stringz runner. */
function cloudRunnerError(module: string, action?: string): BlueprintError {
  const name = SERVICES[module as ServiceId]?.name ?? module;
  const label = action ? `${name} - ${action}` : name;
  return new BlueprintError(
    `${label} runs on the Stringz cloud runner (coming in the hosted plan). Exported CRE projects currently support ${EXPORTABLE_MODULES}. Remove or replace this step to export.`,
    "UNSUPPORTED_MODULE",
  );
}

/** ERC-20 transfer calldata is compiled in; the report carries it on-chain. */
const ERC20_TRANSFER_ABI = JSON.stringify([
  {
    type: "function",
    name: "transfer",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
]);

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Exact whole-token -> base-unit conversion for the token's `decimals`, no float rounding. */
function wholeTokensToWei(amount: string, context: string, decimals = 18): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw new BlueprintError(`${context}: "${decimals}" is not a valid token decimals (0-36).`, "MISSING_PARAMS");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!m) throw new BlueprintError(`${context}: "${amount}" is not a valid amount.`, "MISSING_PARAMS");
  const frac = (m[2] ?? "").padEnd(decimals, "0").slice(0, decimals);
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

/** Compile-time calldata encoding; parse failures surface as export-time BlueprintErrors. */
function compileCallData(context: string, p: Record<string, string>): `0x${string}` {
  try {
    return encodeCallData(p);
  } catch (err) {
    throw new BlueprintError(`${context}: ${err instanceof Error ? err.message : String(err)}`, "MISSING_PARAMS");
  }
}

/** evm-event "Confirmations" -> CRE log-trigger confidence level. */
const LOG_CONFIDENCE: Record<string, "SAFE" | "LATEST" | "FINALIZED"> = {
  "Finalized": "FINALIZED",
  "Safe (12 blocks)": "SAFE",
  "Fast (1 block)": "LATEST",
};

/** keccak256("Transfer(address,address,uint256)") - the ERC-20/721 Transfer topic. */
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Topic filter expression for the generated log trigger config: the Transfer
 * signature constant, a pre-hashed 0x value used as-is, or a runtime
 * toEventHash(...) call for a custom event signature.
 */
function topicForEvent(n: BlueprintNode): string | null {
  if (n.action === "Transfer event") return JSON.stringify(TRANSFER_TOPIC);
  const sig = n.params?.eventSignature?.trim();
  if (n.action === "Custom event" && sig) {
    if (/^0x[0-9a-fA-F]{64}$/.test(sig)) return JSON.stringify(sig);
    return `toEventHash(${JSON.stringify(sig)})`;
  }
  return null;
}

/** Web2 modules -> the secret that supplies their endpoint/key. */
const WEB2_SECRET: Record<string, string> = {
  slack: "SLACK_WEBHOOK_URL",
  discord: "DISCORD_WEBHOOK_URL",
  gmail: "GMAIL_ACCESS_TOKEN",
  notion: "NOTION_API_KEY",
  x: "X_API_BEARER_TOKEN",
  gdrive: "GOOGLE_SERVICE_ACCOUNT_KEY",
  youtube: "GOOGLE_SERVICE_ACCOUNT_KEY",
  calendar: "GOOGLE_SERVICE_ACCOUNT_KEY",
  canva: "CANVA_API_TOKEN",
  webhooks: "WEBHOOK_URL",
  "google-sheets": "GOOGLE_SERVICE_ACCOUNT_KEY",
  telegram: "TELEGRAM_BOT_TOKEN",
};

/** Effective secret id for a node: the sheet's secret-name override wins. */
function secretIdFor(n: BlueprintNode): string | undefined {
  const override = n.params?.secretName?.trim();
  if (override) return override;
  // AI Agent keys off the chosen provider when the user did not override.
  if (n.module === "chatgpt") return AI_PROVIDER_SECRET[n.params?.provider ?? "OpenAI"] ?? "OPENAI_API_KEY";
  return WEB2_SECRET[n.module];
}

/** Unique env-var secret names a blueprint reads at run time (cloud-run pre-flight UI). */
export function blueprintSecrets(bp: Blueprint): string[] {
  return [...new Set(bp.nodes.map(secretIdFor).filter((s): s is string => !!s))];
}

/** Visible, non-secret field values for a node (what notify() posts as params). */
function payloadFor(n: BlueprintNode): Record<string, string> {
  const params = n.params ?? {};
  const out: Record<string, string> = {};
  for (const def of getFieldsFor(n.module as ServiceId, n.action)) {
    if (def.type === "secret-name" || def.runtimeOnly) continue;
    if (!fieldVisible(def, n.action, params)) continue;
    const v = fieldValue(def, params);
    if (v) out[def.key] = v;
  }
  return out;
}

/**
 * Guardrail policy for a node (retry / continue-on-error), or null when the
 * defaults are in effect (single attempt, stop the flow on error). Only
 * outbound-call modules ever qualify: wrapping a step in the `attempt(...)`
 * closure would capture and swallow its `return "Condition not met"` halt,
 * running every downstream step even when the gate fails. The membership
 * check (not just the presence of retry params) is what protects old saved
 * flows, whose stale retryCount params would otherwise still wrap gating
 * modules.
 */
function guardrailsFor(n: BlueprintNode): { retries: number; onError: "stop" | "continue" } | null {
  if (!GUARDRAIL_SERVICES.includes(n.module as ServiceId)) return null;
  const retries = Math.max(0, Number(n.params?.retryCount ?? "0") || 0);
  const onError = n.params?.continueOnError === "Continue" ? ("continue" as const) : ("stop" as const);
  if (retries === 0 && onError === "stop") return null;
  return { retries, onError };
}

/**
 * Wrap an emitted step body with the step comment and, when the node has a
 * non-default guardrail policy, an `attempt(...)` retry/error wrapper. The
 * body is indented into the closure; bodies never reference their step-level
 * consts outside their own lines, so closure scoping is safe.
 */
function wrapStep(n: BlueprintNode, guard: ReturnType<typeof guardrailsFor>, body: string): string {
  const comment = `  // [${n.id}] ${n.module} - ${n.action}`;
  if (!guard) return `${comment}\n${body}`;
  const indented = body
    .split("\n")
    .map((line) => (line.trim() ? "  " + line : line))
    .join("\n");
  return `${comment}
  attempt(runtime, ${JSON.stringify(n.id)}, { retries: ${guard.retries}, onError: ${JSON.stringify(guard.onError)} }, () => {
${indented}
  })`;
}

const HEADER = `// ─────────────────────────────────────────────────────────────
// Generated by Stringz (${"flowkit.blueprint/v1"})
// Stringz is tooling only. This workflow runs under YOUR Chainlink CRE
// account - keys, funds and gas are yours.
// ─────────────────────────────────────────────────────────────`;

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "flow";
}

function nodeVar(n: BlueprintNode) {
  return n.id.replace(/-/g, "_");
}

/**
 * Cron schedule for the flow: a sleep node sets the cadence, else 5 minutes.
 * Old "Delay ..." action names from saved flows stay usable as aliases.
 */
function flowSchedule(bp: Blueprint): string {
  const sleeps = bp.nodes.filter((n) => n.module === "sleep");
  if (sleeps.length > 1) {
    throw new BlueprintError("Only one schedule node per flow - remove the extra Sleep node.", "MISSING_PARAMS");
  }
  const sleep = sleeps[0];
  if (sleep) {
    if (sleep.action === "Every day" || sleep.action === "Delay 1 day") return "0 0 * * *";
    if (sleep.action === "Every hour" || sleep.action === "Delay 1 hour") return "0 * * * *";
    return "*/5 * * * *";
  }
  return "*/5 * * * *";
}

/**
 * `outputs[<id>] = {...}` line, emitted at the point a step produces its
 * values so later steps can resolve {{nodeId.key}} templates against it.
 * Entries are [key, value-expression] pairs; value expressions must be strings.
 */
function emitOutputsWrite(n: BlueprintNode, entries: [string, string][]): string {
  const inner = entries.map(([k, expr]) => `${JSON.stringify(k)}: ${expr}`).join(", ");
  return `  outputs[${JSON.stringify(n.id)}] = { ${inner} }`;
}

function emitSpineStep(n: BlueprintNode, inBundleLoop = false): string {
  const chain = (n.chain ?? "ethereum") as FlowChain;
  const selector = CHAIN_SELECTORS[chain];
  const v = nodeVar(n);
  const p = n.params ?? {};
  const guard = guardrailsFor(n);
  let body: string;
  switch (n.module) {
    case "price-feed": {
      const pair = (p.pair ?? "ETH/USD") as Pair;
      const feed = getFeedAddress(chain, pair);
      if (!feed) throw new BlueprintError(`No ${pair} feed registered on ${chain}. Pick another pair or chain.`, "MISSING_PARAMS");
      const threshold = p.threshold || "0";
      const thresholdExpr = `runtime.config.thresholds.${v} ?? ${JSON.stringify(threshold)}`;
      body = `  const ${v} = readChainlinkFeed(runtime, "${selector}", ${JSON.stringify(feed)}, ${JSON.stringify(n.action)}, ${thresholdExpr})
  if (!${v}.triggered) {
    runtime.log("${n.id}: condition not met")
    return "Condition not met"
  }
  result.push("${pair} = $" + ${v}.price)
${emitOutputsWrite(n, [["pair", JSON.stringify(pair)], ["price", `${v}.price`], ["threshold", thresholdExpr], ["triggered", `String(${v}.triggered)`]])}`;
      break;
    }
    case "wallet-balance": {
      const address = p.address ?? "";
      const amount = Number(p.amount || "0");
      const above = n.action === "Balance above";
      body = `  const ${v} = readNativeBalance(runtime, "${selector}", ${JSON.stringify(address)})
  if (!(${v} ${above ? ">" : "<"} ${amount})) {
    runtime.log("${n.id}: condition not met (balance " + ${v}.toFixed(4) + ")")
    return "Condition not met"
  }
  result.push("balance " + ${v}.toFixed(4) + " on ${selector}")
${emitOutputsWrite(n, [["chain", JSON.stringify(chain)], ["address", JSON.stringify(address)], ["balance", `${v}.toFixed(4)`], ["threshold", JSON.stringify(p.amount ?? "0")], ["triggered", `"true"`]])}`;
      break;
    }
    case "gas-price": {
      const threshold = p.thresholdGwei || "0";
      const thresholdExpr = `runtime.config.thresholds.${v} ?? ${JSON.stringify(threshold)}`;
      body = `  const ${v} = readChainlinkFeed(runtime, "ethereum-mainnet", ${JSON.stringify(GAS_FEED_ADDRESS)}, ${JSON.stringify(n.action)}, ${thresholdExpr}, 1e-9)
  if (!${v}.triggered) {
    runtime.log("${n.id}: condition not met (gas " + ${v}.price + " gwei)")
    return "Condition not met"
  }
  result.push("gas = " + ${v}.price + " gwei")
${emitOutputsWrite(n, [["gwei", `${v}.price`], ["threshold", thresholdExpr], ["triggered", `String(${v}.triggered)`], ["feed", `"chainlink-fast-gas"`]])}`;
      break;
    }
    case "trigger":
      body = `  runtime.log("${n.id}: trigger fired")
${emitOutputsWrite(n, [["bundle", inBundleLoop ? "String(bundleIndex)" : JSON.stringify(p.bundleCount ?? "1")], ["schedule", "runtime.config.schedule"]])}`;
      break;
    case "sleep":
      body = `  runtime.log("${n.id}: sleeping until next run")
${emitOutputsWrite(n, [["slept", `"true"`], ["untilNextRun", `"true"`]])}`;
      break;
    case "evm-event":
      body = `  runtime.log("${n.id}: event observed")`;
      break;
    case "contract-call": {
      const call = p.functionName ? `${p.functionName}(${p.args ?? ""})` : n.action;
      const fnEntries: [string, string][] = [["function", JSON.stringify(p.functionName ?? "")], ["args", JSON.stringify(p.args ?? "")]];
      if (n.action === "Write contract") {
        body = `  writeOnchain(runtime, "${selector}", runtime.config.contracts.${v}.receiver, runtime.config.contracts.${v}.callData)
${emitOutputsWrite(n, [...fnEntries, ["status", `"submitted"`]])}
  runtime.log(${JSON.stringify(n.id + ": ")} + ${JSON.stringify(call)} + " submitted")`;
        break;
      }
      if (n.action === "Estimate gas") {
        body = `  const ${v} = estimateGasOnChain(runtime, "${selector}", runtime.config.contracts.${v}.address, runtime.config.contracts.${v}.callData)
${emitOutputsWrite(n, [...fnEntries, ["gas", `${v}.toString()`]])}
  result.push("gas estimate: " + ${v}.toString())
  runtime.log(${JSON.stringify(n.id + ": gas ")} + ${v}.toString())`;
        break;
      }
      body = `  const ${v} = callContract(runtime, "${selector}", runtime.config.contracts.${v}.address, runtime.config.contracts.${v}.callData)
${emitOutputsWrite(n, [...fnEntries, ["result", v]])}
  runtime.log(${JSON.stringify(n.id + ": ")} + ${JSON.stringify(call)} + " -> " + ${v})`;
      break;
    }
    case "token-transfer": {
      if (n.action === "Batch send") {
        throw new BlueprintError("Batch send ships in v0.1 - split it into one Send per recipient for now.", "UNSUPPORTED_MODULE");
      }
      if (n.action === "Send native") {
        // Runtime-verified 2026-09-25 (Phase 0 spike): CRE reports carry no
        // native value and the EVM encoder rejects empty calldata, so a raw
        // "native send" cannot work. Native moves need the receiver-contract
        // (forwarder) path from the deploy-authorization work.
        throw new BlueprintError("Send native ships with the receiver-contract (forwarder) path - CRE reports carry no native value. Use Send ERC-20 for token transfers.", "UNSUPPORTED_MODULE");
      }
      const lines = [
        `  writeOnchain(runtime, "${selector}", runtime.config.contracts.${v}.receiver, runtime.config.contracts.${v}.callData)`,
      ];
      if (p.amount) lines.push(`  runtime.log("${n.id}: amount " + ${JSON.stringify(p.amount)} + " to " + runtime.config.contracts.${v}.receiver)`);
      const toEntries: [string, string][] = [["to", JSON.stringify(p.toAddress ?? "")], ["amount", JSON.stringify(p.amount ?? "")], ["status", `"submitted"`]];
      if (n.action === "Send ERC-20") {
        lines.push(emitOutputsWrite(n, [["token", JSON.stringify(p.tokenAddress ?? "native")], ...toEntries]));
      } else {
        lines.push(emitOutputsWrite(n, toEntries));
      }
      body = lines.join("\n");
      break;
    }
    case "swap": {
      const payload = { mode: n.action, ...payloadFor(n), sourceChain: selector };
      const entries: [string, string][] = [["quote", v], ["mode", JSON.stringify(n.action)]];
      if (n.action === "Swap exact out") {
        entries.splice(1, 0, ["expectedOut", `""`]);
        entries.push(["amountOut", JSON.stringify(p.amountOut ?? "")], ["slippage", JSON.stringify(p.slippage ?? "")]);
      } else if (n.action === "Limit order") {
        entries.push(["amountIn", JSON.stringify(p.amountIn ?? "")], ["limitPrice", JSON.stringify(p.limitPrice ?? "")]);
      } else {
        entries.splice(1, 0, ["expectedOut", `""`]);
        entries.push(["amountIn", JSON.stringify(p.amountIn ?? "")]);
      }
      body = `  const ${v} = httpJson(runtime, runtime.config.swapQuoteUrl, ${JSON.stringify(payload)})
${emitOutputsWrite(n, entries)}
  runtime.log("${n.id}: quote " + JSON.stringify(${v}).slice(0, 120))`;
      break;
    }
    case "ccip": {
      const destSelector = CHAIN_SELECTORS[(p.destChain ?? "ethereum") as FlowChain] ?? p.destChain;
      const payload: Record<string, string> = { action: n.action, sourceChain: selector, destChain: destSelector };
      for (const [k, val] of Object.entries(payloadFor(n))) if (k !== "message" && k !== "destChain") payload[k] = val;
      const message = p.message?.trim();
      const payloadExpr = message
        ? `{ ...${JSON.stringify(payload)}, message: resolveTemplate(outputs, ${JSON.stringify(p.message)}) }`
        : JSON.stringify(payload);
      body = `  const ${v} = httpJson(runtime, runtime.config.ccipUrl, ${payloadExpr})
${emitOutputsWrite(n, [["messageId", v], ["sourceChain", JSON.stringify(selector)], ["destChain", JSON.stringify(destSelector)]])}
  runtime.log("${n.id}: ccip " + JSON.stringify(${v}).slice(0, 120))`;
      break;
    }
    case "flow-control": {
      const sourceVar = p.source === "Variable";
      const input = sourceVar ? `flowVars[${JSON.stringify(p.variable ?? "")}] ?? ""` : `result.join(" | ")`;
      const operator = p.operator ?? "contains";
      const value = p.value ?? "";
      const valueExpr = `resolveTemplate(outputs, ${JSON.stringify(value)})`;
      const haltExpr = p.haltMessage
        ? `resolveTemplate(outputs, ${JSON.stringify(p.haltMessage)})`
        : `resolveTemplate(outputs, ${JSON.stringify(`${operator} ${value}`)})`;
      const cond = `testCondition(${v}_in, ${JSON.stringify(operator)}, ${valueExpr})`;
      const outputsLine = emitOutputsWrite(n, [["passed", `String(${v})`], ["value", `${v}_in`], ["source", JSON.stringify(p.source ?? "Previous step result")]]);
      if (n.action === "Check & log") {
        body = `  const ${v}_in = ${input}
  const ${v} = ${cond}
${outputsLine}
  runtime.log(${JSON.stringify(n.id + ": check ")} + (${v} ? "passed" : "failed") + " - " + ${haltExpr})
  result.push("check " + (${v} ? "passed" : "failed") + ": " + ${haltExpr})`;
        break;
      }
      const stopWhenTrue = n.action === "Stop if match";
      body = `  const ${v}_in = ${input}
  const ${v} = ${cond}
${outputsLine}
  if (${stopWhenTrue ? "" : "!"}${v}) {
    runtime.log(${JSON.stringify(n.id + ": halted - ")} + ${haltExpr})
    return "Filter: condition not met"
  }
  result.push("gate passed: " + ${haltExpr})`;
      break;
    }
    case "text-parser": {
      const input = p.input?.trim() ? `resolveTemplate(outputs, ${JSON.stringify(p.input)})` : `result.join(" | ")`;
      const actionResult: [string, string][] = [["action", JSON.stringify(n.action)], ["result", v]];
      if (n.action === "Replace text") {
        body = `  const ${v}_src = ${input}
  const ${v} = ${v}_src.split(resolveTemplate(outputs, ${JSON.stringify(p.find ?? "")})).join(resolveTemplate(outputs, ${JSON.stringify(p.replaceWith ?? "")}))
${emitOutputsWrite(n, actionResult)}
  result.push(${v})
  runtime.log("${n.id}: replace -> " + ${v}.slice(0, 80))`;
        break;
      }
      if (n.action === "Split text") {
        body = `  const ${v}_src = ${input}
  const ${v} = ${v}_src.split(resolveTemplate(outputs, ${JSON.stringify(p.separator ?? "")}))[Number(${JSON.stringify(p.part ?? "1")}) - 1] ?? ""
${emitOutputsWrite(n, actionResult)}
  result.push(${v})
  runtime.log("${n.id}: split -> " + ${v}.slice(0, 80))`;
        break;
      }
      const presets: Record<string, string> = {
        "Email address": "\\S+@\\S+\\.\\S+",
        "URL": "https?://\\S+",
        "Number": "-?\\d+(\\.\\d+)?",
      };
      const pattern = p.patternKind === "Custom pattern" ? (p.pattern ?? "") : (presets[p.patternKind ?? ""] ?? "\\S+");
      body = `  const ${v}_src = ${input}
  const ${v}_matches = ${v}_src.match(new RegExp(${JSON.stringify(pattern)}, "g")) ?? []
  const ${v} = ${v}_matches.join(", ")
${emitOutputsWrite(n, [["action", JSON.stringify(n.action)], ["result", v], ["matches", `JSON.stringify(${v}_matches)`]])}
  result.push(${v})
  runtime.log("${n.id}: extract -> " + ${v}_matches.length + " match(es)")`;
      break;
    }
    case "http-request": {
      const headers: Record<string, string> = {};
      for (const line of (p.headers ?? "").split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      const method = n.action === "Get JSON" ? "GET" : n.action === "Post JSON" ? "POST" : (p.method ?? "GET");
      const secret = p.secretName?.trim();
      const headerEntries = Object.entries({ "content-type": "application/json", ...headers })
        .map(([k, val]) => `${JSON.stringify(k)}: resolveTemplate(outputs, ${JSON.stringify(val)})`)
        .join(", ");
      const lines = [`  const ${v}Headers: Record<string, string> = { ${headerEntries} }`];
      if (secret) {
        lines.push(`  const ${v}Token = runtime.getSecret({ id: ${JSON.stringify(secret)} }).result().value`);
        const scheme = p.authScheme ?? "Bearer token";
        if (scheme === "Basic token") lines.push(`  ${v}Headers["authorization"] = "Basic " + bytesToBase64(new TextEncoder().encode(${v}Token))`);
        else if (scheme === "Custom header") lines.push(`  ${v}Headers[${JSON.stringify(p.authHeader || "Authorization")}] = ${v}Token`);
        else lines.push(`  ${v}Headers["authorization"] = "Bearer " + ${v}Token`);
      }
      lines.push(
        `  const ${v}Res = httpRequest(runtime, resolveTemplate(outputs, ${JSON.stringify(p.url ?? "")}), ${JSON.stringify(method)}, ${v}Headers, resolveTemplate(outputs, ${JSON.stringify(p.body ?? "")}))`,
        emitOutputsWrite(n, [["status", `String(${v}Res.status)`], ["body", `${v}Res.body`]]),
        `  result.push(${v}Res.body.slice(0, 200))`,
      );
      body = lines.join("\n");
      break;
    }
    case "telegram": {
      const method = n.action === "Send a photo" ? "sendPhoto" : n.action === "Pin a message" ? "pinChatMessage" : "sendMessage";
      const chatIdExpr = `resolveTemplate(outputs, ${JSON.stringify(p.chatId ?? "")})`;
      const lines = [`  const ${v}Token = runtime.getSecret({ id: ${JSON.stringify(secretIdFor(n) ?? "TELEGRAM_BOT_TOKEN")} }).result().value`];
      let bodyObj: string;
      let entries: [string, string][];
      if (method === "sendPhoto") {
        const photoExpr = `resolveTemplate(outputs, ${JSON.stringify(p.photoUrl ?? "")})`;
        lines.push(`  const ${v}Photo = ${photoExpr}`);
        bodyObj = `{ chat_id: ${chatIdExpr}, photo: ${v}Photo, caption: resolveTemplate(outputs, ${JSON.stringify(p.caption ?? "")}) }`;
        entries = [["ok", `"true"`], ["photo", `${v}Photo`], ["messageId", `""`]];
      } else if (method === "pinChatMessage") {
        const midExpr = `resolveTemplate(outputs, ${JSON.stringify(p.messageId ?? "0")})`;
        lines.push(`  const ${v}MessageId = ${midExpr}`);
        bodyObj = `{ chat_id: ${chatIdExpr}, message_id: Number(${v}MessageId) }`;
        entries = [["ok", `"true"`], ["pinned", `"true"`], ["messageId", `${v}MessageId`]];
      } else {
        lines.push(`  const ${v}ChatId = ${chatIdExpr}`);
        lines.push(`  const ${v}Message = resolveTemplate(outputs, ${JSON.stringify(p.message ?? "")})`);
        bodyObj = `{ chat_id: ${v}ChatId, text: ${v}Message }`;
        entries = [["ok", `"true"`], ["chatId", `${v}ChatId`], ["message", `${v}Message`], ["messageId", `""`]];
      }
      lines.push(
        `  const ${v}Body = JSON.stringify(${bodyObj})`,
        `  httpText(runtime, "https://api.telegram.org/bot" + ${v}Token + "/${method}", "POST", {}, ${v}Body)`,
        `  result.push("telegram ${method} sent")`,
        emitOutputsWrite(n, entries),
      );
      body = lines.join("\n");
      break;
    }
    case "webhooks": {
      const secret = secretIdFor(n) ?? "WEBHOOK_URL";
      if (n.action === "Send a request" || n.action === "Custom webhook") {
        // Method-aware outbound request (legacy "Custom webhook" saved flows
        // route here to honor their stored method); GET sends no body.
        const method = (p.method ?? "POST").toUpperCase();
        const requestBody = method === "GET" ? `""` : `resolveTemplate(outputs, ${JSON.stringify(p.body ?? "")})`;
        body = `  const ${v}Url = runtime.getSecret({ id: ${JSON.stringify(secret)} }).result().value
  const ${v}Res = httpRequest(runtime, ${v}Url, ${JSON.stringify(method)}, {}, ${requestBody})
  runtime.log("${n.id}: webhook " + ${v}Res.status + " via ${method}")
${emitOutputsWrite(n, [["delivered", `"true"`], ["status", `String(${v}Res.status)`], ["body", `${v}Res.body`]])}`;
        break;
      }
      // "Send a webhook" (aliases from saved flows: "Webhook response",
      // "Custom webhook", "Catch hook") - plain POST of the body or envelope.
      const fallbackBody = `JSON.stringify({ text: "Stringz: webhooks - ${n.action}. " + result.join(" | "), params: ${JSON.stringify(payloadFor(n))} })`;
      const requestBody = p.body ? `resolveTemplate(outputs, ${JSON.stringify(p.body)})` : fallbackBody;
      body = `  const ${v}Url = runtime.getSecret({ id: ${JSON.stringify(secret)} }).result().value
  const ${v}Res = httpRequest(runtime, ${v}Url, "POST", {}, ${requestBody})
  runtime.log("${n.id}: webhook posted")
${emitOutputsWrite(n, [["delivered", `"true"`], ["status", `String(${v}Res.status)`], ["body", `${v}Res.body`]])}`;
      break;
    }
    case "slack": {
      // Only "Send a message" posts to a Slack webhook URL; the other actions
      // need a bot token and the hosted runner.
      if (n.action !== "Send a message") throw cloudRunnerError(n.module, n.action);
      const secret = secretIdFor(n) ?? "SLACK_WEBHOOK_URL";
      body = `  const ${v}Url = runtime.getSecret({ id: ${JSON.stringify(secret)} }).result().value
  const ${v}Message = resolveTemplate(outputs, ${JSON.stringify(p.message ?? "")})
  const ${v}Channel = resolveTemplate(outputs, ${JSON.stringify(p.channel ?? "")}).trim()
  httpText(runtime, ${v}Url, "POST", {}, JSON.stringify({ text: ${v}Message, ...(${v}Channel ? { channel: ${v}Channel } : {}) }))
  runtime.log("${n.id}: slack notified")
${emitOutputsWrite(n, [["ok", `"true"`], ["channel", `${v}Channel`], ["message", `${v}Message`], ["ts", `""`]])}`;
      break;
    }
    case "discord": {
      // Only "Post to channel" posts to a Discord webhook URL; the other
      // actions need a bot token and the hosted runner.
      if (n.action !== "Post to channel") throw cloudRunnerError(n.module, n.action);
      const secret = secretIdFor(n) ?? "DISCORD_WEBHOOK_URL";
      body = `  const ${v}Url = runtime.getSecret({ id: ${JSON.stringify(secret)} }).result().value
  const ${v}Message = resolveTemplate(outputs, ${JSON.stringify(p.message ?? "")})
  const ${v}Username = resolveTemplate(outputs, ${JSON.stringify(p.username ?? "")}).trim()
  httpText(runtime, ${v}Url, "POST", {}, JSON.stringify({ content: ${v}Message, ...(${v}Username ? { username: ${v}Username } : {}) }))
  runtime.log("${n.id}: discord notified")
${emitOutputsWrite(n, [["ok", `"true"`], ["message", `${v}Message`], ["username", `${v}Username`], ["messageId", `""`]])}`;
      break;
    }
    case "chatgpt":
    case "youtube":
    case "canva":
    case "gmail":
    case "gdrive":
    case "notion":
    case "calendar":
    case "x":
    case "google-sheets":
      throw cloudRunnerError(n.module);
    case "variables": {
      const name = JSON.stringify(p.name ?? "");
      if (n.action === "Set variable") {
        body = `  flowVars[${name}] = resolveTemplate(outputs, ${JSON.stringify(p.value ?? "")})
${emitOutputsWrite(n, [["name", name], ["value", `flowVars[${name}]`]])}
  runtime.log(${JSON.stringify(n.id + ": set ")} + ${name} + " = " + flowVars[${name}])`;
      } else if (n.action === "Increment") {
        const amount = p.amount ?? "1";
        body = `  const ${v}Delta = Number(resolveTemplate(outputs, ${JSON.stringify(amount)})) || 0
  flowVars[${name}] = String((Number(flowVars[${name}] ?? "0") || 0) + ${v}Delta)
${emitOutputsWrite(n, [["name", name], ["value", `flowVars[${name}]`], ["delta", `String(${v}Delta)`]])}
  runtime.log(${JSON.stringify(n.id + ": increment ")} + ${name} + " -> " + flowVars[${name}])`;
      } else {
        body = `  result.push(flowVars[${name}] ?? "")
${emitOutputsWrite(n, [["name", name], ["value", `flowVars[${name}] ?? ""`]])}
  runtime.log(${JSON.stringify(n.id + ": get ")} + ${name})`;
      }
      break;
    }
    default:
      throw new BlueprintError(`Module "${n.module}" can't compile to CRE yet.`, "UNSUPPORTED_MODULE");
  }
  return wrapStep(n, guard, body);
}

/**
 * Filter/decode lines for the generated onLogTrigger. "Transfer event" logs
 * are decoded as Transfer(address,address,uint256) and checked against the
 * node's from/to/tokenId/minAmount filters; anything else just logs. The
 * trigger config already filters by topic, so non-Transfer logs should not
 * reach this handler - the empty-data/topic guards keep ERC-721 transfers
 * (value lives in topics[3]) and stray logs from crashing it.
 */
function emitLogFilterLines(n: BlueprintNode): string {
  if (n.action !== "Transfer event") {
    return `  if (log.removed) return "reorg-removed log ignored"\n` + emitOutputsWrite(n, [["txHash", "bytesToHex(log.txHash)"], ["from", `""`], ["to", `""`], ["value", `""`], ["tokenId", `""`]]) + "\n";
  }
  const p = n.params ?? {};
  const lines: string[] = [
    `  if (log.removed) return "reorg-removed log ignored"`,
    `  // Decode Transfer(address,address,uint256); topics[1]/[2] are the padded addresses. ERC-20 carries the value in data, ERC-721 in topics[3].`,
    `  const topics = log.topics.map((t) => bytesToHex(t as Uint8Array))`,
    `  const from = ("0x" + (topics[1] ?? "").slice(26)) as Address`,
    `  const to = ("0x" + (topics[2] ?? "").slice(26)) as Address`,
    `  const value = log.data.length > 0 ? BigInt(bytesToHex(log.data)) : topics[3] ? BigInt(topics[3]) : 0n`,
  ];
  const skip = (label: string) =>
    `  { runtime.log("${n.id}: filtered out (${label})"); return "filtered out" }`;
  const fromAddress = p.fromAddress?.trim().toLowerCase();
  const toAddress = p.toAddress?.trim().toLowerCase();
  const tokenId = p.tokenId?.trim();
  const minAmount = p.minAmount?.trim();
  if (fromAddress) lines.push(`  if (from.toLowerCase() !== ${JSON.stringify(fromAddress)})` + skip("from"));
  if (toAddress) lines.push(`  if (to.toLowerCase() !== ${JSON.stringify(toAddress)})` + skip("to"));
  if (tokenId) {
    lines.push(`  // tokenId set: treated as an NFT transfer, so the uint256 IS the token id.`);
    lines.push(`  if (value !== BigInt(${JSON.stringify(tokenId)}))` + skip("tokenId"));
  } else if (minAmount) {
    const d = Number(p.decimals ?? "18");
    const decimals = Number.isFinite(d) ? Math.max(0, Math.min(78, Math.trunc(d))) : 18;
    const multiplier = (10n ** BigInt(decimals)).toString();
    lines.push(`  // minAmount in whole tokens, scaled by the token's decimals (${decimals}).`);
    lines.push(`  if (value < BigInt(${JSON.stringify(minAmount)}) * ${multiplier}n)` + skip("below minAmount"));
  }
  lines.push(`  runtime.log("${n.id}: Transfer " + from + " -> " + to + " value " + value.toString())`);
  lines.push(emitOutputsWrite(n, [["txHash", "bytesToHex(log.txHash)"], ["from", "from"], ["to", "to"], ["value", "value.toString()"], ["tokenId", tokenId ? "value.toString()" : `""`]]));
  return lines.join("\n") + "\n";
}

function emitMainTs(bp: Blueprint): string {
  const spineNodes = bp.nodes;
  // "Generate bundles" with count > 1 wraps the spine in a loop. The count is
  // capped regardless of user input; "Max runs" narrows the bound when lower
  // (it cannot persist across scheduled runs of a stateless workflow).
  const bundleTrigger = spineNodes.find((n) => n.module === "trigger" && n.action === "Generate bundles");
  const bundleCount = Math.min(Math.max(1, Number(bundleTrigger?.params?.bundleCount) || 1), 25);
  const runLimit = Math.max(0, Number(bundleTrigger?.params?.limit) || 0);
  const bundleBound = runLimit > 0 ? Math.min(bundleCount, runLimit) : bundleCount;
  let body: string;
  if (bundleTrigger && bundleBound > 1) {
    const indent = (src: string) => src.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n");
    // Only the trigger step and the steps AFTER its topological position go
    // inside the loop; an entry node dragged ahead of it (sleep/evm-event)
    // stays outside and runs once, before the first bundle.
    const triggerIdx = spineNodes.findIndex((n) => n.id === bundleTrigger.id);
    const before = spineNodes.slice(0, triggerIdx).map((n) => emitSpineStep(n)).join("\n\n");
    const inside = indent(
      spineNodes
        .slice(triggerIdx)
        .map((n) => emitSpineStep(n, n.id === bundleTrigger.id))
        .join("\n\n"),
    );
    const loop = `  for (let bundleIndex = 1; bundleIndex <= ${bundleBound}; bundleIndex++) {\n${inside}\n  }`;
    body = before ? `${before}\n\n${loop}` : loop;
  } else {
    body = spineNodes.map((n) => emitSpineStep(n)).join("\n\n");
  }
  const usesGuardrails = spineNodes.some((n) => guardrailsFor(n) !== null);
  const guardrailHelper = usesGuardrails
    ? `
function attempt(runtime: Runtime<Config>, id: string, cfg: { retries: number; onError: "stop" | "continue" }, fn: () => void): void {
  let lastErr: unknown = null
  for (let i = 0; i <= cfg.retries; i++) {
    try {
      fn()
      return
    } catch (err) {
      lastErr = err
      if (i < cfg.retries) runtime.log(id + ": attempt " + (i + 1) + " failed, retrying - " + String(err))
    }
  }
  if (cfg.onError === "stop") throw lastErr
  runtime.log(id + ": failed after " + (cfg.retries + 1) + " attempt(s), continuing")
}
`
    : "";
  // An evm-event node turns the flow event-driven: the spine moves into
  // onLogTrigger and the cron tick only waits. Topics filter the trigger to
  // the chosen event; a custom signature is hashed at runtime (viem, pure JS).
  const logTrigger = bp.nodes.find((n) => n.module === "evm-event");
  const logAddress = logTrigger?.params?.contractAddress?.trim();
  const logTopic = logTrigger ? topicForEvent(logTrigger) : null;
  const logConfidence = LOG_CONFIDENCE[logTrigger?.params?.confirmations ?? "Finalized"] ?? "FINALIZED";
  const logTriggerConfig = logTrigger
    ? `logTriggerConfig({ addresses: [${JSON.stringify(logAddress ?? "")}],${logTopic ? ` topics: [[${logTopic}]],` : ""} confidence: ${JSON.stringify(logConfidence)} })`
    : "";
  const cronBody = logTrigger
    ? `  runtime.log(${JSON.stringify(logTrigger.id + ": scheduled tick - waiting for on-chain events")})
  return "Waiting for events"`
    : `${body}

  return result.length ? result.join(" | ") : "Flow executed"`;
  const logHandler = logTrigger
    ? `
const onLogTrigger = (runtime: Runtime<Config>, log: EVMLog): string => {
  const result: string[] = []
  const flowVars: Record<string, string> = {}
  const outputs: Record<string, Record<string, string>> = {}
${emitLogFilterLines(logTrigger)}  runtime.log("Log trigger fired for ${logTrigger.id} on ${logAddress ?? "configured address"}")
${body}

  return result.length ? result.join(" | ") : "Event handled"
}
`
    : "";

  return `${HEADER}
import {
  CronCapability, EVMClient, HTTPClient, getNetwork, encodeCallMsg, bytesToHex,
  bytesToBase64, consensusIdenticalAggregation, ok, prepareReportRequest, text,
  LAST_FINALIZED_BLOCK_NUMBER, logTriggerConfig, type Runtime, type EVMLog,
  type HTTPSendRequester, type HandlerEntry, Runner, handler,
} from "@chainlink/cre-sdk"
import { type Address, encodeFunctionData, decodeFunctionResult, parseAbi, toEventHash, zeroAddress } from "viem"
import { z } from "zod"

const configSchema = z.object({
  schedule: z.string(),
  thresholds: z.record(z.string(), z.string()).default({}),
  contracts: z.record(z.string(), z.object({ address: z.string(), callData: z.string(), receiver: z.string() })).default({}),
  swapQuoteUrl: z.string().default(""),
  ccipUrl: z.string().default(""),
})
type Config = z.infer<typeof configSchema>

const aggregatorV3Abi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
])

function evmClientFor(chainSelectorName: string): EVMClient {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName })
  if (!network) throw new Error("Network not found: " + chainSelectorName)
  return new EVMClient(network.chainSelector.selector)
}

function readChainlinkFeed(
  runtime: Runtime<Config>,
  chainSelectorName: string,
  feed: string | null,
  condition: string,
  threshold: string,
  scale = 1,
): { price: string; triggered: boolean } {
  if (!feed) throw new Error("No on-chain feed registered for this pair on " + chainSelectorName)
  const evmClient = evmClientFor(chainSelectorName)
  const to = feed as Address
  const read = (fn: "latestRoundData" | "decimals") =>
    evmClient.callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to,
        data: encodeFunctionData({ abi: aggregatorV3Abi, functionName: fn, args: [] }),
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    }).result()

  const decimals = decodeFunctionResult({ abi: aggregatorV3Abi, functionName: "decimals", data: bytesToHex(read("decimals").data) })
  const round = decodeFunctionResult({ abi: aggregatorV3Abi, functionName: "latestRoundData", data: bytesToHex(read("latestRoundData").data) })
  // scale converts the feed's raw units: the Fast Gas feed answers in wei per
  // gas with 0 decimals, so gas reads pass scale 1e-9 to get gwei.
  const price = (Number(round[1]) / 10 ** Number(decimals)) * scale
  const t = Number(threshold)
  // Stale or incomplete rounds must never trigger: answeredInRound < roundId
  // means the round was superseded, updatedAt 0 means it was never written.
  if (round[4] < round[0] || round[3] === 0n) {
    runtime.log("stale feed round on " + chainSelectorName + " (round " + round[0].toString() + ", answeredInRound " + round[4].toString() + ")")
    return { price: "0.00", triggered: false }
  }
  const triggered =
    condition.startsWith("Price above") || condition.startsWith("Gas above") ? price > t :
    condition.startsWith("Price below") || condition.startsWith("Gas below") ? price < t :
    condition.startsWith("Price near") || condition.startsWith("Price crosses") ? Math.abs(price - t) / t < 0.01 : true
  return { price: price.toFixed(2), triggered }
}

const multicall3Abi = parseAbi(["function getEthBalance(address addr) view returns (uint256 balance)"])

function readNativeBalance(runtime: Runtime<Config>, chainSelectorName: string, address: string): number {
  const evmClient = evmClientFor(chainSelectorName)
  const res = evmClient.callContract(runtime, {
    call: encodeCallMsg({
      from: zeroAddress,
      to: "${MULTICALL3_ADDRESS}",
      data: encodeFunctionData({ abi: multicall3Abi, functionName: "getEthBalance", args: [address as Address] }),
    }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  }).result()
  const balance = decodeFunctionResult({ abi: multicall3Abi, functionName: "getEthBalance", data: bytesToHex(res.data) })
  return Number(balance) / 1e18
}

function callContract(runtime: Runtime<Config>, chainSelectorName: string, address: string, callData: string): string {
  const evmClient = evmClientFor(chainSelectorName)
  const res = evmClient.callContract(runtime, {
    call: encodeCallMsg({ from: zeroAddress, to: address as Address, data: callData as Address }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  }).result()
  return bytesToHex(res.data)
}

function writeOnchain(runtime: Runtime<Config>, chainSelectorName: string, receiver: string, callData: string): void {
  const evmClient = evmClientFor(chainSelectorName)
  const report = runtime.report(prepareReportRequest(callData as \`0x\${string}\`)).result()
  evmClient.writeReport(runtime, { receiver: receiver as Address, report }).result()
  runtime.log("Report written to " + receiver)
}

function estimateGasOnChain(runtime: Runtime<Config>, chainSelectorName: string, address: string, callData: string): bigint {
  const evmClient = evmClientFor(chainSelectorName)
  return evmClient.estimateGas(runtime, {
    msg: encodeCallMsg({ from: zeroAddress, to: address as Address, data: callData as \`0x\${string}\` }),
  }).result().gas
}

function httpRequest(
  runtime: Runtime<Config>,
  url: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  headers: Record<string, string>,
  body: string,
): { status: number; body: string } {
  if (!url) throw new Error("Set the endpoint URL in config before running this step")
  // DON-mode request: the fetch runs per node, results reach consensus.
  // Bodies must be base64 (protobuf bytes); non-GETs opt out of the cache.
  const fetchResponse = (sendRequester: HTTPSendRequester): { status: number; body: string } => {
    const response = sendRequester
      .sendRequest({
        url,
        method,
        headers: { "content-type": "application/json", ...headers },
        ...(body ? { body: bytesToBase64(new TextEncoder().encode(body)) } : {}),
        ...(method === "GET" ? {} : { cacheSettings: { store: false } }),
      })
      .result()
    if (!ok(response)) throw new Error("HTTP " + response.statusCode)
    return { status: response.statusCode, body: text(response) }
  }
  return new HTTPClient().sendRequest(runtime, fetchResponse, consensusIdenticalAggregation<{ status: number; body: string }>())().result()
}

function httpText(
  runtime: Runtime<Config>,
  url: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  headers: Record<string, string>,
  body: string,
): string {
  return httpRequest(runtime, url, method, headers, body).body
}

function httpJson(runtime: Runtime<Config>, url: string, body: unknown): string {
  return httpText(runtime, url, "POST", {}, JSON.stringify(body))
}

function testCondition(input: string, operator: string, value: string): boolean {
  if (operator === "is greater than" || operator === "is less than") {
    const a = Number(input)
    const b = Number(value)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    return operator === "is greater than" ? a > b : a < b
  }
  if (operator === "contains") return input.includes(value)
  if (operator === "does not contain") return !input.includes(value)
  if (operator === "equals") return input === value
  return input !== value
}

/** Walk a dotted path, parsing a JSON string when a path descends into it (twin of src/lib/templateRefs.resolvePath). */
const resolvePath = (root: unknown, path: string): unknown => {
  let cur: unknown = root
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur === "string") { try { cur = JSON.parse(cur) } catch { return undefined } }
    cur = (cur as Record<string, unknown>)[seg.trim()]
  }
  return cur
}
const resolveLeaf = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v))
/** Resolve {{nodeId.field}} templates (nested + JSON-aware) against the per-node outputs map. */
const resolveTemplate = (outputs: Record<string, Record<string, string>>, s: string): string =>
  s.replace(/\\{\\{\\s*([a-zA-Z0-9_-]+)\\.([^}]+?)\\s*\\}\\}/g, (_m, id: string, key: string) =>
    outputs[id] === undefined ? "" : resolveLeaf(resolvePath(outputs[id], key)))
${guardrailHelper}
const onCronTrigger = (runtime: Runtime<Config>): string => {
  const result: string[] = []
  const flowVars: Record<string, string> = {}
  const outputs: Record<string, Record<string, string>> = {}
${cronBody}
}
${logHandler}
const initWorkflow = (config: Config) => {
  const cron = new CronCapability()
  const handlers: HandlerEntry<Config, any, any, any, any>[] = [
    handler(cron.trigger({ schedule: config.schedule }), onCronTrigger),
  ]
${logTrigger ? `  handlers.push(handler(new EVMClient(getNetwork({ chainFamily: "evm", chainSelectorName: "${CHAIN_SELECTORS[(logTrigger.chain ?? "ethereum") as FlowChain]}" })!.chainSelector.selector).logTrigger(${logTriggerConfig}), onLogTrigger))` : ""}
  return handlers
}

export async function main() {
  const runner = await Runner.newRunner({ configSchema })
  await runner.run(initWorkflow)
}
`;
}

function emitConfig(bp: Blueprint, schedule: string): string {
  const thresholds: Record<string, string> = {};
  const contracts: Record<string, { address: string; callData: string; receiver: string }> = {};
  let swapQuoteUrl = "";
  let ccipUrl = "";
  for (const n of bp.nodes) {
    const p = n.params ?? {};
    if (n.module === "price-feed") thresholds[nodeVar(n)] = p.threshold || "0";
    if (n.module === "gas-price") thresholds[nodeVar(n)] = p.thresholdGwei || "0";
    if (n.module === "contract-call") {
      const address = p.contractAddress?.trim() ?? "";
      if (!ADDRESS_RE.test(address))
        throw new BlueprintError(`Contract Call (${n.id}): "Contract address" must be a valid address.`, "MISSING_PARAMS");
      contracts[nodeVar(n)] = {
        address,
        callData: compileCallData(`Contract Call (${n.id})`, p),
        receiver: address,
      };
    }
    if (n.module === "token-transfer") {
      const label = `Token Transfer (${n.id})`;
      const to = p.toAddress?.trim() ?? "";
      if (!ADDRESS_RE.test(to))
        throw new BlueprintError(`${label}: "To" must be a valid address.`, "MISSING_PARAMS");
      if (n.action === "Batch send") {
        throw new BlueprintError("Batch send ships in v0.1 - split it into one Send per recipient for now.", "UNSUPPORTED_MODULE");
      }
      if (n.action === "Send native") {
        throw new BlueprintError("Send native ships with the receiver-contract (forwarder) path - CRE reports carry no native value. Use Send ERC-20 for token transfers.", "UNSUPPORTED_MODULE");
      }
      if (n.action === "Send ERC-20") {
        const token = p.tokenAddress?.trim() ?? "";
        if (!ADDRESS_RE.test(token))
          throw new BlueprintError(`${label}: "Token address" must be a valid address.`, "MISSING_PARAMS");
        const wei = wholeTokensToWei(p.amount ?? "0", label, Number(p.decimals ?? "18"));
        contracts[nodeVar(n)] = {
          address: token,
          callData: compileCallData(label, { abi: ERC20_TRANSFER_ABI, functionName: "transfer", args: `${to}, ${wei}` }),
          receiver: token,
        };
      } else {
        throw new BlueprintError(`${label}: unknown action "${n.action}".`, "UNSUPPORTED_MODULE");
      }
    }
    if (n.module === "swap" && !swapQuoteUrl) swapQuoteUrl = p.endpoint?.trim() ?? "";
    if (n.module === "ccip" && !ccipUrl) ccipUrl = p.endpoint?.trim() ?? "";
  }
  return JSON.stringify(
    { schedule, thresholds, contracts, swapQuoteUrl, ccipUrl },
    null,
    2
  );
}

/**
 * rpcs section for the workflow targets, so `cre workflow simulate` works
 * out of the box - the user never has to hunt for RPC URLs. One entry per
 * (chain used in the flow, public RPC), keyed by CRE chain-selector name.
 */
function emitRpcs(bp: Blueprint): string {
  const chains = [...new Set(bp.nodes.map((n) => (n.chain ?? "ethereum") as FlowChain))];
  return chains
    .flatMap((chain) =>
      PUBLIC_RPCS[chain]
        .slice(0, 2)
        .map((url) => `    - chain-name: "${CHAIN_SELECTORS[chain]}"\n      url: "${url}"`),
    )
    .join("\n");
}

/** Compile a blueprint into a complete CRE project: path -> file contents. */
export function generateCreProject(bp: Blueprint): Record<string, string> {
  const flowSlug = slug(bp.meta.name);
  const wf = `${flowSlug}-workflow`;
  const schedule = flowSchedule(bp);
  const usedSecrets = [...new Set(bp.nodes.map(secretIdFor).filter((s): s is string => !!s))];

  const files: Record<string, string> = {};

  files["project.yaml"] = `# Stringz CRE project: ${bp.meta.name}
name: "${flowSlug}"
`;

  files["secrets.yaml"] = usedSecrets.length
    ? `# Map each secret ID your app steps use to the .env variable that holds its
# value. Values live in .env (local) or the Vault DON (deployed) - Stringz never
# sees or stores them. The CRE simulator resolves the ID via this map at run time.
secretsNames:\n${usedSecrets.map((s) => `  ${s}:\n    - ${s}`).join("\n")}\n`
    : "# No app secrets required for this flow.\nsecretsNames: {}\n";

  files[".env.example"] = [
    "# Only needed for flows with on-chain writes (Token Transfer, Contract",
    "# Call write/estimate, CCIP). Read-only flows simulate without any key -",
    "# the CLI falls back to a default simulation key.",
    "CRE_ETH_PRIVATE_KEY=",
    ...usedSecrets.map((s) => `${s}=`),
    "",
  ].join("\n");

  files[".gitignore"] = [".env", "node_modules/", "dist/", ""].join("\n");

  files["README.md"] = `${HEADER.replace(/^\/\//gm, "#").replace(/─/g, "-")}
# ${bp.meta.name}

Generated by Stringz from the "${bp.meta.name}" canvas.

## Run locally (no approval needed)

\`\`\`bash
cp .env.example .env      # CRE_ETH_PRIVATE_KEY only if your flow writes on-chain; add app secrets
cd ${wf} && bun install   # installs @chainlink/cre-sdk + WASM toolchain
cd .. && cre workflow simulate ${wf} --target staging-settings
\`\`\`

## Deploy to the Chainlink DON

Deploying to a DON requires Chainlink approval - Stringz can't grant it.

1. Request access: https://docs.chain.link/cre/account/deploy-access (or \`cre account access\`)
2. Once approved: \`cre workflow deploy ${wf} --target production-settings\`

Stringz is tooling only - keys, funds, gas and secrets are always yours.
`;

  files[`${wf}/main.ts`] = emitMainTs(bp);
  files[`${wf}/config.staging.json`] = emitConfig(bp, schedule);
  files[`${wf}/config.production.json`] = emitConfig(bp, schedule);
  files[`${wf}/workflow.yaml`] = `# ${flowSlug}
staging-settings:
  user-workflow:
    workflow-name: "${flowSlug}-staging"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.staging.json"
    secrets-path: "../secrets.yaml"
  rpcs:
${emitRpcs(bp)}
production-settings:
  user-workflow:
    workflow-name: "${flowSlug}-production"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.production.json"
    secrets-path: "../secrets.yaml"
  rpcs:
${emitRpcs(bp)}
`;
  files[`${wf}/package.json`] = JSON.stringify(
    {
      name: flowSlug + "-workflow",
      private: true,
      type: "module",
      scripts: { postinstall: "bunx cre-setup" },
      dependencies: {
        "@chainlink/cre-sdk": "^1.0.0",
        viem: "^2.56.7",
        zod: "^4.3.5",
      },
      devDependencies: {
        "@types/bun": "^1.2.0",
      },
    },
    null,
    2
  );
  files[`${wf}/tsconfig.json`] = JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        skipLibCheck: true,
        types: ["bun"],
      },
      include: ["main.ts"],
    },
    null,
    2
  );

  return files;
}
