import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Pencil, Wallet, Check, Unplug } from "lucide-react";
import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CHAINS, type Chain } from "../data/services";
import Toast, { type ToastData } from "../components/Toast";
import ProSheet from "../components/ProSheet";
import { api } from "../lib/api";
import type { PublicUser } from "../lib/contract";
import type { Tier } from "../lib/pricing";

const CHAIN_OPTIONS: Chain[] = ["ethereum", "base", "arbitrum", "optimism"];

const PLAN_INCLUDES: Record<string, string[]> = {
  community: ["50 cloud simulations per month", "Unlimited local flows and simulation", "Export and self-host free forever"],
  pro: ["1,000 cloud simulations per month", "Hosted builder with autosave and backups", "Ephemeral run secrets", "Priority support"],
};

const enter = (delay: number) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, type: "spring" as const, damping: 26, stiffness: 260 },
});

export default function SettingsScreen({ desktop = false, onBack }: { desktop?: boolean; onBack: () => void }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeq = useRef(0);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [defaultChain, setDefaultChain] = useState<Chain>("ethereum");
  const [me, setMe] = useState<PublicUser | null>(null);
  const [tier, setTier] = useState<Tier>("community");
  const [paidThrough, setPaidThrough] = useState<string | null>(null);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const wallet = isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
  const isPro = tier !== "community";

  useEffect(() => {
    let cancelled = false;
    api.auth.me().then((u) => !cancelled && setMe(u)).catch(() => {});
    api.billing.entitlements().then((e) => {
      if (cancelled) return;
      setTier(e.tier);
      setPaidThrough(e.paidThrough);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [proOpen, setProOpen] = useState(false);

  const showToast = (text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const toggleEmail = () => {
    const next = !emailNotifications;
    setEmailNotifications(next);
    showToast(next ? "Email notifications on" : "Email notifications off");
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      {/* dotted backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(#e5eae5 1.3px, transparent 1.3px)", backgroundSize: "20px 20px" }}
      />

      <div className="no-scrollbar relative h-full overflow-y-auto px-5 pb-24 pt-14">
        {/* header */}
        {!desktop && (
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow-md transition active:scale-95"
              aria-label="Back"
            >
              <ChevronLeft size={19} />
            </button>
          </div>
        )}

        <h1 className="mt-5 text-[28px] font-extrabold tracking-tight text-[#1a1a1a]">Settings</h1>

        {/* profile */}
        <div className="mt-6">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Profile</div>
          <motion.div
            {...enter(0.05)}
            className="flex items-center gap-3 rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#3f6b4f] text-[15px] font-extrabold text-white">
              {me?.avatar ? (
                <img src={me.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                (me?.name ?? me?.email ?? "S").slice(0, 1).toUpperCase()
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-[#1a1a1a]">{me?.name ?? "Your account"}</div>
              <div className="truncate text-[12px] text-gray-400">{me?.email ?? me?.walletAddress ?? "Sign in to sync your profile"}</div>
              <div className="text-[11px] text-gray-400">
                {me?.authProvider === "github"
                  ? "Signed in with GitHub"
                  : me?.authProvider === "email"
                    ? "Email and password"
                    : "Signed in"}
              </div>
            </div>
            <button
              onClick={() => showToast("Profile editing is coming soon")}
              className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-[12px] font-semibold text-[#1a1a1a] transition active:scale-95"
            >
              <Pencil size={13} /> Edit
            </button>
          </motion.div>
        </div>

        {/* connected wallet */}
        <div className="mt-6">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Connected wallet</div>
          <motion.div
            {...enter(0.1)}
            className="rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
          >
            {wallet ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E2EFFA] text-[#3b6ea5]">
                      <Wallet size={17} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[13.5px] font-bold text-[#1a1a1a]">{wallet}</div>
                      <div className="text-[11.5px] text-gray-400">Connected signer</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      disconnect();
                      showToast("Wallet disconnected");
                    }}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-[12px] font-semibold text-gray-600 transition active:scale-95"
                  >
                    <Unplug size={13} /> Disconnect
                  </button>
                </div>
                <p className="mt-3 text-[11.5px] leading-snug text-gray-400">Your wallet signs transactions. Stringz never holds keys.</p>
              </>
            ) : (
              <>
                <p className="text-[12.5px] leading-relaxed text-gray-500">
                  Connect a wallet to sign on-chain runs. Your wallet signs transactions. Stringz never holds keys.
                </p>
                <button
                  onClick={openConnectModal}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#1a1a1a] py-3 text-[13.5px] font-semibold text-white transition active:scale-[0.98]"
                >
                  <Wallet size={15} /> Connect wallet
                </button>
              </>
            )}
          </motion.div>
        </div>

        {/* preferences */}
        <div className="mt-6">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Preferences</div>
          <motion.div
            {...enter(0.15)}
            className="rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-bold text-[#1a1a1a]">Email notifications</div>
                <div className="text-[11.5px] text-gray-400">Run reports and flow alerts</div>
              </div>
              <button
                role="switch"
                aria-checked={emailNotifications}
                aria-label="Email notifications"
                onClick={toggleEmail}
                className={`relative h-7 w-12 rounded-full transition ${emailNotifications ? "bg-[#1a1a1a]" : "bg-gray-200"}`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    emailNotifications ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
            <div className="my-4 border-t border-gray-100" />
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Default chain for new nodes</div>
            <div className="flex flex-wrap gap-2">
              {CHAIN_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setDefaultChain(c)}
                  className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                    defaultChain === c ? "bg-[#1a1a1a] text-white" : "bg-gray-100 text-gray-600 active:bg-gray-200"
                  }`}
                >
                  {CHAINS[c].name}
                </button>
              ))}
            </div>
          </motion.div>
        </div>

        {/* plan and billing */}
        <div className="mt-6">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Plan and billing</div>
          <motion.div
            {...enter(0.2)}
            className="rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[15px] font-bold text-[#1a1a1a]">{isPro ? "Pro" : "Community - $0"}</div>
                <div className="text-[11.5px] text-gray-400">
                  {isPro ? `Active until ${paidThrough ? new Date(paidThrough).toLocaleDateString() : "-"}` : "Free forever"}
                </div>
              </div>
              <span className="rounded-full bg-[#EAF2EA] px-3 py-1.5 text-[11px] font-bold text-[#3f6b4f]">Current plan</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {(PLAN_INCLUDES[isPro ? "pro" : "community"] ?? []).map((line) => (
                <li key={line} className="flex items-center gap-2 text-[12.5px] text-gray-600">
                  <Check size={13} className="shrink-0 text-[#3f6b4f]" /> {line}
                </li>
              ))}
            </ul>
            <button
              onClick={() => (isPro ? showToast("Plan management opens with the dashboard") : setProOpen(true))}
              className="mt-4 w-full rounded-full bg-[#1a1a1a] py-3 text-[13.5px] font-semibold text-white transition active:scale-[0.98]"
            >
              {isPro ? "Manage plan" : "Upgrade to Pro"}
            </button>
            <a
              href="/#pricing"
              className="mt-2.5 block rounded-full bg-gray-100 py-3 text-center text-[13px] font-semibold text-gray-600 transition active:scale-[0.98]"
            >
              View pricing
            </a>
          </motion.div>
        </div>

        {/* danger zone */}
        <div className="mt-6">
          <motion.div
            {...enter(0.25)}
            className="rounded-[24px] p-4"
            style={{ backgroundColor: "#FBE9EC" }}
          >
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#C0435A]/70">Danger zone</div>
            <div className="text-[14px] font-bold text-[#1a1a1a]">Delete account</div>
            <p className="mt-0.5 text-[12px] leading-snug text-gray-500">
              Permanently remove your account, saved flows and API access.
            </p>
            <button
              onClick={() => showToast("Account deletion is coming soon")}
              className="mt-3 rounded-full bg-white px-4 py-2.5 text-[13px] font-bold text-[#C0435A] shadow-sm transition active:scale-95"
            >
              Delete account
            </button>
          </motion.div>
        </div>
      </div>

      <Toast toast={toast} />
      <ProSheet open={proOpen} onClose={() => setProOpen(false)} />
    </div>
  );
}
