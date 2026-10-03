import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lock, LogOut, RefreshCw, Users, Activity, Cloud, CreditCard, Wallet } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import Toast, { type ToastData } from "../components/Toast";
import { adminApi, type AdminStats, type AdminUser, type AdminRun } from "../lib/adminApi";

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_COLOR: Record<string, string> = {
  succeeded: "bg-emerald-500",
  success: "bg-emerald-500",
  failed: "bg-rose-400",
  auth_error: "bg-amber-400",
  timeout: "bg-orange-400",
  stale: "bg-purple-400",
  queued: "bg-sky-400",
  running: "bg-[#3d5f8a]",
  cancelled: "bg-gray-300",
  credited: "bg-emerald-500",
  dead: "bg-rose-400",
  processing: "bg-[#3d5f8a]",
};

const dot = (status: string) => STATUS_COLOR[status] ?? "bg-gray-300";

/** Operator monitoring dashboard: users, cloud processes, resource cost,
 *  settlements and a revenue estimate. Read-only; separate admin session. */
export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [runs, setRuns] = useState<AdminRun[]>([]);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const load = useCallback(async () => {
    const [s, u, r] = await Promise.all([adminApi.stats(), adminApi.users(30), adminApi.runs(30)]);
    setStats(s);
    setUsers(u.users);
    setRuns(r.runs);
  }, []);

  useEffect(() => {
    adminApi
      .session()
      .then(async (s) => {
        setAuthed(s.authed);
        if (s.authed) await load().catch(() => showToast("Could not load stats"));
      })
      .catch(() => setAuthed(false));
  }, [load]);

  // Auto-refresh while logged in.
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => load().catch(() => undefined), 60_000);
    return () => clearInterval(t);
  }, [authed, load]);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setLoginError(null);
    try {
      await adminApi.login(email, password);
      setAuthed(true);
      await load();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await adminApi.logout().catch(() => undefined);
    setAuthed(false);
    setStats(null);
  };

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-[13px] font-medium text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center bg-white px-5"
        style={{ backgroundImage: "radial-gradient(#e5eae5 1.3px, transparent 1.3px)", backgroundSize: "20px 20px" }}
      >
        <motion.form
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 260 }}
          onSubmit={submitLogin}
          className="w-full max-w-[380px] rounded-[28px] bg-white p-8 ring-1 ring-black/[0.05]"
        >
          <div className="flex justify-center">
            <BrandLogo />
          </div>
          <h1 className="mt-6 text-center text-[20px] font-extrabold tracking-tight text-[#1a1a1a]">
            Admin access
          </h1>
          <p className="mt-1 text-center text-[12.5px] text-gray-400">Monitoring only. All actions are logged.</p>
          <label className="mt-6 block">
            <span className="text-[11px] font-semibold text-gray-400">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-2xl bg-gray-50 px-4 py-3 text-[14px] font-medium text-[#1a1a1a] outline-none ring-1 ring-black/[0.06] focus:ring-2 focus:ring-[#1a1a1a]"
            />
          </label>
          <label className="mt-3 block">
            <span className="text-[11px] font-semibold text-gray-400">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-2xl bg-gray-50 px-4 py-3 text-[14px] font-medium text-[#1a1a1a] outline-none ring-1 ring-black/[0.06] focus:ring-2 focus:ring-[#1a1a1a]"
            />
          </label>
          {loginError && (
            <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2.5 text-[12.5px] font-medium text-rose-600">{loginError}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#1a1a1a] py-3.5 text-[14px] font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
          >
            <Lock size={15} /> {busy ? "Signing in…" : "Sign in"}
          </button>
        </motion.form>
        <Toast toast={toast} />
      </div>
    );
  }

  const successRate =
    stats && stats.runs.total ? Math.round((stats.runs.succeeded / stats.runs.total) * 1000) / 10 : 0;
  const settlementCount = (want: string) => stats?.settlements.find((s) => s.status === want)?.n ?? 0;

  const kpis = stats
    ? [
        { icon: Users, label: "Users", value: String(stats.users.total), sub: `+${stats.users.last7d} last 7d` },
        { icon: CreditCard, label: "Paid plans", value: String(stats.users.paid_plans), sub: `${stats.mrr ? `$${stats.mrr.mrrUsd.toFixed(2)} est. MRR` : "rail not linked"}` },
        { icon: Cloud, label: "Cloud runs", value: String(stats.runs.total), sub: `${stats.runs.active} active now` },
        { icon: Activity, label: "Success rate", value: `${successRate}%`, sub: `${stats.runs.last7d} runs last 7d` },
        { icon: Wallet, label: "Compute (est.)", value: `$${stats.runs.cost_usd.toFixed(2)}`, sub: "executed runs only" },
        { icon: RefreshCw, label: "Avg run", value: stats.runs.avg_duration_ms ? `${(stats.runs.avg_duration_ms / 1000).toFixed(1)}s` : "—", sub: "cloud runs" },
        { icon: Activity, label: "Local runs", value: String(stats.flowRuns.total), sub: `${stats.flowRuns.last7d} last 7d` },
        { icon: CreditCard, label: "Settlements", value: `${settlementCount("credited")} done`, sub: `${settlementCount("queued")} queued · ${settlementCount("dead")} dead` },
      ]
    : [];

  return (
    <div
      className="relative min-h-screen bg-white"
      style={{ backgroundImage: "radial-gradient(#e5eae5 1.3px, transparent 1.3px)", backgroundSize: "20px 20px" }}
    >
      <div className="mx-auto max-w-[1080px] px-5 pb-24 pt-8">
        {/* header */}
        <div className="flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <button
              onClick={() => load().catch(() => showToast("Refresh failed"))}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06] transition active:scale-95"
              aria-label="Refresh"
            >
              <RefreshCw size={16} className="text-[#1a1a1a]" />
            </button>
            <button
              onClick={logout}
              className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[12.5px] font-bold text-[#1a1a1a] ring-1 ring-black/[0.06] transition active:scale-95"
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        </div>

        <h1 className="mt-8 text-[28px] font-extrabold tracking-tight text-[#1a1a1a]">Operations</h1>
        <p className="mt-1 text-[12.5px] text-gray-400">Live view of users, processes and spend. Refreshes every 60s.</p>

        {!stats ? (
          <div className="mt-16 text-center text-[13.5px] font-medium text-gray-400">Reading stats…</div>
        ) : (
          <>
            {/* KPI grid */}
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {kpis.map((k, i) => (
                <motion.div
                  key={k.label}
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * i, type: "spring", damping: 26, stiffness: 260 }}
                  className="rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400">
                    <k.icon size={13} /> {k.label}
                  </div>
                  <div className="mt-1.5 text-[26px] font-extrabold leading-none tracking-tight text-[#1a1a1a]">{k.value}</div>
                  <div className="mt-1.5 text-[11px] font-medium text-gray-400">{k.sub}</div>
                </motion.div>
              ))}
            </div>

            {/* breakdowns */}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                { title: "Plans", rows: stats.plans.map((p) => ({ label: p.plan, n: p.n })) },
                { title: "Run outcomes", rows: stats.runStatuses.map((s) => ({ label: s.status, n: s.n })) },
                { title: "Settlements", rows: stats.settlements.length ? stats.settlements.map((s) => ({ label: s.status, n: s.n })) : [{ label: "none yet", n: 0 }] },
              ].map((card, ci) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.24 + ci * 0.05, type: "spring", damping: 26, stiffness: 260 }}
                  className="rounded-[24px] bg-white p-5 ring-1 ring-black/[0.05]"
                >
                  <h3 className="text-[15px] font-extrabold text-[#1a1a1a]">{card.title}</h3>
                  <div className="mt-3 space-y-2">
                    {card.rows.map((r) => (
                      <div key={r.label} className="flex items-center gap-2.5">
                        <span className={`h-2 w-2 rounded-full ${dot(r.label)}`} />
                        <span className="flex-1 text-[12.5px] font-medium capitalize text-gray-500">{r.label}</span>
                        <span className="text-[13px] font-extrabold text-[#1a1a1a]">{r.n}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* users table */}
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.36, type: "spring", damping: 26, stiffness: 260 }}
              className="mt-4 overflow-hidden rounded-[24px] bg-white ring-1 ring-black/[0.05]"
            >
              <div className="flex items-center justify-between px-5 pt-5">
                <h3 className="text-[15px] font-extrabold text-[#1a1a1a]">Recent users</h3>
                <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-500">newest 30</span>
              </div>
              <div className="no-scrollbar mt-3 overflow-x-auto pb-3">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-y border-gray-50 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
                      <th className="px-5 py-2.5">User</th>
                      <th className="px-3 py-2.5">Plan</th>
                      <th className="px-3 py-2.5">Onboarded</th>
                      <th className="px-3 py-2.5">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3">
                          <div className="text-[13px] font-bold text-[#1a1a1a]">{u.name ?? u.email ?? u.wallet_address ?? "—"}</div>
                          <div className="text-[11px] text-gray-400">{u.email ?? u.wallet_address ?? u.id.slice(0, 8)}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold capitalize text-gray-600">{u.plan}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`h-2.5 w-2.5 rounded-full ${u.onboarded ? "bg-emerald-500" : "bg-gray-200"}`} />
                        </td>
                        <td className="px-3 py-3 text-[12px] font-medium text-gray-500">{ago(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* runs table */}
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42, type: "spring", damping: 26, stiffness: 260 }}
              className="mt-4 overflow-hidden rounded-[24px] bg-white ring-1 ring-black/[0.05]"
            >
              <div className="flex items-center justify-between px-5 pt-5">
                <h3 className="text-[15px] font-extrabold text-[#1a1a1a]">Recent cloud processes</h3>
                <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-500">newest 30</span>
              </div>
              <div className="no-scrollbar mt-3 overflow-x-auto pb-3">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-y border-gray-50 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
                      <th className="px-5 py-2.5">Run</th>
                      <th className="px-3 py-2.5">User</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Duration</th>
                      <th className="px-3 py-2.5">Cost</th>
                      <th className="px-3 py-2.5">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center text-[12.5px] text-gray-400">
                          No cloud runs yet.
                        </td>
                      </tr>
                    )}
                    {runs.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3 font-mono text-[11.5px] font-semibold text-[#1a1a1a]">{r.id.slice(0, 8)}</td>
                        <td className="px-3 py-3 text-[12px] font-medium text-gray-500">{r.user_email ?? "—"}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-bold capitalize text-gray-600">
                            <span className={`h-2 w-2 rounded-full ${dot(r.status)}`} />
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[12px] font-medium text-gray-500">
                          {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}
                        </td>
                        <td className="px-3 py-3 text-[12px] font-medium text-gray-500">
                          {r.cost_est_usd ? `$${Number(r.cost_est_usd).toFixed(4)}` : "—"}
                        </td>
                        <td className="px-3 py-3 text-[12px] font-medium text-gray-500">{ago(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
