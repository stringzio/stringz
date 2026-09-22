/**
 * Per-service config field specs for the node config sheet.
 *
 * A field is plain config (text, numbers, selects) or a `secret-name` field,
 * which binds to the NAME of a variable in the user's own .env / CRE Vault.
 * FlowKit never asks for credential values (PRD §1.1: tooling only).
 *
 * This file is React-free so the CRE compiler can import it too.
 */
import type { ServiceId } from "./services";

export type FieldType = "text" | "textarea" | "number" | "select" | "secret-name";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Static list, or a resolver for options that depend on other params. */
  options?: string[] | ((params: Record<string, string>) => string[]);
  defaultValue?: string | ((params: Record<string, string>) => string);
  placeholder?: string;
  help?: string;
  /** Restrict to these action labels. Absent = show for every action. */
  actions?: string[];
  /** Extra condition beyond `actions`; evaluated against current params. */
  showIf?: (params: Record<string, string>) => boolean;
  pattern?: RegExp;
  patternMessage?: string;
  /** Value must compile as a JavaScript RegExp source (validated at export). */
  regex?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
  /** Runtime behavior only (retry/error policy): never sent to apps as a param. */
  runtimeOnly?: boolean;
}

export const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
export const ADDRESS_MESSAGE = "Enter a valid address: 0x followed by 40 hex characters.";
export const EMAIL_MESSAGE = "Enter a valid email address.";
export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
export const SECRET_NAME_MESSAGE = "Use UPPER_SNAKE_CASE, e.g. MY_APP_TOKEN.";

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const snowflakePattern = /^\d{5,25}$/;

/** Fields for one service, filtered to the action labels they apply to. */
export function getFieldsFor(service: ServiceId, action: string): FieldDef[] {
  return (SERVICE_FIELDS[service] ?? []).filter(
    (d) => !d.actions || d.actions.includes(action)
  );
}

/** Effective value of a field: stored param, else the field default. */
export function fieldValue(def: FieldDef, params: Record<string, string>): string {
  const v = params[def.key];
  if (v !== undefined && v !== "") return v;
  return typeof def.defaultValue === "function" ? def.defaultValue(params) : (def.defaultValue ?? "");
}

/** Effective option list for a select field (static or param-dependent). */
export function resolveOptions(def: FieldDef, params: Record<string, string>): string[] {
  return typeof def.options === "function" ? def.options(params) : (def.options ?? []);
}

/** True when the def is visible for the current params (action + showIf). */
export function fieldVisible(def: FieldDef, action: string, params: Record<string, string>): boolean {
  if (def.actions && !def.actions.includes(action)) return false;
  return def.showIf ? def.showIf(params) : true;
}

/** Validate one node's params. Returns a list of human-readable problems. */
export function validateNodeParams(
  service: ServiceId,
  serviceName: string,
  action: string,
  params: Record<string, string>
): string[] {
  const problems: string[] = [];
  for (const def of getFieldsFor(service, action)) {
    if (!fieldVisible(def, action, params)) continue;
    const value = fieldValue(def, params);
    if (def.required && !value.trim()) {
      problems.push(`${serviceName}: "${def.label}" is required.`);
      continue;
    }
    if (!value) continue;
    if (def.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n) || (def.integer && !Number.isInteger(n)) || (def.min !== undefined && n < def.min)) {
        problems.push(`${serviceName}: "${def.label}" must be ${def.integer ? "a whole number" : "a number"}${def.min !== undefined ? ` >= ${def.min}` : ""}.`);
        continue;
      }
      if (def.max !== undefined && n > def.max) {
        problems.push(`${serviceName}: "${def.label}" must be at most ${def.max}.`);
        continue;
      }
    }
    // Whole-value templates ("{{nodeId.key}}", optional inner whitespace)
    // resolve at runtime - pattern shapes can't match them yet. Mixed text
    // still validates normally.
    if (def.pattern && !/^\s*\{\{\s*[^{}]+\}\}\s*$/.test(value) && !def.pattern.test(value.trim())) {
      problems.push(`${serviceName}: "${def.label}" - ${def.patternMessage ?? "invalid format."}`);
    }
    if (def.regex) {
      try {
        new RegExp(value);
      } catch {
        problems.push(`${serviceName}: "${def.label}" - not a valid regular expression.`);
      }
    }
  }
  return problems;
}

const CHAIN_OPTIONS = ["ethereum", "base", "arbitrum", "optimism", "polygon", "avalanche"];
const TOKEN_OPTIONS = ["ETH", "WETH", "USDC", "USDT", "DAI", "LINK", "WBTC", "Custom"];
const LIMIT_OPTIONS = ["1", "5", "10", "25"];

/** AI Agent provider catalog: default .env secret name + models per provider. */
export const AI_PROVIDER_SECRET: Record<string, string> = {
  OpenAI: "OPENAI_API_KEY",
  Anthropic: "ANTHROPIC_API_KEY",
  Kimi: "MOONSHOT_API_KEY",
  Gemini: "GEMINI_API_KEY",
};
export const AI_MODELS: Record<string, string[]> = {
  OpenAI: ["gpt-5", "gpt-4o", "gpt-4o-mini"],
  Anthropic: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
  Kimi: ["kimi-k2-0905-preview", "kimi-k2-0711-preview", "moonshot-v1-128k"],
  Gemini: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
};

