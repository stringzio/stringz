import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { useAccount, useSignMessage, useSwitchChain, useWriteContract, useReadContracts } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { base, arbitrum, avalanche, mainnet } from "wagmi/chains";
import Sheet from "./Sheet";
import { PLANS, PAY_CHAINS, TREASURY_EVM, chargeUnits, usd, type PayChain } from "../lib/pricing";
import { SUPPORT_X_URL, SUPPORT_X_HANDLE } from "../lib/support";
import { buildPaymentIntentMessage, paymentIntentExpiry } from "../lib/paymentIntent";
import { api } from "../lib/api";

const COMMUNITY = [
  "50 cloud simulations per month",
  "Unlimited local flows and simulation",
  "Export and self-host free forever",
];
const PRO = [
  "Priority support",
  "Hosted builder with autosave and backups",
  "Ephemeral run secrets, destroyed at run end",
];
/** Sim quota line differs per workspace; everything else is shared copy. */
const SIMS_LINE: Record<"personal" | "team", string> = {
  personal: "1,000 cloud simulations per month",
  team: "4,000 cloud simulations per month, shared",
};

const CHAIN_ID: Record<PayChain, number> = { base: base.id, arbitrum: arbitrum.id, avalanche: avalanche.id, ethereum: mainnet.id };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ENTITLEMENT_WATCH_INTERVAL_MS = 5_000;
/** 10 min ceiling. The credit is already safe in the database, so a timeout
 *  here only delays discovery (the app self-heals via entitlements) - it
 *  never loses the payment. */
const ENTITLEMENT_WATCH_MAX_POLLS = 120;

/** A transfer submitted while the sheet was closing parks here and is
 *  claimed on the next open: verifying needs a wallet signature prompt,
 *  which can only fire while the sheet (and its wallet context) is live. */
const PENDING_PAYMENT_KEY = "stringz.pendingPayment";

type Workspace = "personal" | "team";
type CheckoutPlan = "pro_monthly" | "pro_annual" | "team_monthly" | "team_annual";

interface ParkedPayment {
  chain: PayChain;
  txHash: `0x${string}`;
  plan: CheckoutPlan;
}

function parseParked(raw: string): ParkedPayment | null {
  try {
    return JSON.parse(raw) as ParkedPayment;
  } catch {
    return null;
  }
}

/** External-store plumbing so the offer step can render from sessionStorage
 *  without an impure render read. Same-tab writes always accompany a
 *  setState (the sheet re-renders anyway); the storage listener covers the
 *  cross-tab case. */
const subscribeParked = (onStoreChange: () => void): (() => void) => {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
};
const parkedSnapshot = (): string | null => sessionStorage.getItem(PENDING_PAYMENT_KEY);

/** Thrown when the sheet is closed mid-confirmation; pay() swallows it so a
 *  deliberate close never surfaces as an error state. */
class WatchCancelled extends Error {}

/** After billing.verify returns "pending", the credit lands in the
 *  entitlements read once the chain confirms. Poll that - the same source of
 *  truth every paywalled surface renders from - instead of re-verifying. */
async function watchForEntitlement(isCancelled: () => boolean) {
  for (let poll = 0; poll < ENTITLEMENT_WATCH_MAX_POLLS; poll++) {
    if (isCancelled()) throw new WatchCancelled();
    await sleep(ENTITLEMENT_WATCH_INTERVAL_MS);
    const entitlements = await api.billing.entitlements();
    if (entitlements.tier !== "community") return entitlements;
  }
  throw new Error("CONFIRMATION_TIMEOUT: the chain did not confirm the payment within 10 minutes");
}

/** Map wallet/provider errors to something a human can act on. Raw viem dumps
 *  (chain mismatch, revert data) stay out of the UI; the raw message is kept
 *  in the console for debugging. Any state where funds may already be moving
 *  says "do not pay again" - a double-payment instruction is the worst
 *  possible copy here. */
