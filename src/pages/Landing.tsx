import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import LogoMark from "../components/LogoMark";
import { SERVICES } from "../data/services";
import { api } from "../lib/api";
import Toast, { type ToastData } from "../components/Toast";
import { PLANS, FEATURE_ROWS, usd } from "../lib/pricing";

/* ---------------- helpers ---------------- */

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { delay, type: "spring" as const, damping: 26, stiffness: 220 },
});

// function ChainDots() {
//   const chains = Object.values(CHAINS);
//   return (
//     <div className="flex -space-x-2">
//       {chains.map((c) => (
//         <span
//           key={c.name}
//           title={c.name}
//           className="h-9 w-9 rounded-full border-2 border-white shadow-sm"
//           style={{ backgroundColor: c.color }}
//         />
//       ))}
//     </div>
//   );
// }

/* ---------------- nav ---------------- */

function Nav() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-8">
      <Link to="/" aria-label="Stringz home">
        <BrandLogo />
      </Link>
      <nav className="hidden items-center gap-9 text-[14.5px] font-medium text-[#3c3c3c] md:flex">
        <a href="#top" className="transition hover:text-[#171717]">
          Home
        </a>
        <a href="#features" className="transition hover:text-[#171717]">
          Features
        </a>
        <a href="#how" className="transition hover:text-[#171717]">
          How it works
        </a>
      </nav>
      <Link
        to="/waitlist"
        className="flex items-center gap-2 rounded-full bg-[#171717] px-5 py-3 text-[13.5px] font-semibold text-white transition hover:scale-[1.02] active:scale-95"
      >
        Join the waitlist <ArrowRight size={14} />
      </Link>
    </header>
  );
}

/* ---------------- hero ---------------- */