const secretHelp = "Name of the secret in your .env. Stringz never asks for the value.";

/**
 * Retry / error-policy fields shared by every module that makes an outbound
 * call. `runtimeOnly` keeps them out of app payloads; the CRE compiler turns
 * them into an `attempt(...)` wrapper around the emitted step.
 */
export const GUARDRAIL_FIELDS: FieldDef[] = [
  {
    key: "retryCount", label: "Retries on failure", type: "select",
    options: ["0", "1", "3"], defaultValue: "0", runtimeOnly: true,
    help: "How many extra attempts when the call fails. 0 runs the step once.",
  },
  {
    key: "continueOnError", label: "When this step fails", type: "select",
    options: ["Stop flow", "Continue"], defaultValue: "Stop flow", runtimeOnly: true,
    help: "Continue runs the rest of the flow and skips this step's output.",
  },
];

/**
 * Retry / error-policy fields shared by every module that makes an outbound
 * call. `runtimeOnly` keeps them out of app payloads; the CRE compiler turns
 * them into an `attempt(...)` wrapper around the emitted step.
 *
 * Condition-gating modules (price-feed, wallet-balance, gas-price,
 * flow-control) must NEVER appear here: their halt path is an early return
 * from the trigger handler, and wrapping the step in the attempt closure
 * would swallow that return and run downstream steps anyway.
 */
export const GUARDRAIL_SERVICES: ServiceId[] = [
  "webhooks", "slack", "chatgpt", "gdrive", "discord", "youtube", "gmail",
  "notion", "calendar", "x", "canva", "google-sheets", "telegram", "http-request",
  "swap", "ccip",
];