function friendlyPaymentError(err: unknown, network: string, symbol: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/does not match the target chain|Current Chain ID|chain mismatch/i.test(raw))
    return `Your wallet is on the wrong network. Switch to ${network} in your wallet, then try again.`;
  if (/user rejected|user denied|cancelled|canceled/i.test(raw))
    return "You cancelled the transaction in your wallet. Nothing was sent.";
  if (/insufficient funds|exceeds balance|not enough/i.test(raw))
    return `Your wallet does not have enough ${symbol} on ${network} for this payment.`;
  // Ordered: the generic "timeout" branch below would also match these.
  if (/^CONFIRMATION_TIMEOUT:/i.test(raw))
    return "Your payment was sent but the chain did not confirm it within 10 minutes. Check your wallet's activity - if the transfer shows there, do NOT pay again; contact us and we will credit it.";
  if (/TX_FAILED/i.test(raw))
    return "Your payment transaction reverted on-chain, so no payment was made. Check the token and network in your wallet, then try again.";
  if (/WRONG_TOKEN/i.test(raw))
    return "That transaction used a token this plan does not accept. Pay with the token shown at checkout.";
  if (/INSUFFICIENT_CONFIRMATIONS/i.test(raw))
    return "Your payment was sent but has not finished confirming. Check your wallet's activity - if the transfer shows there, do not pay again; contact us and we will credit it.";
  if (/TX_NOT_FOUND/i.test(raw))
    return "We could not find your payment transaction yet. Check your wallet's activity - if the transfer shows there, do not pay again; contact us and we will credit it.";
  if (/UNDERPAID/i.test(raw))
    return "The amount sent does not match the plan price. Send the exact amount shown at checkout.";
  if (/WRONG_RECIPIENT/i.test(raw))
    return "That transaction does not contain a payment to our treasury address. If you sent it manually, contact us with the transaction link and we will credit it.";
  if (/INTENT_EXPIRED/i.test(raw))
    return "Your payment authorization expired before the network confirmed it. Your funds are safe in the original transaction - contact us and we will credit it manually.";
  if (/SIGNER_MISMATCH/i.test(raw))
    return "The connected wallet did not sign for this payment. Switch back to the wallet you paid from and try again, or contact us and we will credit it.";
  if (/timeout|timed out/i.test(raw))
    return "The network did not respond in time. Check your wallet - if the payment went out, do not retry; contact us.";
  console.warn("[checkout] raw payment error:", raw);
  // Coded rail rejections that fell through (e.g. PAY_ERROR): funds may be
  // moving, so never tell the user to blindly try again.
  if (/^[A-Z_]+: /s.test(raw))
    return "Something went wrong verifying your payment. Check your wallet's activity before paying again - if the transfer shows there, do not pay a second time; contact us and we will credit it.";
  return "The payment could not be completed. Check your wallet and network, then try again.";
}
const ERC20_TRANSFER_ABI = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [
    { name: "to", type: "address" }, { name: "amount", type: "uint256" },
  ], outputs: [{ name: "", type: "bool" }] },
] as const;

const ERC20_BALANCE_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [
    { name: "account", type: "address" },
  ], outputs: [{ name: "", type: "uint256" }] },
] as const;

