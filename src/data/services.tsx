import React from "react";

export type ServiceId =
  | "webhooks"
  | "slack"
  | "chatgpt"
  | "gdrive"
  | "discord"
  | "youtube"
  | "gmail"
  | "notion"
  | "calendar"
  | "x"
  | "canva"
  | "trigger"
  | "sleep"
  | "variables"
  // flow control + parsing
  | "flow-control"
  | "text-parser"
  // connectors
  | "google-sheets"
  | "http-request"
  | "telegram"
  // web3
  | "evm-event"
  | "price-feed"
  | "wallet-balance"
  | "gas-price"
  | "contract-call"
  | "token-transfer"
  | "ccip"
  | "swap";

export type Chain = "ethereum" | "base" | "arbitrum" | "optimism" | "polygon" | "avalanche";

export const CHAINS: Record<Chain, { name: string; color: string; symbol: string }> = {
  ethereum: { name: "Ethereum", color: "#627EEA", symbol: "ETH" },
  base: { name: "Base", color: "#0052FF", symbol: "ETH" },
  arbitrum: { name: "Arbitrum", color: "#28A0F0", symbol: "ETH" },
  optimism: { name: "Optimism", color: "#FF0420", symbol: "ETH" },
  polygon: { name: "Polygon", color: "#8247E5", symbol: "POL" },
  avalanche: { name: "Avalanche", color: "#E84142", symbol: "AVAX" },
};

export interface Service {
  id: ServiceId;
  name: string;
  actions: string[];
  /** One-line honesty note shown in the node sheet (e.g. sleep sets cadence). */
  description?: string;
  tint: string;
  icon: React.ReactNode;
  isWeb3?: boolean;
  needsChain?: boolean;
}

const slackIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <rect x="7.8" y="2.2" width="3.6" height="8.4" rx="1.8" fill="#36C5F0" />
    <rect x="13.4" y="2.2" width="8.4" height="3.6" rx="1.8" fill="#2EB67D" />
    <rect x="13.4" y="13.4" width="3.6" height="8.4" rx="1.8" fill="#ECB22E" />
    <rect x="2.2" y="18.2" width="8.4" height="3.6" rx="1.8" fill="#E01E5A" />
    <rect x="2.2" y="9.6" width="3.6" height="3.6" rx="1.8" fill="#36C5F0" />
    <rect x="13.4" y="7" width="3.6" height="3.6" rx="1.8" fill="#2EB67D" />
    <rect x="18.2" y="10.4" width="3.6" height="3.6" rx="1.8" fill="#ECB22E" />
    <rect x="7" y="13.4" width="3.6" height="3.6" rx="1.8" fill="#E01E5A" />
  </svg>
);

const webhookIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="12" cy="5.8" r="2.7" stroke="#E01E5A" />
    <circle cx="5.8" cy="16.4" r="2.7" stroke="#5B5FC7" />
    <circle cx="18.2" cy="16.4" r="2.7" stroke="#2EB67D" />
    <path d="M10.3 7.8 7.6 13.9M13.7 7.8l2.7 6.1M8.5 16.4h7" stroke="#3a3a3a" />
  </svg>
);

const openAIIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round">
    <path d="M13.4 3.9a3.4 3.4 0 0 1 4.6 1.3 3.4 3.4 0 0 1-.5 4.3" />
    <path d="M19.6 8.4a3.4 3.4 0 0 1 2.9 3.7 3.4 3.4 0 0 1-3.2 3.3" />
    <path d="M19.9 15.6a3.4 3.4 0 0 1-2.6 3.9 3.4 3.4 0 0 1-4.3-1.3" />
    <path d="M10.6 20.1a3.4 3.4 0 0 1-4.6-1.3 3.4 3.4 0 0 1 .5-4.3" />
    <path d="M4.4 15.6a3.4 3.4 0 0 1-2.9-3.7 3.4 3.4 0 0 1 3.2-3.3" />
    <path d="M4.1 8.4a3.4 3.4 0 0 1 2.6-3.9 3.4 3.4 0 0 1 4.3 1.3" />
  </svg>
);

const gdriveIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <path fill="#34A853" d="M8.5 3.5 3.3 12.7l2.9 4.9 5.2-9.2z" />
    <path fill="#FBBC04" d="M6.2 17.6h11.6l-2.9-4.9H9.1z" />
    <path fill="#4285F4" d="m15.5 3.5 5.2 9.2-2.9 4.9-5.2-9.2z" />
  </svg>
);

const discordIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <path
      fill="#5865F2"
      d="M19.3 5.4A16.4 16.4 0 0 0 15.2 4l-.5 1a15 15 0 0 0-5.4 0L8.8 4a16.4 16.4 0 0 0-4.1 1.4C2.1 9.4 1.3 13.3 1.6 17.1c1.7 1.3 3.4 2 5 2.6l1.1-1.8c-.6-.2-1.2-.5-1.8-.9l.4-.3c3.6 1.6 7.8 1.6 11.4 0l.4.3c-.6.4-1.2.7-1.8.9l1.1 1.8c1.6-.6 3.3-1.3 5-2.6.4-4.3-.7-8-3.1-11.7ZM8.7 14.6c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Zm6.6 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Z"
    />
  </svg>
);

const youtubeIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0000" />
    <path fill="#fff" d="m10 9 5 3-5 3z" />
  </svg>
);

const gmailIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <path fill="#4285F4" d="M3 6.5V18a2 2 0 0 0 2 2h1V9.2z" />
    <path fill="#34A853" d="M21 6.5V18a2 2 0 0 1-2 2h-1V9.2z" />
    <path fill="#FBBC04" d="M18 5.4v3.8l3-2.7V7c0-1.7-2.1-2.6-3-1.6z" />
    <path fill="#EA4335" d="M6 5.4v3.8l6 4.3 6-4.3V5.4l-6 4.3z" />
    <path fill="#C5221F" d="M6 5.4 3 7.5V7c0-1.7 2.1-2.6 3-1.6z" />
  </svg>
);

const notionIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#fff" stroke="#1a1a1a" strokeWidth="1.8" />
    <path fill="#1a1a1a" d="M8 7h2.2l5.6 8.4V7H18v10h-2.2L10.2 8.6V17H8z" />
  </svg>
);

const calendarIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <rect x="3" y="4.5" width="18" height="16" rx="3.5" fill="#fff" stroke="#1a1a1a" strokeWidth="1.8" />
    <path stroke="#1a1a1a" strokeWidth="1.8" d="M3 9.5h18" />
    <rect x="7" y="12.5" width="3.4" height="3" rx="0.8" fill="#34A853" />
    <rect x="13.5" y="12.5" width="3.4" height="3" rx="0.8" fill="#4285F4" />
  </svg>
);

const xIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <rect width="24" height="24" rx="6" fill="#0f0f0f" />
    <path d="M6 6l12 12M18 6 6 18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const canvaIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <defs>
      <linearGradient id="canva-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7D2AE8" />
        <stop offset="55%" stopColor="#00C4CC" />
        <stop offset="100%" stopColor="#8B3DFF" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="10" fill="url(#canva-g)" />
    <path
      fill="#fff"
      d="M15.6 13.1c-.5 0-.9.3-1.2.7-.4.6-1 1.5-1.7 1.5-.4 0-.6-.3-.6-.8 0-.8.5-2.4.5-3.3 0-1.2-.6-1.9-1.6-1.9-1.5 0-2.8 1.6-2.8 3.6 0 1.4.7 2.3 1.7 2.3.8 0 1.5-.5 2-1.1.2.9.9 1.4 1.7 1.4 1.5 0 2.3-1.4 2.3-2.2 0-.1-.1-.2-.3-.2Zm-4.7-.3c-.3 1.1-.8 1.6-1.2 1.6-.3 0-.5-.3-.5-.9 0-1.2.8-2.5 1.5-2.5.3 0 .4.2.4.6 0 .3-.1.8-.2 1.2Z"
    />
  </svg>
);

const triggerIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <path fill="#1a1a1a" d="M13.2 2.5 5 13.8h5.4l-1.6 7.7 8.4-11.3h-5.4z" />
  </svg>
);

const sleepIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <path fill="#4b5a68" d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z" />
    <circle cx="17" cy="6" r="1.3" fill="#9fb0bd" />
  </svg>
);

const variablesIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#fff" stroke="#4b5a68" strokeWidth="1.8" />
    <text x="12" y="16.2" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#4b5a68" fontFamily="monospace">
      {"{x}"}
    </text>
  </svg>
);

// ── web3 icons ──────────────────────────────────────────────────────────────
const evmEventIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <path fill="#627EEA" d="M12 2 6 12.2l6 3.8 6-3.8z" />
    <path fill="#4c6edb" d="M12 17.4 6 13.6l6 8.4 6-8.4z" />
  </svg>
);

const priceFeedIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <path fill="#2a5ada" d="M3 3h4.5L12 12l4.5-9H21L12 21z" opacity="0" />
    <circle cx="12" cy="12" r="10" fill="none" stroke="#2a5ada" strokeWidth="2" />
    <path fill="#2a5ada" d="M12 5.5 8 12.2l4 2.4 4-2.4z" />
    <path fill="#2a5ada" d="m12 15.4-4-2.4 4 5.4 4-5.4z" />
  </svg>
);

const walletBalanceIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <rect x="2.5" y="6" width="19" height="13" rx="3.5" fill="#fff" stroke="#1a1a1a" strokeWidth="1.8" />
    <path stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round" d="M2.5 9.5h19" opacity="0" />
    <circle cx="16.5" cy="12.5" r="1.6" fill="#2a5ada" />
    <path stroke="#2a5ada" strokeWidth="1.8" strokeLinecap="round" d="M6 12.5h5" />
  </svg>
);

const gasPriceIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" strokeLinecap="round">
    <rect x="4" y="3" width="10" height="18" rx="3" stroke="#4b5a68" strokeWidth="1.8" />
    <path d="M14 8h2.2a2.4 2.4 0 0 1 2.4 2.4V17a2 2 0 0 0 4 0V9.8" stroke="#4b5a68" strokeWidth="1.8" />
    <path d="M7 7.5h4M7 11h4M7 14.5h4" stroke="#E8A33D" strokeWidth="1.8" />
  </svg>
);

const contractCallIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <rect x="3" y="3" width="18" height="18" rx="4" fill="#1a1a1a" />
    <path stroke="#7BA488" strokeWidth="2" strokeLinecap="round" d="M7 12h4l2-3 2 6 2-3h4" />
  </svg>
);

const tokenTransferIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <circle cx="8" cy="12" r="5" fill="#F6CBD6" />
    <circle cx="16" cy="12" r="5" fill="#B9CFDD" />
    <path stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round" d="M6 12h12m0 0-2.5-2.5M18 12l-2.5 2.5" />
  </svg>
);

const ccipIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <circle cx="6" cy="12" r="4" fill="#627EEA" />
    <circle cx="18" cy="12" r="4" fill="#8247E5" />
    <path stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" d="M6 8c6 0 6 8 12 8" opacity="0" />
    <path stroke="#3F6B4F" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="3 3" d="M9 12h6" />
  </svg>
);

const swapIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <path stroke="#1a1a1a" strokeWidth="2.2" strokeLinecap="round" d="M7 4v12m0 0-3-3m3 3 3-3M17 20V8m0 0-3 3m3-3 3 3" />
  </svg>
);

// ── flow control / parsing / connector icons ────────────────────────────────
const flowControlIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" strokeLinecap="round">
    <path d="M4 7h9m4 0h3M4 12h3m4 0h9M4 17h13m4 0h-1" stroke="#b0803a" strokeWidth="1.8" />
    <circle cx="15" cy="7" r="2.2" fill="#FDF3E3" stroke="#b0803a" strokeWidth="1.8" />
    <circle cx="9" cy="12" r="2.2" fill="#FDF3E3" stroke="#b0803a" strokeWidth="1.8" />
    <circle cx="19" cy="17" r="2.2" fill="#FDF3E3" stroke="#b0803a" strokeWidth="1.8" />
  </svg>
);

const textParserIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <rect x="3" y="3" width="18" height="18" rx="5" fill="#fff" stroke="#3f8f6b" strokeWidth="1.8" />
    <path stroke="#3f8f6b" strokeWidth="2" strokeLinecap="round" d="M8 8h8M12 8v9" />
    <path stroke="#9fd4bd" strokeWidth="1.6" strokeLinecap="round" d="M7.5 19h4" />
  </svg>
);

const googleSheetsIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#0F9D58" />
    <path stroke="#fff" strokeWidth="1.7" d="M3 9.5h18M3 15h18M10 3v18M16.5 3v18" />
  </svg>
);

const httpRequestIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" strokeLinecap="round">
    <circle cx="12" cy="12" r="8.6" stroke="#5b54c9" strokeWidth="1.8" />
    <ellipse cx="12" cy="12" rx="3.8" ry="8.6" stroke="#5b54c9" strokeWidth="1.4" />
    <path d="M4.2 10h15.6M4.2 14h15.6" stroke="#5b54c9" strokeWidth="1.4" />
  </svg>
);

const telegramIcon = (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <circle cx="12" cy="12" r="10" fill="#229ED9" />
    <path fill="#fff" d="m5.7 12.3 9.9-4.4c.5-.2.9.1.7.6l-1.6 7.6c-.1.6-.5.7-.9.4l-2.5-1.8-1.2 1.1c-.3.3-.5.2-.6-.2l-.8-3-2.6-.8c-.6-.2-.6-.6-.4-.5Z" />
  </svg>
);

