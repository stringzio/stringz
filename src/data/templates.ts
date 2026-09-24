/**
 * Ready-made template flows for the templates screen.
 *
 * A template is a real, editable flow: an ordered chain of steps (trigger
 * first) laid out on the canvas and connected head-to-tail. Every template
 * must export cleanly with zero edits: exportable services only, every
 * required param prefilled, and cadence copy that matches the seeded sleep
 * action (the only cadences CRE can emit are 5 minutes / hourly / daily).
 *
 * This file is React-free so the CRE tooling and verification drivers can
 * import it too. Verified by tmp-verify/templates-verify.ts: each entry runs
 * the full export pipeline and typechecks against the real CRE SDK.
 */
import type { ServiceId, Chain, FlowNode, FlowEdge } from "./services";

export interface Template {
  title: string;
  desc: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  tint: string;
  visibility: "public" | "private";
}

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

type Step = {
  id: string;
  service: ServiceId;
  action: string;
  chain?: Chain;
  pair?: string;
  params?: Record<string, string>;
};
function makeFlow(steps: Step[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = steps.map((s, i) => ({
    id: s.id,
    service: s.service,
    action: s.action,
    x: 110 + i * 60,
    y: 140 + i * 150,
    ...(s.chain ? { chain: s.chain } : {}),
    ...(s.pair ? { pair: s.pair } : {}),
    ...(s.params ? { params: s.params } : {}),
  }));
  const edges: FlowEdge[] = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }));
  return { nodes, edges };
}

export const TEMPLATES: Template[] = [
  {
    title: "Ping Discord when a Chainlink price feed crosses your target",
    desc: "Watch ETH/USD on Ethereum, extract the price, and push a formatted alert to your Discord the moment it clears your target.",
    ...makeFlow([
      { id: "pf-price", service: "price-feed", action: "Price above", chain: "ethereum", pair: "ETH/USD", params: { threshold: "3000" } },
      { id: "fmt-price", service: "text-parser", action: "Extract pattern", params: { input: "{{pf-price.price}}", patternKind: "Number" } },
      { id: "discord-alert", service: "discord", action: "Post to channel", params: { message: "ETH is {{fmt-price.result}} USD" } },
    ]),
    tint: "#EDF1FB",
    visibility: "public",
  },
  {
    title: "Whale watcher: alert on large USDC transfers",
    desc: "Trigger on USDC transfers above 250k, extract the amount, and notify your trading channel with the transaction hash.",
    ...makeFlow([
      {
        id: "ev-whale", service: "evm-event", action: "Transfer event", chain: "ethereum",
        params: { contractAddress: USDC, confirmations: "Finalized", minAmount: "250000", decimals: "6" },
      },
      { id: "fmt-amount", service: "text-parser", action: "Extract pattern", params: { input: "{{ev-whale.value}}", patternKind: "Number" } },
      {
        id: "slack-alert", service: "slack", action: "Send a message",
        params: { channel: "#whale-alerts", message: "USDC whale moved {{fmt-amount.result}} units (tx {{ev-whale.txHash}})" },
      },
    ]),
    tint: "#FFFFFF",
    visibility: "public",
  },
  {
    title: "Daily USDC reward sweep, gated on the ETH price",
    desc: "On a daily cadence, check ETH/USD, log the gate, and sweep 25 USDC to your wallet - set it once and CRE runs it every day.",
    ...makeFlow([
      { id: "daily", service: "sleep", action: "Every day" },
      { id: "pf-gate", service: "price-feed", action: "Price above", chain: "ethereum", pair: "ETH/USD", params: { threshold: "3000" } },
      { id: "log-gate", service: "flow-control", action: "Check & log", params: { value: "ETH/USD" } },
      {
        id: "sweep-usdc", service: "token-transfer", action: "Send ERC-20", chain: "ethereum",
        params: { tokenAddress: USDC, toAddress: VITALIK, amount: "25", decimals: "6" },
      },
    ]),
    tint: "#FBE9EF",
    visibility: "public",
  },
  {
    title: "Send USDC from the treasury and confirm on Slack",
    desc: "Fire on demand, move 100 USDC to your receiver, and post a confirmation with the amount to your ops channel.",
    ...makeFlow([
      { id: "go", service: "trigger", action: "On demand" },
      {
        id: "send-usdc", service: "token-transfer", action: "Send ERC-20", chain: "ethereum",
        params: { tokenAddress: USDC, toAddress: VITALIK, amount: "100", decimals: "6" },
      },
      {
        id: "slack-receipt", service: "slack", action: "Send a message",
        params: { channel: "#treasury", message: "Sent {{send-usdc.amount}} USDC to {{send-usdc.to}}" },
      },
    ]),
    tint: "#FFFFFF",
    visibility: "private",
  },
  {
    title: "Daily ETH balance watch on Telegram",
    desc: "Check a wallet's ETH balance every day and get a Telegram ping the moment it drops below your floor.",
    ...makeFlow([
      { id: "daily", service: "sleep", action: "Every day" },
      { id: "watch-balance", service: "wallet-balance", action: "Balance below", chain: "ethereum", params: { address: VITALIK, amount: "1" } },
      {
        id: "tg-alert", service: "telegram", action: "Send a message",
        params: { chatId: "@your_channel", message: "Balance watch: {{watch-balance.balance}} ETH on {{watch-balance.address}}" },
      },
    ]),
    tint: "#EDF1FB",
    visibility: "private",
  },
];