/** Human-readable 6-decimal stablecoin amount ("0.369"). Display only. */
function fmtUnits(amount: bigint): string {
  const s = amount.toString().padStart(7, "0");
  const int = s.slice(0, -6);
  const frac = s.slice(-6).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

type Step = "offer" | "checkout" | "paying" | "success" | "error";

/**
 * Pro upgrade + checkout. Offer step shows what Pro adds; checkout collects
 * plan/chain/token, sends the stablecoin transfer from the connected wallet,
 * then asks the backend to verify with stringz-pay (the key never reaches
 * the browser). Success and error steps use the payment-state illustrations.
 */
export default function ProSheet({
  open,
  onClose,
  feature,
}: {
  open: boolean;
  onClose: () => void;
  /** What the user tried to do, e.g. "Running more cloud simulations". */
  feature?: string;
}) {
  const pro = PLANS.find((p) => p.tier === "pro") ?? PLANS[1];
  const teamPlan = PLANS.find((p) => p.tier === "team") ?? PLANS[2];
  const [step, setStep] = useState<Step>("offer");
  const [annual, setAnnual] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>("personal");
  const [chain, setChain] = useState<PayChain>("base");
  const [symbol, setSymbol] = useState<"USDC" | "USDT" | "USDC.e">("USDC");
  const [error, setError] = useState("");
  const [rawError, setRawError] = useState("");
  const [paidThrough, setPaidThrough] = useState("");
  const [confirming, setConfirming] = useState(false);
  const cancelledRef = useRef(false);

  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();

  // The intent message binds the account id, so the pay flow needs it before
  // signing. auth.me is the same session the server credits, so the two can
  // never disagree on who is being paid for.
  const [userId, setUserId] = useState("");
  useEffect(() => {
    let cancelled = false;
    api.auth.me().then((u) => !cancelled && setUserId(u?.id ?? "")).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const planInfo = workspace === "team" ? teamPlan : pro;
  const priceCents = annual ? planInfo.annualCents : planInfo.monthlyCents;
  const dest = PAY_CHAINS.find((c) => c.id === chain) ?? PAY_CHAINS[0];
  const token = dest.tokens.find((t) => t.symbol === symbol) ?? dest.tokens[0];
  const plan: CheckoutPlan = workspace === "team" ? (annual ? "team_annual" : "team_monthly") : (annual ? "pro_annual" : "pro_monthly");
  const charge = chargeUnits(priceCents);

  // Balance-aware picker: read the connected wallet's real on-chain balance
  // for every offered token so the choice is grounded in what the wallet
  // actually holds. Reads go through the public client, so balances appear
  // even before the wallet switches to the target chain.
  const { data: balances, isPending: balancesPending } = useReadContracts({
    contracts: address
      ? dest.tokens.map((t) => ({
          chainId: CHAIN_ID[chain],
          address: t.address as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [address],
        }))
      : [],
    query: { enabled: !!address },
  });
  const balanceOf = (sym: string): bigint | undefined => {
    const i = dest.tokens.findIndex((t) => t.symbol === sym);
    const r = i >= 0 ? balances?.[i]?.result : undefined;
    return typeof r === "bigint" ? r : undefined;
  };
  const walletBalance = balanceOf(token.symbol);
  const insufficient = isConnected && walletBalance !== undefined && walletBalance < charge;
  /** Gate stays shut while the balance read is in flight; if the read errors
   *  out, balances stay undefined, isPending flips false, and the gate opens
   *  (the wallet itself is the backstop, same as before). */
  const checkingBalance = isConnected && balancesPending;

  const reportPaymentError = (err: unknown, network: string, symbol: string) => {
    if (err instanceof WatchCancelled) return;
    setRawError(err instanceof Error ? err.message : String(err));
    setError(friendlyPaymentError(err, network, symbol));
    setStep("error");
  };

  /** Sign the payment intent with the connected wallet, then ask the server
   *  to verify and credit. Shared by the normal pay flow and the
   *  parked-payment resume so both behave identically. */
  const completePayment = async (p: {
    chain: PayChain;
    txHash: `0x${string}`;
    plan: CheckoutPlan;
  }) => {
    if (!userId) throw new Error("Your account is still loading - try again in a moment.");
    setConfirming(true);
    const expires = paymentIntentExpiry();
    const sig = await signMessageAsync({
      message: buildPaymentIntentMessage({ userId, plan: p.plan, chain: p.chain, txHash: p.txHash, expires }),
    });
    // One call: the server retries stringz-pay internally and answers
    // credited | rejected | pending (chain still catching up).
    const result = await api.billing.verify({ ...p, expires, sig });
    if (result.outcome === "credited") {
      setPaidThrough(result.paidThrough);
      setStep("success");
      return;
    }
    if (result.outcome === "rejected") throw new Error(`${result.code}: ${result.message}`);
    const entitlements = await watchForEntitlement(() => cancelledRef.current);
    setPaidThrough(entitlements.paidThrough ?? "");
    setStep("success");
  };

  /** Claim a transfer submitted while the sheet was closing. Deliberately a
   *  user click, not an on-open effect: the signature prompt needs both a
   *  user gesture (some wallets refuse blind prompts) and a live sheet. */
  const resumeParked = (parked: ParkedPayment) => {
    sessionStorage.removeItem(PENDING_PAYMENT_KEY);
    cancelledRef.current = false;
    setStep("paying");
    setError("");
    setRawError("");
    setConfirming(false);
    const parkedDest = PAY_CHAINS.find((c) => c.id === parked.chain);
    completePayment(parked)
      .catch((err: unknown) => {
        // No wallet connected to sign with: keep it parked for the next open.
        if (!isConnected && !(err instanceof WatchCancelled)) {
          sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(parked));
        }
        reportPaymentError(err, parkedDest?.label ?? "the network", parkedDest?.tokens[0]?.symbol ?? "USDC");
      })
      .finally(() => setConfirming(false));
  };

  // Subscribed (not read) so the offer step can offer the resume without an
  // impure render; our own writes always accompany a setState re-render.
  const parkedRaw = useSyncExternalStore(subscribeParked, parkedSnapshot);
  const parkedPayment = open && parkedRaw ? parseParked(parkedRaw) : null;

  const pay = async () => {
    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }
    cancelledRef.current = false;
    setStep("paying");
    setError("");
    setRawError("");
    setConfirming(false);
    try {
      // switchChainAsync actually awaits the wallet prompt; the sync variant
      // swallows rejections and leaves the wallet on the wrong chain, which
      // surfaces later as viem's raw chain-mismatch dump.
      if (switchChainAsync) await switchChainAsync({ chainId: CHAIN_ID[chain] });
      const txHash = await writeContractAsync({
        chainId: CHAIN_ID[chain],
        address: token.address as `0x${string}`,
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [TREASURY_EVM as `0x${string}`, chargeUnits(priceCents)],
      });
      if (cancelledRef.current) {
        // Sheet closed while the wallet prompt was open, but the transfer may
        // already be submitted: park it and claim on reopen so the credit is
        // never lost.
        sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({ chain, txHash, plan }));
        return;
      }
      await completePayment({ chain, txHash, plan });
    } catch (err) {
      reportPaymentError(err, dest.label, token.symbol);
    } finally {
      setConfirming(false);
    }
  };

  const close = () => {
    cancelledRef.current = true;
    setStep("offer");
    setError("");
    setRawError("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title={step === "offer" ? (workspace === "team" ? "Team" : "Pro") : "Checkout"}>
      {step === "offer" && (
        <>
          {parkedPayment && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-[#E9F0F7] px-4 py-3">
              <p className="text-[12px] font-medium leading-snug text-[#3d5f8a]">
                A payment you already sent is waiting to be verified - no need to pay again.
              </p>
              <button
                onClick={() => resumeParked(parkedPayment)}
                className="shrink-0 rounded-full bg-[#1a1a1a] px-4 py-2 text-[11.5px] font-bold text-white transition active:scale-[0.98]"
              >
                Resume
              </button>
            </div>
          )}
          {feature && (
            <p className="mb-4 rounded-2xl bg-[#FDF3E3] px-4 py-3 text-[12.5px] font-medium leading-snug text-[#7a5a22]">
              {feature} is a Pro feature.
            </p>
          )}
          <div className="md:grid md:grid-cols-2 md:gap-3">
          <div className="mb-3 rounded-2xl bg-gray-50 p-4 md:mb-0">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-bold text-[#1a1a1a]">Community</span>
              <span className="rounded-full bg-white px-3 py-1 text-[10.5px] font-bold text-gray-500 shadow-sm">$0 · current</span>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {COMMUNITY.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-gray-500">
                  <Check size={13} className="mt-0.5 shrink-0 text-gray-400" /> {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-[#1a1a1a] p-4">
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-white/10 p-1">
              {(["personal", "team"] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWorkspace(w)}
                  className={`rounded-full py-1.5 text-[11px] font-bold transition ${workspace === w ? "bg-white text-[#1a1a1a]" : "text-white/60"}`}
                >
                  {w === "team" ? "Team" : "Pro"}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[14px] font-bold text-white">
                <Sparkles size={14} className="text-[#E8A33D]" /> {workspace === "team" ? "Team" : "Pro"}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-bold text-white/70">
                {usd(planInfo.monthlyCents)}/mo · {usd(planInfo.annualCents)}/yr
              </span>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              <li className="flex items-start gap-2 text-[12px] text-white/80">
                <Check size={13} className="mt-0.5 shrink-0 text-[#8fb89c]" /> {SIMS_LINE[workspace]}
              </li>
              {PRO.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-white/80">
                  <Check size={13} className="mt-0.5 shrink-0 text-[#8fb89c]" /> {f}
                </li>
              ))}
            </ul>
            {workspace === "team" && (
              <p className="mt-2.5 text-[10.5px] leading-snug text-white/50">
                One subscription on your account today, sized for a small team - seat invites land with orgs.
              </p>
            )}
            <button
              onClick={() => setStep("checkout")}
              className="mt-4 w-full rounded-full bg-white py-3 text-[13px] font-bold text-[#1a1a1a] transition active:scale-[0.98]"
            >
              Pay with USDC / USDT
            </button>
          </div>
          </div>
          <p className="mt-4 text-center text-[11px] leading-snug text-gray-400">
            Pro runs in the cloud we operate - that is how the open core gets funded. Self-hosting the
            open-source builder stays free forever.
          </p>
        </>
      )}

      {step === "checkout" && (
        <div className="md:grid md:grid-cols-[1fr_300px] md:gap-8">
          <div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["personal", "team"] as const).map((w) => (
              <button
                key={w}
                onClick={() => setWorkspace(w)}
                className={`rounded-2xl py-2.5 text-[12px] font-bold transition ${workspace === w ? "bg-[#1a1a1a] text-white" : "bg-gray-100 text-gray-500"}`}
              >
                {w === "team" ? `Team - ${usd(teamPlan.monthlyCents)}/mo` : `Pro - ${usd(pro.monthlyCents)}/mo`}
              </button>
            ))}
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["monthly", "annual"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setAnnual(m === "annual")}
                className={`rounded-2xl py-3 text-[12.5px] font-bold transition ${(m === "annual") === annual ? "bg-[#1a1a1a] text-white" : "bg-gray-100 text-gray-500"}`}
              >
                {m === "annual" ? `Annual - ${usd(planInfo.annualCents)} (2 mo free)` : `Monthly - ${usd(planInfo.monthlyCents)}`}
              </button>
            ))}
          </div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Network</div>
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {PAY_CHAINS.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setChain(c.id);
                  setSymbol(c.tokens[0].symbol);
                }}
                className={`rounded-full py-2 text-[11.5px] font-bold transition ${chain === c.id ? "bg-[#1a1a1a] text-white" : "bg-gray-100 text-gray-500"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Token</div>
          <div className="mb-4 grid grid-cols-2 gap-1.5">
            {dest.tokens.map((t) => {
              const b = balanceOf(t.symbol);
              const short = b !== undefined && b < charge;
              return (
                <button
                  key={t.symbol}
                  onClick={() => setSymbol(t.symbol)}
                  className={`flex flex-col items-center rounded-2xl py-2 transition ${
                    token.symbol === t.symbol
                      ? "bg-[#1a1a1a] text-white"
                      : short
                        ? "bg-gray-100 text-gray-400"
                        : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <span className="text-[11.5px] font-bold leading-tight">{t.symbol}</span>
                  {b !== undefined && (
                    <span
                      className={`mt-0.5 text-[9.5px] leading-tight ${
                        token.symbol === t.symbol ? "text-white/70" : short ? "text-red-400" : "text-gray-400"
                      }`}
                    >
                      {fmtUnits(b)}
                      {short ? " - not enough" : " available"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          </div>
          <div className="md:border-l md:border-gray-100 md:pl-8 md:flex md:flex-col md:justify-center">
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
            <span className="text-[12px] font-medium text-gray-500">You send</span>
            <span className="text-[15px] font-bold text-[#1a1a1a]">
              {fmtUnits(charge)} {token.symbol}
            </span>
          </div>
          {!isConnected && (
            <p className="mb-3 rounded-2xl bg-[#E9F0F7] px-4 py-2.5 text-[11.5px] leading-snug text-[#3d5f8a]">
              Connect your wallet to continue - Rainbow, MetaMask, and every WalletConnect wallet work.
            </p>
          )}
          <button
            onClick={pay}
            disabled={insufficient || checkingBalance}
            className={`w-full rounded-full py-3.5 text-[13.5px] font-bold transition active:scale-[0.98] ${
              insufficient || checkingBalance ? "cursor-not-allowed bg-gray-200 text-gray-400" : "bg-[#1a1a1a] text-white"
            }`}
          >
            {insufficient
              ? `Not enough ${token.symbol} on ${dest.label}`
              : checkingBalance
                ? "Checking balance…"
                : isConnected
                  ? `Pay ${fmtUnits(charge)} ${token.symbol} on ${dest.label}`
                  : "Connect wallet"}
          </button>
          <p className="mt-3 text-center text-[10.5px] leading-snug text-gray-400">
            One payment, {annual ? "12 months" : "30 days"} of Pro. No auto-renewal - extend any time with a
            new payment. Self-custody: the transfer goes straight from your wallet.
          </p>
          </div>
        </div>
      )}

      {step === "paying" && (
        <div className="flex flex-col items-center py-10 md:max-w-md md:mx-auto">
          <Loader2 size={28} className="animate-spin text-[#3d5f8a]" />
          <p className="mt-4 text-[13px] font-semibold text-[#1a1a1a]">
            {confirming ? "Confirming on-chain…" : "Confirm in your wallet…"}
          </p>
          <p className="mt-1 max-w-56 text-center text-[11.5px] leading-snug text-gray-400">
            {confirming
              ? "The transfer is submitted. Waiting for network confirmations - usually a few seconds."
              : "Approve the transfer, then wait a few seconds while we confirm it on-chain."}
          </p>
        </div>
      )}

      {step === "success" && (
        <div className="flex flex-col items-center py-4 md:max-w-md md:mx-auto">
          <img src="/assets/payment-success.webp" alt="Payment successful" className="h-40 w-auto" />
          <p className="mt-4 text-[16px] font-bold text-[#1a1a1a]">Welcome to {workspace === "team" ? "Team" : "Pro"}</p>
          <p className="mt-1.5 max-w-60 text-center text-[12px] leading-snug text-gray-500">
            Your payment is confirmed. {workspace === "team" ? "Team" : "Pro"} is active
            {paidThrough ? (
              <>
                {" "}until <span className="font-bold text-[#1a1a1a]">{new Date(paidThrough).toLocaleDateString()}</span>
              </>
            ) : null}{" "}
            - {planInfo.monthlySims.toLocaleString()} cloud simulations per month are yours.
          </p>
          <button
            onClick={close}
            className="mt-5 w-full rounded-full bg-[#1a1a1a] py-3.5 text-[13.5px] font-bold text-white transition active:scale-[0.98]"
          >
            Start building
          </button>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col items-center py-4 md:max-w-md md:mx-auto">
          <img src="/assets/payment-error.webp" alt="Payment failed" className="h-36 w-auto" />
          <p className="mt-4 text-[16px] font-bold text-[#1a1a1a]">Payment did not go through</p>
          <p className="mt-1.5 max-w-64 text-center text-[12px] leading-snug text-gray-500">{error}</p>
          <a
            href={SUPPORT_X_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 text-[12px] font-semibold text-[#3d5f8a] transition hover:underline"
          >
            Payment stuck or funds already sent? DM {SUPPORT_X_HANDLE} on X and we will sort it out.
          </a>
          {import.meta.env.DEV && rawError && (
            <p className="mt-2 max-w-64 break-words rounded-xl bg-gray-50 px-3 py-2 text-center font-mono text-[10px] leading-snug text-gray-400">
              {rawError}
            </p>
          )}
          <button
            onClick={() => setStep("checkout")}
            className="mt-5 w-full rounded-full bg-[#1a1a1a] py-3.5 text-[13.5px] font-bold text-white transition active:scale-[0.98]"
          >
            Try again
          </button>
          <button onClick={close} className="mt-2.5 text-[12px] font-semibold text-gray-400">
            Maybe later
          </button>
        </div>
      )}
    </Sheet>
  );
}