export const SERVICES: Record<ServiceId, Service> = {
  // web3 — triggers
  "evm-event": { id: "evm-event", name: "EVM Event", actions: ["Log triggered", "Transfer event", "Custom event"], tint: "#E8EDFB", icon: evmEventIcon, isWeb3: true, needsChain: true },
  "price-feed": { id: "price-feed", name: "Price Feed", actions: ["Price above", "Price below", "Price near (within 1%)"], tint: "#E8EDFB", icon: priceFeedIcon, isWeb3: true, needsChain: true },
  "wallet-balance": { id: "wallet-balance", name: "Wallet Balance", actions: ["Balance above", "Balance below"], tint: "#E8EDFB", icon: walletBalanceIcon, isWeb3: true, needsChain: true },
  "gas-price": { id: "gas-price", name: "Gas Price", actions: ["Gas above", "Gas below"], tint: "#E8EDFB", icon: gasPriceIcon, isWeb3: true },
  // web3 — actions
  "contract-call": { id: "contract-call", name: "Contract Call", actions: ["Read contract", "Write contract", "Estimate gas"], tint: "#EFEAF9", icon: contractCallIcon, isWeb3: true, needsChain: true, description: "In Stringz this is always a safe dry-run — nothing is broadcast. Once deployed, Write actions change on-chain state through a contract you authorize (an allowance or funded contract) at deploy time; reads need no authorization." },
  "token-transfer": { id: "token-transfer", name: "Token Transfer", actions: ["Send ERC-20", "Send native", "Batch send"], tint: "#FBEDF1", icon: tokenTransferIcon, isWeb3: true, needsChain: true, description: "In Stringz this is always a safe dry-run — no funds move. Once deployed, tokens move through a contract you authorize (an allowance or funded contract) at deploy time — a deployed workflow can't spend your wallet directly." },
  ccip: { id: "ccip", name: "CCIP Bridge", actions: ["Cross-chain send", "Cross-chain message", "Bridge tokens"], tint: "#E7F0FA", icon: ccipIcon, isWeb3: true, needsChain: true, description: "In Stringz this is always a safe dry-run — nothing is sent. Once deployed, funds/messages bridge through a contract you authorize (an allowance or funded contract) at deploy time." },
  swap: { id: "swap", name: "Swap", actions: ["Swap exact in", "Swap exact out", "Limit order"], tint: "#F3E9F7", icon: swapIcon, isWeb3: true, needsChain: true, description: "In Stringz this is always a safe dry-run — no funds move. Once deployed, swaps execute through a contract/allowance you authorize at deploy time." },
  // web2
  webhooks: { id: "webhooks", name: "Webhooks", actions: ["Send a webhook", "Send a request"], tint: "#FAE9ED", icon: webhookIcon },
  slack: { id: "slack", name: "Slack", actions: ["Get a user", "Send a message", "Create a channel"], tint: "#E2EFFA", icon: slackIcon },
  chatgpt: { id: "chatgpt", name: "AI Agent", actions: ["Edit an image", "Send a prompt", "Summarize text"], tint: "#FFFFFF", icon: openAIIcon },
  gdrive: { id: "gdrive", name: "Google Drive", actions: ["Upload a file", "Watch files", "Share a folder"], tint: "#E5F1E5", icon: gdriveIcon },
  discord: { id: "discord", name: "Discord", actions: ["Get a message", "Post to channel", "Add a role"], tint: "#EAE7FA", icon: discordIcon },
  youtube: { id: "youtube", name: "YouTube", actions: ["Find by keywords", "Upload a video", "Watch comments"], tint: "#FDECEC", icon: youtubeIcon },
  gmail: { id: "gmail", name: "Gmail", actions: ["Send an email", "Watch emails", "Add a label"], tint: "#FDF3EC", icon: gmailIcon },
  notion: { id: "notion", name: "Notion", actions: ["Create a page", "Update database", "Search pages"], tint: "#F0F0EE", icon: notionIcon },
  calendar: { id: "calendar", name: "Calendar", actions: ["Create an event", "List events", "Delete an event"], tint: "#EAF3FB", icon: calendarIcon },
  x: { id: "x", name: "X (Twitter)", actions: ["Post a tweet", "Watch tweets", "Search tweets"], tint: "#EFEFEF", icon: xIcon },
  canva: { id: "canva", name: "Canva", actions: ["Create a design", "Export a design", "List templates"], tint: "#EDF4FB", icon: canvaIcon },
  // tools
  trigger: { id: "trigger", name: "Basic trigger", actions: ["Generate bundles", "On demand"], tint: "#FFFFFF", icon: triggerIcon },
  sleep: { id: "sleep", name: "Sleep", actions: ["Every 5 minutes", "Every hour", "Every day"], description: "Sets how often this flow runs. CRE workflows cannot pause mid-execution - pick a cadence and the whole flow runs on that schedule.", tint: "#EFF1F4", icon: sleepIcon },
  variables: { id: "variables", name: "Variables", actions: ["Get variable", "Set variable", "Increment"], tint: "#EFF1F4", icon: variablesIcon },
  // flow control + parsing
  "flow-control": { id: "flow-control", name: "Flow Control", actions: ["Continue if match", "Stop if match", "Check & log"], tint: "#FDF3E3", icon: flowControlIcon },
  "text-parser": { id: "text-parser", name: "Text Parser", actions: ["Replace text", "Split text", "Extract pattern"], tint: "#E7F5EF", icon: textParserIcon },
  // connectors
  "google-sheets": { id: "google-sheets", name: "Google Sheets", actions: ["Add a row", "Update a row", "Get rows"], tint: "#E9F4E4", icon: googleSheetsIcon },
  "http-request": { id: "http-request", name: "HTTP Request", actions: ["Get JSON", "Post JSON", "Make a request"], tint: "#EBE9F7", icon: httpRequestIcon },
  telegram: { id: "telegram", name: "Telegram", actions: ["Send a message", "Send a photo", "Pin a message"], tint: "#E1F0F9", icon: telegramIcon },
};