function HeroGrid() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute left-1/2 top-24 grid w-[1400px] max-w-none -translate-x-1/2 grid-cols-6 gap-4 opacity-70">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-[#dcdcd8]" />
        ))}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative">
      <HeroGrid />
      <div className="relative mx-auto max-w-4xl px-6 pt-20 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 24, stiffness: 200 }}
          className="text-[44px] font-semibold leading-[1.08] tracking-tight text-[#171717] md:text-[64px]"
        >
          Automate on-chain workflows
          <br className="hidden md:block" /> in hours, not sprints
        </motion.h1>
        <motion.p
          {...fadeUp(0.1)}
          className="mx-auto mt-6 max-w-2xl text-[15.5px] leading-relaxed text-[#5a5a56]"
        >
          Stringz turns your ideas into production-ready Web3 automations —
          visual flows across price feeds, EVM events, swaps and CCIP, compiled
          for Chainlink CRE. No code. No custody. Your keys stay yours.
        </motion.p>
        <motion.div
          {...fadeUp(0.18)}
          className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
        >
          <Link
            to="/waitlist"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#171717] px-7 py-3.5 text-[14px] font-semibold text-white transition hover:scale-[1.02] active:scale-95 sm:w-auto"
          >
            Join the waitlist <ArrowRight size={15} />
          </Link>
          <Link
            to="/auth"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold text-[#171717] shadow-sm ring-1 ring-black/5 transition hover:scale-[1.02] active:scale-95 sm:w-auto"
          >
            Try the demo <ArrowUpRight size={15} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------- bento ---------------- */

function Bento() {
  return (
    <section className="mx-auto mt-16 grid max-w-6xl grid-cols-2 gap-4 px-6 md:grid-cols-4">
      {/* integrations */}
      <motion.div
        {...fadeUp(0)}
        className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-black/5"
      >
        <div className="flex gap-2">
          {(["price-feed", "evm-event", "ccip"] as const).map((s) => (
            <span
              key={s}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F4F4F1] ring-1 ring-black/5 [&>svg]:h-6 [&>svg]:w-6"
            >
              {SERVICES[s].icon}
            </span>
          ))}
        </div>
        <h3 className="mt-14 text-[20px] font-semibold tracking-tight text-[#171717]">
          Integrations
        </h3>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#7a7a74]">
          Price feeds, EVM events, swaps and CCIP — plug any chain straight into
          your flow.
        </p>
      </motion.div>

      {/* center: app screenshot */}
      <motion.div
        {...fadeUp(0.06)}
        className="relative row-span-2 overflow-hidden rounded-[28px] bg-[#171717] ring-1 ring-black/5"
      >
        <img
          src="/assets/auto3.jpg"
          alt="Stringz builder on mobile"
          className="absolute inset-x-0 bottom-0 w-full rounded-t-[28px] shadow-2xl ring-1 ring-white/10"
        />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#171717] to-transparent" />
        <p className="absolute inset-x-0 bottom-5 text-center text-[12px] font-semibold tracking-wide text-white/70">
          The builder, in your pocket
        </p>
      </motion.div>

      {/* mint stat */}
      <motion.div
        {...fadeUp(0.12)}
        className="rounded-[28px] bg-[#B9D3A8] p-6 ring-1 flex flex-col justify-between ring-black/5"
      >
        <div className="text-[52px] md:text-[82px] font-semibold leading-none tracking-tight text-[#171717]">
          100%
        </div>
        <p className="mt-3 text-[12.5px] font-medium leading-relaxed text-[#3d5233]">
          Self-custody. Stringz never holds keys, funds or signatures — tooling
          only.
        </p>
      </motion.div>

      {/* dark brand card */}
      <motion.div
        {...fadeUp(0.18)}
        className="flex flex-col items-center justify-center rounded-[28px] bg-[#171717] p-6 ring-1 ring-black/5"
      >
        <LogoMark className="h-20 w-auto" />
        <span className="mt-4 text-[13px] font-bold tracking-[0.2em] text-white/60">
          STRINGZ
        </span>
      </motion.div>

      {/* zero code */}
      <motion.div
        {...fadeUp(0.1)}
        className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-black/5"
      >
        <div className="text-[46px] font-semibold leading-none tracking-tight text-[#171717]">
          0
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-[#7a7a74]">
          Lines of code needed to ship an on-chain automation. Drag, drop,
          deploy.
        </p>
      </motion.div>

      {/* wide card */}
      <motion.div
        {...fadeUp(0.16)}
        className="col-span-2 flex items-center justify-between gap-6 rounded-[28px] bg-gradient-to-br from-[#E9F3F6] via-[#EDF1FB] to-[#FBE9EF] p-7 ring-1 ring-black/5"
      >
        <div>
          <h3 className="text-[22px] font-semibold leading-tight tracking-tight text-[#171717]">
            Automation for devs
            <br /> and noobs alike
          </h3>
          <p className="mt-2 max-w-[220px] text-[12.5px] leading-relaxed text-[#6d6d66]">
            Six chains, one canvas. Describe it in words or drag the nodes —
            Stringz handles the rest.
          </p>
        </div>
        <img src="/assets/auto1.webp" alt="For All" className="size-40" />
      </motion.div>
    </section>
  );
}

/* ---------------- stats row ---------------- */

function StatsRow() {
  const stats = [
    {
      big: "6+",
      sup: "",
      label:
        "EVM chains supported at launch — Ethereum, Base, Arbitrum and more",
    },
    {
      big: "1",
      sup: "",
      label:
        "Backend: Chainlink CRE - simulate locally today, DON when approved",
    },
    {
      big: "0",
      sup: "",
      label: "Custody. Keys, funds and compliance stay with you — always",
    },
  ];
  return (
    <section className="mx-auto mt-24 grid max-w-6xl grid-cols-1 gap-10 px-6 md:grid-cols-3">
      {stats.map((s, i) => (
        <motion.div
          key={s.big + i}
          {...fadeUp(i * 0.08)}
          className={`text-center ${i > 0 ? "md:border-l md:border-dashed md:border-[#d5d5cf]" : ""}`}
        >
          <div className="text-[64px] font-semibold leading-none tracking-tight text-[#171717]">
            {s.big}
            <sup className="text-[28px]">{s.sup}</sup>
          </div>
          <p className="mx-auto mt-4 max-w-[240px] text-[13px] leading-relaxed text-[#6d6d66]">
            {s.label}
          </p>
        </motion.div>
      ))}
    </section>
  );
}

/* ---------------- features ---------------- */

function MiniFlow() {
  return (
    <div className="rounded-2xl bg-[#F7F7F4] p-4 ring-1 ring-black/5">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold text-[#9a9a93]">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white ring-1 ring-black/5 [&>svg]:h-3.5 [&>svg]:w-3.5">
          {SERVICES["price-feed"].icon}
        </span>
        Price below $2,400
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#7BA488]" />
      </div>
      <div className="ml-3 border-l-2 border-dashed border-[#d8d8d2] pl-4">
        {[
          { s: "swap" as const, t: "Swap exact in · Base" },
          { s: "discord" as const, t: "Post alert to #trading" },
        ].map((r) => (
          <div
            key={r.t}
            className="mb-2 flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-[10.5px] font-semibold text-[#171717] ring-1 ring-black/5 [&>svg]:h-3.5 [&>svg]:w-3.5"
          >
            {SERVICES[r.s].icon} {r.t}
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniChart() {
  const bars = [34, 48, 40, 62, 55, 78, 70, 92];
  return (
    <div className="rounded-2xl bg-[#F7F7F4] p-4 ring-1 ring-black/5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold text-[#9a9a93]">
          Gas spent
        </span>
        <span className="text-[13px] font-bold text-[#171717]">0.163 ETH</span>
      </div>
      <div className="flex h-16 items-end gap-1.5">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${h}%`,
              backgroundColor: i === bars.length - 1 ? "#3F6B4F" : "#B9CFDD",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MiniSchedule() {
  return (
    <div className="rounded-2xl bg-[#F7F7F4] p-4 ring-1 ring-black/5">
      {[
        { t: "Every Sunday 09:00", d: "Auto-compound vault", c: "#E5F1E5" },
        { t: "On Transfer event", d: "Whale watcher", c: "#FAE9ED" },
        { t: "Price near (within 1%)", d: "ETH alert flow", c: "#E2EFFA" },
      ].map((r) => (
        <div
          key={r.d}
          className="mb-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[10.5px] font-semibold text-[#171717]"
          style={{ backgroundColor: r.c }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#171717]" />
          <span>{r.d}</span>
          <span className="ml-auto font-medium text-[#8a8a83]">{r.t}</span>
        </div>
      ))}
    </div>
  );
}

function Features() {
  const cards = [
    {
      title: "Visual Flow Builder",
      desc: "Compose triggers, contracts and apps on one canvas.",
      body: <MiniFlow />,
      wide: false,
    },
    {
      title: "Real-Time Analytics",
      desc: "Executions, gas and spend — tracked per flow.",
      body: <MiniChart />,
      wide: false,
    },
    {
      title: "Scheduled & Event-Driven",
      desc: "Cron, price thresholds and on-chain events as triggers.",
      body: <MiniSchedule />,
      wide: false,
    },
    {
      title: "AI-Powered Flow Design",
      desc: "Describe the outcome — Stringz drafts the nodes.",
      body: null,
      wide: false,
    },
    {
      title: "Team Collaboration",
      desc: "Shared orgs, roles and gas budgets per team.",
      body: null,
      wide: false,
    },
  ];
  return (
    <section id="features" className="mx-auto mt-28 max-w-6xl px-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <motion.h2
          {...fadeUp()}
          className="max-w-md text-[38px] font-semibold leading-[1.12] tracking-tight text-[#171717]"
        >
          Features to boost your on-chain game
        </motion.h2>
        <motion.p
          {...fadeUp(0.08)}
          className="max-w-sm text-[13.5px] leading-relaxed text-[#6d6d66]"
        >
          Built to help protocol teams, traders and tinkerers ship reliable Web3
          automation — without writing deployment scripts ever again.
        </motion.p>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.title}
            {...fadeUp(i * 0.06)}
            className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/5"
          >
            {c.body ?? (
              <div className="flex h-[104px] items-center justify-center rounded-2xl bg-[#F7F7F4] ring-1 ring-black/5">
                {c.title === "Team Collaboration" ? (
                  <div className="flex -space-x-2.5">
                    {[
                      "#3F6B4F",
                      "#5B5FC7",
                      "#C0435A",
                      "#b07d2b",
                      "#2E7D9A",
                    ].map((col, j) => (
                      <span
                        key={j}
                        className="h-10 w-10 rounded-full border-2 border-white"
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-full bg-[#171717] px-4 py-2 text-[11px] font-semibold text-white">
                    ✦ Ask Stringz AI
                  </div>
                )}
              </div>
            )}
            <h3 className="mt-4 text-[17px] font-semibold tracking-tight text-[#171717]">
              {c.title}
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#7a7a74]">
              {c.desc}
            </p>
          </motion.div>
        ))}
        <motion.div
          {...fadeUp(0.3)}
          className="flex flex-col justify-between rounded-[24px] bg-[#171717] p-6 ring-1 ring-black/5"
        >
          <p className="text-[17px] font-semibold leading-snug tracking-tight text-white">
            Simulate locally today. Deploy on the Chainlink CRE network when
            you're approved.
          </p>
          <Link
            to="/waitlist"
            className="mt-6 flex w-fit items-center gap-2 rounded-full bg-[#B9D3A8] px-5 py-2.5 text-[12.5px] font-bold text-[#171717] transition hover:scale-[1.03] active:scale-95"
          >
            Get early access <ArrowRight size={13} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------- steps ---------------- */

function Steps() {
  const steps = [
    {
      n: "Step 1",
      title: "Connect & set up",
      desc: "Sign in with your wallet or social account. Connect MetaMask in one tap — Stringz never holds your keys.",
      pill: "Connect wallet",
    },
    {
      n: "Step 2",
      title: "Build & automate",
      desc: "Start from a template or describe your flow. Drag nodes, pick chains, simulate the run before anything goes live.",
      pill: "Simulate first",
    },
    {
      n: "Step 3",
      title: "Deploy & scale",
      desc: "Compile to a CRE workflow and deploy when you're approved. Track executions and gas from the dashboard.",
      pill: "Deploy",
    },
  ];
  return (
    <section id="how" className="mx-auto mt-28 max-w-6xl px-6">
      <motion.h2
        {...fadeUp()}
        className="text-center text-[38px] font-semibold tracking-tight text-[#171717]"
      >
        Get started in 3 simple steps
      </motion.h2>
      <motion.p
        {...fadeUp(0.08)}
        className="mx-auto mt-4 max-w-lg text-center text-[13.5px] leading-relaxed text-[#6d6d66]"
      >
        From idea to a live on-chain automation in minutes — simulate safely,
        then deploy when you're ready.
      </motion.p>
      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <motion.div
            key={s.n}
            {...fadeUp(i * 0.08)}
            className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-black/5"
          >
            <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-[#F4F4F1] px-4 py-2 text-[12px] font-bold text-[#171717] ring-1 ring-black/5">
              {s.pill}
            </div>
            <span className="mt-6 inline-block rounded-full bg-[#171717] px-3 py-1 text-[11px] font-bold text-white">
              {s.n}
            </span>
            <h3 className="mt-3 text-[19px] font-semibold tracking-tight text-[#171717]">
              {s.title}
            </h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#7a7a74]">
              {s.desc}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- pricing ---------------- */

function Pricing() {
  const [yearly, setYearly] = useState(false);
  const accent: Record<string, string> = {
    community: "bg-[#E8A382]",
    pro: "bg-[#A8BCC8]",
    team: "bg-[#B5C9A8]",
  };
  return (
    <section id="pricing" className="mx-auto mt-28 max-w-6xl px-6">
      <div className="rounded-[36px] bg-[#151B17] px-6 py-14 md:px-12">
        <motion.h2
          {...fadeUp()}
          className="text-center text-[42px] font-semibold tracking-tight text-white"
        >
          Simple <span className="text-white/40">pricing</span>
        </motion.h2>
        <motion.p
          {...fadeUp(0.08)}
          className="mx-auto mt-4 max-w-md text-center text-[13.5px] leading-relaxed text-white/50"
        >
          Open core, like Supabase: the builder is open source and self-hosting is
          free forever. Paid plans fund the cloud we operate - and the free tier
          still includes cloud simulations every month.
        </motion.p>

        <div className="mt-6 flex items-center justify-center gap-3 text-[13px] font-semibold text-white/80">
          Monthly
          <button
            onClick={() => setYearly((y) => !y)}
            className={`h-7 w-12 rounded-full p-1 transition ${yearly ? "bg-[#B9D3A8]" : "bg-white/20"}`}
            aria-label="Toggle yearly pricing"
          >
            <div
              className={`h-5 w-5 rounded-full bg-[#151B17] transition-transform ${yearly ? "translate-x-5" : ""}`}
            />
          </button>
          Yearly <span className="text-[11px] font-bold text-[#B9D3A8]">(2 MONTHS FREE)</span>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {PLANS.map((p, i) => {
            const price = yearly ? p.annualCents : p.monthlyCents;
            return (
              <motion.div
                key={p.tier}
                {...fadeUp(i * 0.08)}
                className={`relative flex flex-col rounded-[28px] p-7 ${accent[p.tier]} text-[#171717]`}
              >
                {p.tier === "pro" && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#151B17] px-4 py-1.5 text-[10.5px] font-bold tracking-wide text-white">
                    MOST POPULAR
                  </span>
                )}
                <h3 className="text-[18px] font-bold tracking-tight">{p.name}</h3>
                <p className="mt-1 text-[12.5px] font-medium text-black/60">{p.tag}</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-[40px] font-semibold tracking-tight">
                    {usd(price)}
                  </span>
                  {price > 0 && <span className="text-[12px] font-medium text-black/50">/ {yearly ? "yearly" : "monthly"}</span>}
                </div>
                <Link
                  to="/auth"
                  className="mt-5 block rounded-full bg-[#151B17] py-3.5 text-center text-[13.5px] font-bold text-white transition hover:scale-[1.02] active:scale-95"
                >
                  {p.cta}
                </Link>
                <p className="mt-4 text-[12px] font-semibold text-black/70">
                  {p.monthlySims.toLocaleString("en-US")} cloud simulations / month
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* comparison table */}
        <motion.div {...fadeUp(0.1)} className="mt-12">
          <h3 className="text-[16px] font-semibold text-white">Key features</h3>
          <div className="mt-4 overflow-hidden rounded-[20px] ring-1 ring-white/10">
            {FEATURE_ROWS.map((row, i) => (
              <div
                key={row.label}
                className={`grid grid-cols-4 items-center gap-2 px-5 py-3.5 text-[12.5px] ${i % 2 === 0 ? "bg-white/[0.04]" : "bg-transparent"}`}
              >
                <span className="col-span-1 font-semibold text-white/70">{row.label}</span>
                {(["community", "pro", "team"] as const).map((tier) => (
                  <span key={tier} className="flex justify-center">
                    {row.values[tier] === "check" ? (
                      <Check size={15} strokeWidth={3} className="text-[#B9D3A8]" />
                    ) : row.values[tier] === null ? (
                      <span className="text-white/25">-</span>
                    ) : (
                      <span className="font-bold text-white/85">{row.values[tier]}</span>
                    )}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.p {...fadeUp(0.12)} className="mt-8 text-center text-[11.5px] leading-relaxed text-white/40">
          Paid in USDC or USDT on Base, Arbitrum, Avalanche, or Ethereum - 30-day and annual
          access, self-custody, cancel by simply not renewing. Self-hosting the open-source
          builder stays free forever, on every plan.
        </motion.p>
      </div>
    </section>
  );
}

/* ---------------- testimonials ---------------- */

function Testimonials() {
  const items = [
    {
      name: "DeFi Dan",
      role: "Protocol Ops",
      quote:
        "Replaced three cron jobs and a bash script with one Stringz canvas. Our treasury rebalances itself now.",
    },
    {
      name: "Amara O.",
      role: "Solo Trader",
      quote:
        "I'm not a dev. I described my whale alert in plain English and it was live on Base in ten minutes.",
    },
    {
      name: "0xLena",
      role: "DAO Contributor",
      quote:
        "The simulate-first flow saved us from a bad deploy twice. CRE gating is handled exactly right.",
    },
    {
      name: "Marcus T.",
      role: "Web3 Founder",
      quote:
        "Finally — n8n for Web3 that doesn't ask for my seed phrase. Tooling only, as it should be.",
    },
  ];
  return (
    <section className="mx-auto mt-28 max-w-6xl px-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <motion.h2
          {...fadeUp()}
          className="text-[38px] font-semibold tracking-tight text-[#171717]"
        >
          What builders say
        </motion.h2>
        <motion.p
          {...fadeUp(0.08)}
          className="max-w-sm text-[13.5px] leading-relaxed text-[#6d6d66]"
        >
          See how teams use Stringz to automate on-chain work and sleep better
          every night.
        </motion.p>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((t, i) => (
          <motion.div
            key={t.name}
            {...fadeUp(i * 0.06)}
            className="flex flex-col rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-black/5"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E5F1E5] text-[12px] font-bold text-[#3F6B4F]">
                {t.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <div className="text-[13.5px] font-bold text-[#171717]">
                  {t.name}
                </div>
                <div className="text-[11px] text-[#8a8a83]">{t.role}</div>
              </div>
            </div>
            <span className="mt-4 text-[22px] leading-none text-[#c9c9c2]">
              "
            </span>
            <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-[#5a5a54]">
              {t.quote}
            </p>
          </motion.div>
        ))}
      </div>
      <div className="mt-8 flex justify-center gap-3">
        <button
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white ring-1 ring-black/10 transition hover:scale-105"
          aria-label="Previous"
        >
          <ChevronLeft size={17} />
        </button>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#171717] text-white transition hover:scale-105"
          aria-label="Next"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </section>
  );
}

/* ---------------- final CTA + footer ---------------- */

function FinalCta() {
  return (
    <section className="relative mx-auto mt-28 max-w-6xl px-6 text-center">
      <HeroGrid />
      <motion.h2
        {...fadeUp()}
        className="relative text-[36px] font-semibold tracking-tight text-[#171717] md:text-[44px]"
      >
        Ready to automate on-chain?
      </motion.h2>
      <motion.p
        {...fadeUp(0.08)}
        className="relative mx-auto mt-4 max-w-md text-[13.5px] leading-relaxed text-[#6d6d66]"
      >
        Join the waitlist today — early builders get founding-member pricing and
        CRE fast-track guidance.
      </motion.p>
      <motion.div
        {...fadeUp(0.16)}
        className="relative mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
      >
        <Link
          to="/waitlist"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#171717] px-7 py-3.5 text-[14px] font-semibold text-white transition hover:scale-[1.02] active:scale-95 sm:w-auto"
        >
          Join the waitlist <ArrowRight size={15} />
        </Link>
        <Link
          to="/auth"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold text-[#171717] shadow-sm ring-1 ring-black/10 transition hover:scale-[1.02] active:scale-95 sm:w-auto"
        >
          Try the demo <ArrowUpRight size={15} />
        </Link>
      </motion.div>
    </section>
  );
}

function Footer() {
  const [email, setEmail] = useState("");
  const [toast, setToast] = useState<ToastData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const showToast = (text: string) => {
    setToast({ id: Date.now(), text });
    setTimeout(() => setToast(null), 2600);
  };
  const cols = [
    {
      h: "Product",
      links: ["Features", "Pricing", "Chains", "Templates", "Changelog"],
    },
    { h: "Company", links: ["About us", "Careers", "Blog", "Contact"] },
    {
      h: "Support",
      links: ["Help center", "Privacy policy", "Terms of service", "Community"],
    },
  ];
  return (
    <footer className="mx-auto mt-28 max-w-6xl px-6 pb-10">
      <div className="border-t border-[#dcdcd8] pt-14">
        <div className="flex flex-col justify-between gap-10 lg:flex-row">
          <div className="max-w-sm">
            <h3 className="text-[28px] font-semibold leading-tight tracking-tight text-[#171717]">
              Simplifying Web3 with visual flows
            </h3>
            <form
              className="mt-6 flex items-center gap-2 rounded-full bg-white p-1.5 ring-1 ring-black/10"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!email.includes("@") || saving) return;
                setSaving(true);
                setError(null);
                try {
                  await api.newsletter.subscribe({ email });
                  setEmail("");
                  showToast("You're subscribed — we'll keep you posted.");
                } catch {
                  setError(
                    "Couldn't subscribe - check the server is running and try again.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Mail size={16} className="ml-3 shrink-0 text-[#9a9a93]" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                type="email"
                className="w-full bg-transparent text-[13px] font-medium text-[#171717] outline-none placeholder:text-[#9a9a93]"
              />
              <button
                disabled={saving}
                className="shrink-0 rounded-full bg-[#171717] px-5 py-2.5 text-[12.5px] font-bold text-white transition active:scale-95 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Subscribe"}
              </button>
            </form>
            <p className="mt-3 text-[10.5px] text-[#9a9a93]">
              {error ?? "By subscribing you agree with our Privacy Policy."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-12 sm:grid-cols-3">
            {cols.map((c) => (
              <div key={c.h}>
                <h4 className="text-[13.5px] font-bold text-[#171717]">
                  {c.h}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map((l) => (
                    <li key={l}>
                      <a
                        href="#top"
                        className="text-[12.5px] text-[#7a7a74] transition hover:text-[#171717]"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-[#e4e4de] pt-6 text-[11.5px] text-[#8a8a83] md:flex-row">
          <span>
            © 2026 Stringz. All rights reserved. Tooling only — never custody.
          </span>
          <span className="flex gap-6">
            <a href="/terms" className="hover:text-[#171717]">
              Terms of service
            </a>
            <a href="/privacy" className="hover:text-[#171717]">
              Privacy policy
            </a>
          </span>
        </div>
      </div>
      <Toast toast={toast} />
    </footer>
  );
}

/* ---------------- page ---------------- */

// Pricing is temporarily hidden pre-launch; flip to true to restore the section.
const SHOW_PRICING = true;
// Testimonials are placeholder copy today. Flip to true once we have real
// user feedback to show.
const SHOW_TESTIMONIALS = false;

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#F2F2EF] font-sans text-[#171717] antialiased">
      <Nav />
      <Hero />
      <Bento />
      <StatsRow />
      <Features />
      <Steps />
      {SHOW_PRICING && <Pricing />}
      {/* Testimonials hidden until we have real feedback - re-enable when ready */}
      {SHOW_TESTIMONIALS && <Testimonials />}
      <FinalCta />
      <Footer />
    </div>
  );
}