export const SERVICE_FIELDS: Partial<Record<ServiceId, FieldDef[]>> = {
  // ── web3 ──────────────────────────────────────────────────────────────────
  "evm-event": [
    { key: "contractAddress", label: "Contract address", type: "text", required: true, placeholder: "0x…", help: "The contract that emits the event.", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "confirmations", label: "Confirmations", type: "select", required: true, options: ["Finalized", "Safe (12 blocks)", "Fast (1 block)"], defaultValue: "Finalized", help: "How deep a block must be before the trigger fires." },
    { key: "fromAddress", label: "From (optional)", type: "text", actions: ["Transfer event"], placeholder: "0x…", help: "Only fire for transfers sent from this address.", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "toAddress", label: "To (optional)", type: "text", actions: ["Transfer event"], placeholder: "0x…", help: "Only fire for transfers received by this address.", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "minAmount", label: "Minimum amount", type: "number", actions: ["Transfer event"], min: 0, placeholder: "10000", help: "Whole-token amount. Applies to ERC-20 transfers." },
    { key: "decimals", label: "Token decimals", type: "number", actions: ["Transfer event"], integer: true, min: 0, defaultValue: "18", help: "Decimals of the transferred token, used to scale the Minimum amount filter." },
    { key: "tokenId", label: "Token ID (NFTs)", type: "text", actions: ["Transfer event"], placeholder: "7842", help: "Only fire when this NFT token id moves. Leave empty for any token.", pattern: /^\d+$/, patternMessage: "Digits only - the token id as listed by the collection." },
    { key: "eventSignature", label: "Event signature", type: "text", required: true, actions: ["Custom event"], placeholder: "Transfer(address indexed from, address indexed to, uint256 value)", help: "The event as written in the contract.", pattern: /^0x[0-9a-fA-F]{64}$|^[A-Za-z_]\w*\s*\([^()]*\)$/, patternMessage: "Use the event as written in the contract, e.g. Transfer(address indexed from, uint256 value) — or its 0x… topic hash." },
  ],
  "price-feed": [
    { key: "threshold", label: "Threshold (USD)", type: "number", required: true, min: 0, placeholder: "3000", help: "Price above/below: fires past this value. Price near (within 1%): fires within 1% of it." },
  ],
  "wallet-balance": [
    { key: "address", label: "Wallet address", type: "text", required: true, placeholder: "0x…", help: "The wallet whose native balance is watched.", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "amount", label: "Amount", type: "number", required: true, min: 0, placeholder: "0.5", help: "Native-token amount to compare against, e.g. 0.5 ETH." },
  ],
  "gas-price": [
    { key: "thresholdGwei", label: "Threshold (gwei)", type: "number", required: true, min: 0, placeholder: "20", help: "Reads the Chainlink Fast Gas feed on Ethereum mainnet. Gas above/below fires past this gwei value." },
  ],
  "contract-call": [
    { key: "contractAddress", label: "Contract address", type: "text", required: true, placeholder: "0x…", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "functionName", label: "Function", type: "text", required: true, placeholder: "balanceOf", help: "The contract function to call." },
    { key: "args", label: "Arguments", type: "text", placeholder: "0xabc…, 42", help: "Comma-separated values in order. Leave empty when the function takes none." },
    { key: "abi", label: "ABI", type: "textarea", required: true, placeholder: '[{"type":"function","name":"balanceOf",…}]', help: "JSON ABI of the contract. The compiler encodes the call from it, so an export without it would submit empty calldata." },
  ],
  "token-transfer": [
    { key: "tokenAddress", label: "Token address", type: "text", required: true, actions: ["Send ERC-20"], placeholder: "0x…", help: "The ERC-20 token contract.", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "tokenAddress", label: "Token address (optional)", type: "text", actions: ["Batch send"], placeholder: "0x…", help: "Leave empty to send the chain's native token.", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "toAddress", label: "To", type: "text", required: true, actions: ["Send ERC-20", "Send native"], placeholder: "0x…", help: "Recipient wallet or contract. To move native currency (ETH etc.), use the Send native action here - contract-call writes cannot carry native value in CRE.", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "amount", label: "Amount", type: "number", required: true, actions: ["Send ERC-20", "Send native"], min: 0, placeholder: "25", help: "Whole-token amount (e.g. 25 = 25 tokens). Native sends use 18 decimals; ERC-20 uses the Decimals field below." },
    { key: "decimals", label: "Token decimals", type: "number", required: true, actions: ["Send ERC-20"], integer: true, min: 0, max: 36, defaultValue: "18", help: "Decimals of THIS token — USDC/USDT use 6, most others 18. A wrong value sends the wrong amount on-chain, so confirm it (e.g. on the token's explorer page)." },
    { key: "recipients", label: "Recipients", type: "textarea", required: true, actions: ["Batch send"], placeholder: "0x…, 10", help: "One transfer per line: address, amount." },
  ],
  ccip: [
    { key: "endpoint", label: "Adapter endpoint", type: "text", required: true, runtimeOnly: true, placeholder: "https://your-adapter.example.com/ccip", pattern: /^https:\/\//i, patternMessage: "Must start with https://", help: "URL of your CCIP adapter: the HTTP endpoint that executes the CCIP instruction (send, message or token bridge) and returns the result. The workflow POSTs the instruction there." },
    { key: "destChain", label: "To chain", type: "select", required: true, options: CHAIN_OPTIONS, defaultValue: "base" },
    { key: "toAddress", label: "Recipient", type: "text", required: true, actions: ["Cross-chain send", "Bridge tokens"], placeholder: "0x…", help: "Wallet or contract on the destination chain.", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "amount", label: "Amount", type: "number", required: true, actions: ["Cross-chain send", "Bridge tokens"], min: 0, placeholder: "0.05", help: "Native token that arrives on the destination chain." },
    { key: "contractAddress", label: "Destination contract", type: "text", required: true, actions: ["Cross-chain message"], placeholder: "0x…", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "message", label: "Message", type: "textarea", required: true, actions: ["Cross-chain message"], placeholder: "Hello from Stringz", help: "Plain text, or 0x-prefixed hex for machine payloads." },
    { key: "tokenAddress", label: "Token address", type: "text", required: true, actions: ["Bridge tokens"], placeholder: "0x…", help: "The token on the source chain.", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
  ],
  swap: [
    { key: "endpoint", label: "Adapter endpoint", type: "text", required: true, runtimeOnly: true, placeholder: "https://your-adapter.example.com/quote", pattern: /^https:\/\//i, patternMessage: "Must start with https://", help: "URL of your swap adapter: the HTTP endpoint that receives the order details and returns a quote. The workflow POSTs to it on every run." },
    { key: "tokenIn", label: "Token in", type: "select", required: true, options: TOKEN_OPTIONS, defaultValue: "ETH" },
    { key: "tokenOut", label: "Token out", type: "select", required: true, options: TOKEN_OPTIONS, defaultValue: "USDC", help: "Token to receive. Must differ from token in." },
    { key: "tokenInAddress", label: "Token in address", type: "text", required: true, placeholder: "0x…", help: "Address of your custom token.", showIf: (p) => p.tokenIn === "Custom", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "tokenOutAddress", label: "Token out address", type: "text", required: true, placeholder: "0x…", help: "Address of your custom token.", showIf: (p) => p.tokenOut === "Custom", pattern: ADDRESS_PATTERN, patternMessage: ADDRESS_MESSAGE },
    { key: "amountIn", label: "Amount in", type: "number", required: true, actions: ["Swap exact in", "Limit order"], min: 0.0001, placeholder: "1", help: "How much tokenIn to sell." },
    { key: "amountOut", label: "Amount out", type: "number", required: true, actions: ["Swap exact out"], min: 0.0001, placeholder: "3000", help: "Exactly how much tokenOut you want to receive." },
    { key: "slippage", label: "Slippage", type: "select", required: true, actions: ["Swap exact in", "Swap exact out"], options: ["0.1%", "0.5%", "1%", "3%"], defaultValue: "0.5%" },
    { key: "limitPrice", label: "Limit price", type: "number", required: true, actions: ["Limit order"], min: 0, placeholder: "3000", help: "Price of one tokenIn in tokenOut; 3000 means sell only at 3000 USDC or better." },
    { key: "expiry", label: "Expires in", type: "select", required: true, actions: ["Limit order"], options: ["1 hour", "1 day", "7 days", "30 days"], defaultValue: "7 days" },
  ],

  // ── comms ─────────────────────────────────────────────────────────────────
  slack: [
    { key: "secretName", label: "Slack credential", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, actions: ["Send a message"], defaultValue: "SLACK_WEBHOOK_URL", help: secretHelp },
    { key: "secretName", label: "Slack credential", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, actions: ["Get a user", "Create a channel"], defaultValue: "SLACK_BOT_TOKEN", help: secretHelp },
    { key: "user", label: "User", type: "text", required: true, actions: ["Get a user"], placeholder: "@username or U0123ABC", help: "Find the ID under a user's profile in Slack." },
    { key: "channel", label: "Channel", type: "text", required: true, actions: ["Send a message"], placeholder: "#alerts", help: "Channel the message posts to.", pattern: /^#[a-z0-9_-]{1,40}$/i, patternMessage: "Start with # followed by 1-40 letters, numbers, dashes or underscores." },
    { key: "message", label: "Message", type: "textarea", required: true, actions: ["Send a message"], help: "Use {{nodeId.field}} to map data from earlier nodes - open a node's Run data to see its fields." },
    { key: "channelName", label: "Channel name", type: "text", required: true, actions: ["Create a channel"], placeholder: "oncall-alerts", help: "Lowercase, no spaces or #.", pattern: /^[a-z0-9_-]{1,80}$/, patternMessage: "Lowercase letters, numbers, dashes and underscores only." },
    { key: "topic", label: "Topic", type: "text", actions: ["Create a channel"], help: "One line shown in the channel header." },
  ],
  discord: [
    { key: "secretName", label: "Discord credential", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, actions: ["Post to channel"], defaultValue: "DISCORD_WEBHOOK_URL", help: secretHelp },
    { key: "secretName", label: "Discord credential", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, actions: ["Get a message", "Add a role"], defaultValue: "DISCORD_BOT_TOKEN", help: secretHelp },
    { key: "channelId", label: "Channel", type: "text", required: true, actions: ["Get a message"], help: "Right-click the channel in Discord and choose Copy Channel ID (enable Developer Mode in settings).", pattern: snowflakePattern, patternMessage: "Digits only (a Discord channel ID)." },
    { key: "limit", label: "Messages to fetch", type: "select", required: true, actions: ["Get a message"], options: LIMIT_OPTIONS, defaultValue: "5" },
    { key: "message", label: "Message", type: "textarea", required: true, actions: ["Post to channel"], help: "Mention roles with @name; use {{nodeId.field}} to map data from earlier nodes." },
    { key: "username", label: "Bot display name", type: "text", actions: ["Post to channel"], placeholder: "Stringz Alerts", help: "Shown as the sender. Falls back to the webhook's default name." },
    { key: "serverId", label: "Server", type: "text", actions: ["Add a role"], help: "Right-click the server icon and Copy Server ID. Leave empty to use the server your bot token belongs to.", pattern: snowflakePattern, patternMessage: "Digits only (a Discord server ID)." },
    { key: "user", label: "User", type: "text", required: true, actions: ["Add a role"], placeholder: "@username or user ID" },
    { key: "role", label: "Role", type: "text", required: true, actions: ["Add a role"], placeholder: "Whale Watcher or role ID" },
  ],
  gmail: [
    { key: "secretName", label: "Gmail credential", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, defaultValue: "GMAIL_ACCESS_TOKEN", help: "Name of the secret holding your OAuth access token. " + secretHelp },
    { key: "to", label: "To", type: "text", required: true, actions: ["Send an email"], placeholder: "alice@example.com", help: "Comma-separated addresses allowed.", pattern: new RegExp(`^${emailPattern.source}(,\\s*${emailPattern.source})*$`), patternMessage: EMAIL_MESSAGE },
    { key: "subject", label: "Subject", type: "text", required: true, actions: ["Send an email"] },
    { key: "body", label: "Body", type: "textarea", required: true, actions: ["Send an email"], help: "Plain text. Use {{nodeId.field}} to insert data from earlier nodes." },
    { key: "mailbox", label: "Mailbox", type: "select", required: true, actions: ["Watch emails"], options: ["INBOX", "SPAM", "TRASH", "SENT", "ALL_MAIL"], defaultValue: "INBOX", help: "Checked for new mail on each run." },
    { key: "from", label: "From", type: "text", actions: ["Watch emails"], placeholder: "billing@stripe.com", help: "Only emails from this address.", pattern: emailPattern, patternMessage: EMAIL_MESSAGE },
    { key: "subjectContains", label: "Subject contains", type: "text", actions: ["Watch emails"], help: "Only emails whose subject includes this text." },
    { key: "maxResults", label: "Max emails", type: "select", required: true, actions: ["Watch emails"], options: LIMIT_OPTIONS, defaultValue: "10" },
    { key: "messageId", label: "Email", type: "text", required: true, actions: ["Add a label"], help: "Use the message ID output from a Watch emails step earlier in this flow." },
    { key: "label", label: "Label", type: "select", required: true, actions: ["Add a label"], options: ["IMPORTANT", "UNREAD", "STARRED", "SPAM", "TRASH", "INBOX"], defaultValue: "IMPORTANT", help: "System labels. Custom label names coming soon." },
  ],
  webhooks: [
    { key: "secretName", label: "Webhook credential", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, defaultValue: "WEBHOOK_URL", help: "Name of the .env variable holding your webhook URL. Stringz never asks for the URL itself." },
    { key: "body", label: "Body", type: "textarea", actions: ["Send a webhook", "Send a request", "Webhook response", "Custom webhook", "Catch hook"], help: "Send a webhook: leave empty to send the combined result of the previous steps. Send a request: sent as-is and ignored for GET." },
    { key: "method", label: "Method", type: "select", required: true, actions: ["Send a request", "Custom webhook"], options: ["POST", "GET", "PUT", "PATCH", "DELETE"], defaultValue: "POST" },
  ],
  telegram: [
    { key: "secretName", label: "Bot token secret", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, defaultValue: "TELEGRAM_BOT_TOKEN", help: "Your bot token from @BotFather, stored in your own .env. The value is never asked for here." },
    { key: "chatId", label: "Chat ID", type: "text", required: true, placeholder: "-1001234567890 or @mychannel", help: "Message @userinfobot to get your id.", pattern: /^-?\d+$|^@[a-zA-Z0-9_]{4,31}$/, patternMessage: "Digits with an optional leading -, or a @channel name (at least 5 characters total)." },
    { key: "message", label: "Message", type: "textarea", required: true, actions: ["Send a message"], placeholder: "Whale alert: {{nodeId.value}} tokens moved.", help: "Use {{nodeId.field}} to map data from earlier nodes." },
    { key: "photoUrl", label: "Photo URL", type: "text", required: true, actions: ["Send a photo"], placeholder: "https://.../chart.png", pattern: /^https:\/\//, patternMessage: "Must start with https://" },
    { key: "caption", label: "Caption", type: "textarea", actions: ["Send a photo"], help: "Short text under the photo." },
    { key: "messageId", label: "Message ID", type: "number", required: true, actions: ["Pin a message"], integer: true, min: 1, help: "The id of a message sent earlier in this chat." },
  ],

  // ── google + productivity ─────────────────────────────────────────────────
  gdrive: [
    { key: "secretName", label: "Credential secret", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, defaultValue: "GOOGLE_SERVICE_ACCOUNT_KEY", help: "Name of the secret holding your Google service account key. " + secretHelp },
    { key: "fileName", label: "File name", type: "text", required: true, actions: ["Upload a file"], placeholder: "report-2026-09.pdf", help: "Name the file gets in Drive." },
    { key: "mimeType", label: "File type", type: "select", required: true, actions: ["Upload a file"], options: ["Auto-detect", "text/plain", "text/csv", "application/pdf", "image/png", "application/json"], defaultValue: "Auto-detect" },
    { key: "folderId", label: "Folder ID", type: "text", actions: ["Upload a file", "Watch files"], help: "Drive ID of the target folder. Leave empty for My Drive." },
    { key: "content", label: "File content", type: "textarea", required: true, actions: ["Upload a file"], help: "Text written into the file. For binary files, supply a public URL from an upstream step instead." },
    { key: "eventType", label: "Watch for", type: "select", required: true, actions: ["Watch files"], options: ["Created", "Modified", "Created or modified"], defaultValue: "Created" },
    { key: "maxResults", label: "Max files per run", type: "number", actions: ["Watch files"], integer: true, min: 1, placeholder: "10", help: "Most recent matching files reported each run." },
    { key: "folderId", label: "Folder ID", type: "text", required: true, actions: ["Share a folder"], help: "ID of the folder to share." },
    { key: "shareWith", label: "Share with", type: "text", required: true, actions: ["Share a folder"], placeholder: "teammate@gmail.com", help: "Email of the person or group to add.", pattern: emailPattern, patternMessage: EMAIL_MESSAGE },
    { key: "role", label: "Role", type: "select", required: true, actions: ["Share a folder"], options: ["Viewer", "Commenter", "Editor"], defaultValue: "Viewer" },
  ],
  "google-sheets": [
    { key: "secretName", label: "Credential secret", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, defaultValue: "GOOGLE_SERVICE_ACCOUNT_KEY", help: "Name of the secret holding your Google service-account key. Same secret the Drive module uses. " + secretHelp },
    { key: "spreadsheetId", label: "Spreadsheet ID", type: "text", required: true, placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms", help: "From the sheet URL: the long string between /d/ and /edit.", pattern: /^[^\s/]+$/, patternMessage: "Copy only the id between /d/ and /edit, not the whole URL." },
    { key: "sheet", label: "Sheet tab", type: "text", required: true, defaultValue: "Sheet1", help: "The tab name at the bottom of the sheet." },
    { key: "values", label: "Row values", type: "textarea", required: true, actions: ["Add a row", "Update a row"], help: "One cell per line, in column order." },
    { key: "rowNumber", label: "Row number", type: "number", required: true, actions: ["Update a row"], integer: true, min: 1, placeholder: "2", help: "1 is the header row." },
    { key: "range", label: "Range", type: "text", actions: ["Get rows"], placeholder: "A1:C50", help: "Leave empty to read the whole tab." },
    { key: "maxRows", label: "Max rows", type: "number", actions: ["Get rows"], integer: true, min: 1, placeholder: "10", help: "How many rows to read." },
  ],
  youtube: [
    { key: "secretName", label: "Credential secret", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, defaultValue: "GOOGLE_SERVICE_ACCOUNT_KEY", help: secretHelp },
    { key: "keywords", label: "Keywords", type: "text", required: true, actions: ["Find by keywords"], placeholder: "Chainlink CRE tutorial" },
    { key: "order", label: "Sort by", type: "select", required: true, actions: ["Find by keywords"], options: ["Relevance", "Upload date", "View count", "Rating"], defaultValue: "Relevance" },
    { key: "maxResults", label: "Max results", type: "number", actions: ["Find by keywords", "Watch comments"], integer: true, min: 1, max: 25, placeholder: "5", help: "Between 1 and 25." },
    { key: "title", label: "Title", type: "text", required: true, actions: ["Upload a video"], placeholder: "Weekly recap from my flow" },
    { key: "description", label: "Description", type: "textarea", actions: ["Upload a video"] },
    { key: "privacy", label: "Privacy", type: "select", required: true, actions: ["Upload a video"], options: ["Private", "Unlisted", "Public"], defaultValue: "Private", help: "Safer default for automated uploads." },
    { key: "sourceUrl", label: "Video file URL", type: "text", required: true, actions: ["Upload a video"], placeholder: "https://.../video.mp4", help: "Publicly reachable URL of the video file; the workflow fetches it and uploads it to your channel.", pattern: /^https:\/\//, patternMessage: "Must start with https://" },
    { key: "videoId", label: "Video ID", type: "text", required: true, actions: ["Watch comments"], placeholder: "dQw4w9WgXcQ", help: "The part after v= in the video URL.", pattern: /^[A-Za-z0-9_-]{11}$/, patternMessage: "Exactly 11 characters." },
    { key: "includeReplies", label: "Replies", type: "select", required: true, actions: ["Watch comments"], options: ["Top-level only", "Include replies"], defaultValue: "Top-level only" },
  ],
  calendar: [
    { key: "secretName", label: "Credential secret", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, defaultValue: "GOOGLE_SERVICE_ACCOUNT_KEY", help: secretHelp },
    { key: "calendarId", label: "Calendar", type: "text", defaultValue: "primary", help: "Leave as primary for your main calendar." },
    { key: "summary", label: "Event title", type: "text", required: true, actions: ["Create an event"], placeholder: "Team standup" },
    { key: "startTime", label: "Starts", type: "text", required: true, actions: ["Create an event"], placeholder: "2026-09-20T14:00:00Z", help: "ISO 8601, interpreted as UTC." },
    { key: "endTime", label: "Ends", type: "text", required: true, actions: ["Create an event"], placeholder: "2026-09-20T14:30:00Z", help: "ISO 8601, UTC." },
    { key: "location", label: "Location", type: "text", actions: ["Create an event"] },
    { key: "description", label: "Description", type: "textarea", actions: ["Create an event"] },
    { key: "attendees", label: "Attendees", type: "text", actions: ["Create an event"], placeholder: "ana@acme.com, bo@acme.com", help: "Comma-separated email addresses.", pattern: new RegExp(`^${emailPattern.source}(,\\s*${emailPattern.source})*$`), patternMessage: EMAIL_MESSAGE },
    { key: "notifyAttendees", label: "Invitations", type: "select", required: true, actions: ["Create an event"], options: ["Send invitations", "Skip"], defaultValue: "Send invitations" },
    { key: "window", label: "Time window", type: "select", required: true, actions: ["List events"], options: ["Next 24 hours", "Next 7 days", "Next 30 days"], defaultValue: "Next 7 days" },
    { key: "maxResults", label: "Max events", type: "number", actions: ["List events"], integer: true, min: 1, placeholder: "10" },
    { key: "eventId", label: "Event ID", type: "text", required: true, actions: ["Delete an event"], help: "ID of the event to delete, typically from a List events step." },
  ],
  notion: [
    { key: "secretName", label: "Credential secret", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, defaultValue: "NOTION_API_KEY", help: "Name of the secret holding your Notion integration token. Create it at notion.so/my-integrations. " + secretHelp },
    { key: "parentType", label: "Create under", type: "select", required: true, actions: ["Create a page"], options: ["Database", "Page"], defaultValue: "Database" },
    { key: "parentId", label: "Parent ID", type: "text", required: true, actions: ["Create a page"], help: "ID of the database or page from its Notion URL (last part of the address)." },
    { key: "title", label: "Page title", type: "text", required: true, actions: ["Create a page"] },
    { key: "content", label: "Content", type: "textarea", actions: ["Create a page"], help: "Plain text added as the page body." },
    { key: "databaseId", label: "Database ID", type: "text", required: true, actions: ["Update database"], help: "From the database URL." },
    { key: "pageId", label: "Row (page) ID", type: "text", required: true, actions: ["Update database"], help: "The database row to update, from a Search pages step." },
    { key: "property", label: "Property", type: "text", required: true, actions: ["Update database"], placeholder: "Status", help: "Name of the database property to set." },
    { key: "value", label: "New value", type: "text", required: true, actions: ["Update database"], placeholder: "Done", help: "The value to write." },
    { key: "query", label: "Search for", type: "text", required: true, actions: ["Search pages"], placeholder: "Q3 roadmap" },
    { key: "filter", label: "Result type", type: "select", required: true, actions: ["Search pages"], options: ["Pages and databases", "Pages only", "Databases only"], defaultValue: "Pages and databases" },
    { key: "sort", label: "Sort by", type: "select", required: true, actions: ["Search pages"], options: ["Last edited", "Created"], defaultValue: "Last edited" },
    { key: "maxResults", label: "Max results", type: "number", actions: ["Search pages"], integer: true, min: 1, placeholder: "10" },
  ],
  canva: [
    { key: "secretName", label: "Credential secret", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, defaultValue: "CANVA_API_TOKEN", help: secretHelp },
    { key: "designType", label: "Design type", type: "select", required: true, actions: ["Create a design"], options: ["Instagram Post", "Instagram Story", "Presentation", "Poster", "Logo", "A4 Document"], defaultValue: "Instagram Post" },
    { key: "title", label: "Design name", type: "text", required: true, actions: ["Create a design"], placeholder: "Launch teaser" },
    { key: "templateId", label: "Template ID", type: "text", actions: ["Create a design"], help: "Start from a template, typically from a List templates step." },
    { key: "designId", label: "Design ID", type: "text", required: true, actions: ["Export a design"], help: "Canva design ID, typically from a Create a design step." },
    { key: "format", label: "Format", type: "select", required: true, actions: ["Export a design"], options: ["PDF", "PNG", "JPG", "MP4"], defaultValue: "PNG" },
    { key: "category", label: "Category", type: "select", required: true, actions: ["List templates"], options: ["All", "Social media", "Presentation", "Poster", "Marketing", "Video"], defaultValue: "All" },
    { key: "keywords", label: "Keywords", type: "text", actions: ["List templates"], placeholder: "launch" },
    { key: "maxResults", label: "Max templates", type: "number", actions: ["List templates"], integer: true, min: 1, placeholder: "10" },
  ],

  // ── ai + social + utility ─────────────────────────────────────────────────
  chatgpt: [
    { key: "provider", label: "Provider", type: "select", required: true, options: ["OpenAI", "Anthropic", "Kimi", "Gemini"], defaultValue: "OpenAI", help: "Which AI provider answers this step. The API key stays in your .env." },
    {
      key: "secretName", label: "API key secret", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE,
      defaultValue: (p) => AI_PROVIDER_SECRET[p.provider ?? "OpenAI"] ?? "OPENAI_API_KEY",
      help: "Name of the secret in your .env that holds this provider's key. " + secretHelp,
    },
    {
      key: "model", label: "Model", type: "select", required: true,
      options: (p) => AI_MODELS[p.provider ?? "OpenAI"] ?? AI_MODELS.OpenAI,
      defaultValue: (p) => (AI_MODELS[p.provider ?? "OpenAI"] ?? AI_MODELS.OpenAI)[0],
      help: "Models available for the chosen provider.",
    },
    { key: "imageUrl", label: "Image URL", type: "text", required: true, actions: ["Edit an image"], placeholder: "https://...", help: "Publicly reachable URL of the image to edit.", pattern: /^https:\/\//, patternMessage: "Must start with https://" },
    { key: "prompt", label: "Edit instructions", type: "textarea", required: true, actions: ["Edit an image"], placeholder: "Make the background a sunset and remove the logo", help: "Describe the change you want, in plain words." },
    { key: "prompt", label: "Prompt", type: "textarea", required: true, actions: ["Send a prompt"], placeholder: "You are a DeFi analyst. Summarize the bundle below…", help: "Mention 'the bundle' to use data from earlier steps." },
    { key: "text", label: "Text to summarize", type: "textarea", required: true, actions: ["Summarize text"], placeholder: "Paste or describe the text…" },
    { key: "summaryLength", label: "Summary length", type: "select", required: true, actions: ["Summarize text"], options: ["short", "medium", "detailed"], defaultValue: "medium" },
  ],
  x: [
    { key: "secretName", label: "X API token secret", type: "secret-name", required: true, pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, defaultValue: "X_API_BEARER_TOKEN", help: secretHelp },
    { key: "text", label: "Tweet text", type: "textarea", required: true, actions: ["Post a tweet"], help: "The workflow result is appended automatically if you leave room. Max 280 characters." },
    { key: "replyToTweetId", label: "Reply to tweet ID", type: "text", actions: ["Post a tweet"], placeholder: "1834…", help: "Optional. ID of the tweet to reply to, if you want a thread." },
    { key: "handle", label: "From account", type: "text", required: true, actions: ["Watch tweets"], placeholder: "chainlink", help: "Username without the @ sign.", pattern: /^[A-Za-z0-9_]{1,15}$/, patternMessage: "1-15 letters, numbers or underscores." },
    { key: "keywords", label: "Keywords", type: "text", actions: ["Watch tweets"], placeholder: "mainnet, launch", help: "Comma-separated. Tweets must contain at least one; leave empty to accept all tweets from the account." },
    { key: "query", label: "Search query", type: "text", required: true, actions: ["Search tweets"], placeholder: "Chainlink CCIP launch" },
    { key: "resultCount", label: "Results", type: "select", required: true, actions: ["Search tweets"], options: ["10", "25", "50", "100"], defaultValue: "25" },
  ],
  trigger: [
    { key: "bundleCount", label: "Number of bundles", type: "number", required: true, actions: ["Generate bundles"], integer: true, min: 1, defaultValue: "1", help: "How many times the rest of the flow runs per trigger fire. Use 1 unless you want to repeat the flow for a list." },
    { key: "limit", label: "Max runs (0 = unlimited)", type: "number", actions: ["Generate bundles"], integer: true, min: 0, defaultValue: "0", help: "Caps runs within a single scheduled execution - the count cannot persist across runs of a stateless workflow. 0 means no cap." },
  ],
  variables: [
    { key: "name", label: "Variable name", type: "text", required: true, placeholder: "lastPrice", help: "CamelCase name you set with the Set variable module.", pattern: /^[A-Za-z_][A-Za-z0-9_]*$/, patternMessage: "Letters, numbers and underscores; cannot start with a number." },
    { key: "value", label: "Value", type: "text", required: true, actions: ["Set variable"], placeholder: "0 or any text", help: "Stored as text. Later steps read it as a string." },
    { key: "amount", label: "Increment by", type: "number", required: true, actions: ["Increment"], integer: true, defaultValue: "1", help: "Whole number. Use a negative value to decrement." },
  ],

  // ── new: flow control, parsing, sheets, http, telegram ────────────────────
  "flow-control": [
    { key: "source", label: "Test against", type: "select", required: true, options: ["Previous step result", "Variable"], defaultValue: "Previous step result", help: "Which value the condition checks." },
    { key: "variable", label: "Variable name", type: "text", required: true, placeholder: "lastPrice", help: "Name set by a Variables module earlier in the flow.", showIf: (p) => p.source === "Variable" },
    { key: "operator", label: "Condition", type: "select", required: true, options: ["contains", "does not contain", "equals", "does not equal", "is greater than", "is less than"], defaultValue: "contains", help: "Greater/less compare numbers; the rest compare text." },
    { key: "value", label: "Value", type: "text", required: true, placeholder: "2500 or confirmed", help: "Use a plain number for greater/less than." },
    { key: "haltMessage", label: "Note when halted", type: "text", actions: ["Continue if match", "Stop if match"], placeholder: "Price already above target.", help: "Logged when the flow stops at this gate." },
  ],
  "text-parser": [
    { key: "input", label: "Text", type: "textarea", help: "Leave blank to use the previous step's result." },
    { key: "find", label: "Find", type: "text", required: true, actions: ["Replace text"], defaultValue: ",", help: "The exact text to search for." },
    { key: "replaceWith", label: "Replace with", type: "text", actions: ["Replace text"], help: "Leave blank to delete matches." },
    { key: "separator", label: "Separator", type: "text", required: true, actions: ["Split text"], placeholder: ", or \\n", help: "Where the text gets cut." },
    { key: "part", label: "Keep part #", type: "number", required: true, actions: ["Split text"], integer: true, min: 1, defaultValue: "1", help: "1 is the first piece before the separator." },
    { key: "patternKind", label: "Extract", type: "select", required: true, actions: ["Extract pattern"], options: ["Email address", "URL", "Number", "Custom pattern"], defaultValue: "Email address" },
    { key: "pattern", label: "Custom pattern", type: "text", required: true, actions: ["Extract pattern"], placeholder: "TX (\\w+)", help: "A regular expression.", showIf: (p) => p.patternKind === "Custom pattern", regex: true },
  ],
  "http-request": [
    { key: "url", label: "URL", type: "text", required: true, placeholder: "https://api.example.com/v1/status", pattern: /^https:\/\//i, patternMessage: "Must start with https://" },
    { key: "method", label: "Method", type: "select", required: true, actions: ["Make a request"], options: ["GET", "POST", "PUT", "PATCH", "DELETE"], defaultValue: "GET" },
    { key: "headers", label: "Headers", type: "textarea", placeholder: "Authorization: …", help: "One per line as Name: value." },
    { key: "body", label: "JSON body", type: "textarea", actions: ["Post JSON"], placeholder: '{"hello":"world"}', help: "Sent as the request body." },
    { key: "body", label: "JSON body", type: "textarea", actions: ["Make a request"], placeholder: '{"hello":"world"}', help: "Sent as the request body.", showIf: (p) => p.method !== "GET" },
    { key: "secretName", label: "Auth token secret", type: "secret-name", pattern: SECRET_NAME_PATTERN, patternMessage: SECRET_NAME_MESSAGE, help: "Optional. Name of a secret in your .env. Leave blank for no auth. Its value is never stored in the flow." },
    { key: "authScheme", label: "Auth style", type: "select", required: true, options: ["Bearer token", "Basic token", "Custom header"], defaultValue: "Bearer token", help: "How the secret value is attached. Basic token: put user:password in your .env - Stringz base64-encodes it for you.", showIf: (p) => !!p.secretName?.trim() },
    { key: "authHeader", label: "Header name", type: "text", required: true, defaultValue: "Authorization", placeholder: "X-API-Key", help: "The header that carries the secret value.", showIf: (p) => !!p.secretName?.trim() && p.authScheme === "Custom header" },
  ],
};

for (const id of GUARDRAIL_SERVICES) {
  const fields = SERVICE_FIELDS[id];
  if (fields) fields.push(...GUARDRAIL_FIELDS);
}
