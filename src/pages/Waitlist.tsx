import { useMemo, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import LogoMark from "../components/LogoMark";
import { SERVICES } from "../data/services";
import { api } from "../lib/api";

/* ---------- key cap (volte style) ---------- */
function KeyCap({
  label,
  fill = "#F4F4F1",
  dark = false,
  className = "",
  delay = 0,
}: {
  label: string;
  fill?: string;
  dark?: boolean;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", damping: 20, stiffness: 240 }}
      className={`relative select-none rounded-2xl px-6 py-4 text-[20px] font-semibold tracking-tight ${className}`}
      style={{
        backgroundColor: dark ? "#171717" : fill,
        color: dark ? "#fff" : "#171717",
        boxShadow: "5px 6px 0 0 #171717",
      }}
    >
      {label}
    </motion.div>
  );
}

/* ---------- node graph decoration ---------- */
function NodeGraph() {
  return (
    <svg viewBox="0 0 560 420" className="h-auto w-full" fill="none" aria-hidden>
      {/* wires */}
      <path d="M120 90 H240 Q260 90 260 110 V160" stroke="#171717" strokeWidth="2.5" />
      <path d="M260 220 V260 Q260 280 280 280 H340" stroke="#171717" strokeWidth="2.5" />
      <path d="M410 280 H450 Q470 280 470 260 V200" stroke="#171717" strokeWidth="2.5" />
      <path d="M120 330 H200 Q220 330 220 310 V280 H340" stroke="#171717" strokeWidth="2.5" strokeDasharray="1 0" />
      <path d="M470 140 V120 Q470 100 490 100 H540" stroke="#171717" strokeWidth="2.5" />
      {/* arrowhead */}
      <path d="M340 280 l-10 -6 v12 z" fill="#171717" />
      <path d="M540 100 l-10 -6 v12 z" fill="#171717" />

      {/* diamond node */}
      <g transform="translate(120,90)">
        <rect x="-26" y="-26" width="52" height="52" rx="10" transform="rotate(45)" fill="#C8F7C5" stroke="#171717" strokeWidth="2.5" />
        <text x="0" y="6" textAnchor="middle" fontSize="17" fontWeight="700" fill="#171717">{"</>"}</text>
      </g>
      {/* circle node */}
      <g transform="translate(120,330)">
        <circle r="26" fill="#fff" stroke="#171717" strokeWidth="2.5" />
        <circle r="9" fill="#C9B8F5" />
      </g>
      {/* square node */}
      <g transform="translate(260,190)">
        <rect x="-28" y="-28" width="56" height="56" rx="12" fill="#C9B8F5" stroke="#171717" strokeWidth="2.5" />
        <path d="M-9 0 h18 M0 -9 v18" stroke="#171717" strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* arrow circle */}
      <g transform="translate(410,280)">
        <circle r="26" fill="#171717" />
        <path d="M-7 -7 L8 8 M8 8 h-11 M8 8 v-11" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      {/* big Enter card */}
      <g transform="translate(470,180)">
        <rect x="-8" y="-60" width="120" height="150" rx="16" fill="#171717" opacity="0.14" />
        <rect x="-14" y="-66" width="120" height="150" rx="16" fill="#fff" stroke="#171717" strokeWidth="2.5" />
        <text x="46" y="16" textAnchor="middle" fontSize="20" fontWeight="700" fill="#171717">Enter</text>
      </g>
      {/* coin stack */}
      <g transform="translate(300,340)">
        <ellipse cx="0" cy="12" rx="26" ry="10" fill="#C8F7C5" stroke="#171717" strokeWidth="2.5" />
        <ellipse cx="0" cy="2" rx="26" ry="10" fill="#C9B8F5" stroke="#171717" strokeWidth="2.5" />
        <ellipse cx="0" cy="-8" rx="26" ry="10" fill="#C9B8F5" stroke="#171717" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

/* ---------- page ---------- */

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const position = useMemo(() => joined, [joined]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { position: pos } = await api.waitlist.join({ email });
      setJoined(pos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your spot - try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-[#171717] antialiased">
      {/* nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-7">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Back to Stringz home">
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#171717]">
            <LogoMark className="h-5 w-auto" />
          </span>
          <span className="text-[19px] font-extrabold tracking-tight">Stringz</span>
        </Link>
        <nav className="hidden items-center gap-9 text-[14.5px] font-medium text-[#3c3c3c] md:flex">
          <Link to="/" className="transition hover:text-[#171717]">Home</Link>
          <a href="#how" className="transition hover:text-[#171717]">How it works</a>
          <Link to="/auth" className="transition hover:text-[#171717]">Sign in</Link>
        </nav>
        <Link
          to="/auth"
          className="rounded-full border-2 border-[#171717] px-5 py-2.5 text-[13px] font-bold transition hover:bg-[#171717] hover:text-white active:scale-95"
        >
          Get a demo
        </Link>
      </header>

      {/* hero */}
      <main className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 pb-10 pt-16 lg:grid-cols-2">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 200 }}
            className="text-[52px] font-semibold leading-[1.05] tracking-tight md:text-[72px]"
          >
            Be first to
            <br />
            build on-chain
            <br />
            without code
          </motion.h1>

          {/* key caps row */}
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <KeyCap label="Ctrl" delay={0.1} />
            <KeyCap label="+" className="px-4" delay={0.16} />
            <KeyCap label="C" fill="#C9B8F5" delay={0.22} />
            <KeyCap label="Ctrl" delay={0.28} />
            <KeyCap label="+" className="px-4" delay={0.34} />
            <KeyCap label="V" fill="#C8F7C5" delay={0.4} />
          </div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, type: "spring", damping: 24 }}
            className="mt-10 max-w-md text-[15px] leading-relaxed text-[#5a5a56]"
          >
            Automate everything from price alerts to cross-chain swaps — build intricate
            on-chain workflows for any purpose in one visual platform. No coding needed,
            no custody taken.
          </motion.p>

          {/* waitlist form */}
          {position === null ? (
            <div className="mt-8">
              <motion.form
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                onSubmit={join}
                className="flex max-w-md items-center gap-2 rounded-full border-2 border-[#171717] p-1.5"
                style={{ boxShadow: "5px 6px 0 0 #171717" }}
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@based.eth"
                  className="w-full bg-transparent px-4 text-[14px] font-medium outline-none placeholder:text-[#9a9a93]"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-[#171717] px-6 py-3 text-[13.5px] font-bold text-white transition hover:scale-[1.02] active:scale-95 disabled:opacity-60"
                >
                  {saving ? "Joining…" : "Join waitlist"} <ArrowRight size={14} />
                </button>
              </motion.form>
              {error && <p className="mt-3 max-w-md text-[12.5px] font-semibold text-[#C0435A]">{error}</p>}
            </div>
          ) : (            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-8 flex max-w-md items-center gap-4 rounded-3xl border-2 border-[#171717] bg-[#C8F7C5] p-5"
              style={{ boxShadow: "5px 6px 0 0 #171717" }}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#171717] text-white">
                <Check size={18} strokeWidth={3} />
              </span>
              <div>
                <div className="text-[15px] font-extrabold">You're in — #{position.toLocaleString()}</div>
                <div className="text-[12px] font-medium text-[#3d5233]">
                  We'll email {email} when your access unlocks.
                </div>
              </div>
            </motion.div>
          )}

          <p className="mt-4 text-[11.5px] font-medium text-[#9a9a93]">
            {position !== null
              ? `${position.toLocaleString()} builders in line (including you)`
              : "Builders are lining up"}{" "}
            · founding members get 25% off Pro, forever
          </p>
        </div>

        {/* right visual */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, type: "spring", damping: 24 }}
          className="relative"
        >
          <NodeGraph />
          {/* floating service chips */}
          <div className="absolute left-2 top-2 flex gap-2">
            {(["price-feed", "swap"] as const).map((s) => (
              <span
                key={s}
                className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[#171717] bg-white [&>svg]:h-5 [&>svg]:w-5"
                style={{ boxShadow: "3px 4px 0 0 #171717" }}
              >
                {SERVICES[s].icon}
              </span>
            ))}
          </div>
        </motion.div>
      </main>

      {/* CTA strip (volte style) */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-6 grid grid-cols-1 items-center gap-8 rounded-[32px] border-2 border-[#171717] bg-white p-10 md:grid-cols-2"
          style={{ boxShadow: "8px 10px 0 0 #171717" }}
        >
          <div className="flex items-end gap-8">
            <div className="flex flex-col gap-5">
              <KeyCap label="Ctrl" />
              <KeyCap label="Ctrl" />
            </div>
            <div className="flex flex-col gap-5">
              <KeyCap label="C" fill="#C9B8F5" />
              <KeyCap label="V" fill="#C8F7C5" />
            </div>
            <div
              className="hidden rounded-2xl bg-white px-6 py-8 text-[20px] font-semibold sm:block"
              style={{ boxShadow: "5px 6px 0 0 #171717", border: "2.5px solid #171717" }}
            >
              Enter
            </div>
          </div>
          <div>
            <h2 className="text-[34px] font-semibold leading-tight tracking-tight">
              Don't waste
              <br />
              your time
            </h2>
            <p className="mt-3 max-w-sm text-[13.5px] leading-relaxed text-[#5a5a56]">
              Copy-pasting between explorers, scripts and spreadsheets ends here. One canvas,
              every chain, your keys.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => document.querySelector("input")?.focus()}
                className="flex items-center gap-2 rounded-full bg-[#171717] px-6 py-3 text-[13.5px] font-bold text-white transition hover:scale-[1.02] active:scale-95"
              >
                <ArrowLeft size={14} /> Claim your spot
              </button>
              <Link
                to="/app"
                className="rounded-full border-2 border-[#171717] px-6 py-3 text-[13.5px] font-bold transition hover:bg-[#171717] hover:text-white active:scale-95"
              >
                Try the demo
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-[#e8e8e4] py-8 text-center text-[11.5px] text-[#9a9a93]">
        © 2026 Stringz — tooling only, never custody ·{" "}
        <Link to="/" className="font-semibold text-[#171717] hover:underline">Back to home</Link> ·{" "}
        <a href="/terms" className="hover:underline">Terms</a> ·{" "}
        <a href="/privacy" className="hover:underline">Privacy</a>
      </footer>
    </div>
  );
}