export interface FlowNode {
  id: string;
  service: ServiceId;
  action: string;
  x: number;
  y: number;
  chain?: Chain;
  pair?: string;
  /** User-configured fields from the field spec registry (src/data/fields.ts). */
  params?: Record<string, string>;
}

export interface FlowEdge {
  from: string;
  to: string;
}

export const INITIAL_NODES: FlowNode[] = [
  { id: "hook-in", service: "price-feed", action: "Price below", x: 96, y: 150, chain: "ethereum", pair: "ETH/USD" },
  { id: "parse-text", service: "text-parser", action: "Replace text", x: 200, y: 300 },
  { id: "slack-user", service: "slack", action: "Send a message", x: 236, y: 150 },
  { id: "hook-out", service: "webhooks", action: "Send a webhook", x: 196, y: 512 },
  { id: "discord-msg", service: "discord", action: "Post to channel", x: 62, y: 604 },
];

export const INITIAL_EDGES: FlowEdge[] = [
  { from: "hook-in", to: "parse-text" },
  { from: "parse-text", to: "slack-user" },
  { from: "slack-user", to: "hook-out" },
  { from: "hook-out", to: "discord-msg" },
];

export const BLANK_NODES: FlowNode[] = [
  { id: "start-trigger", service: "trigger", action: "Generate bundles", x: 140, y: 180 },
];

export const AI_SUGGESTIONS: { title: string; desc: string; services: ServiceId[] }[] = [
  {
    title: "Price alert → swap on Base",
    desc: "When ETH drops below a threshold, swap USDC to ETH and ping Discord.",
    services: ["price-feed", "swap", "discord"],
  },
  {
    title: "Whale transfer → Discord alert",
    desc: "Watch large ERC-20 transfers and post a formatted alert to Discord.",
    services: ["evm-event", "chatgpt", "discord"],
  },
  {
    title: "Auto-compound vault",
    desc: "On a schedule, claim rewards and restake them into the vault.",
    services: ["trigger", "contract-call", "token-transfer"],
  },
  {
    title: "Cross-chain bridge notify",
    desc: "When a CCIP message arrives, notify Slack and log it to Notion.",
    services: ["ccip", "slack", "notion"],
  },
  {
    title: "Whale watch to spreadsheet",
    desc: "Watch large ERC-20 transfers and append each one to a Google Sheet.",
    services: ["evm-event", "flow-control", "google-sheets"],
  },
  {
    title: "Price-gated swap",
    desc: "Only fire the swap when the feed actually crosses your number - the gate halts quiet runs.",
    services: ["price-feed", "flow-control", "swap"],
  },
  {
    title: "On-chain alerts to Telegram",
    desc: "Extract the transaction hash from the event log and ping a Telegram channel.",
    services: ["evm-event", "text-parser", "telegram"],
  },
  {
    title: "Treasury balance guard",
    desc: "When a wallet's native balance drops below your floor, get a Telegram alert.",
    services: ["wallet-balance", "telegram"],
  },
  {
    title: "Gas-gated swap",
    desc: "Only run the swap when mainnet gas is under your gwei target.",
    services: ["gas-price", "swap"],
  },
];
