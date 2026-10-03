import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Lock, LogOut, RefreshCw, Users, Activity, Cloud, CreditCard, Wallet } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import Toast, { type ToastData } from "../components/Toast";
import { adminApi, type AdminStats, type AdminUser, type AdminRun, type AdminUserDetail, type AdminRunDetail } from "../lib/adminApi";

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

const PAGE_SIZE = 15;

/** Pretty-print a buffered NDJSON event for the run-detail sheet, capped so a
 *  single huge event cannot blow up the sheet. */
function prettyEvent(raw: string, cap = 1600): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
    return text.length > cap ? `${text.slice(0, cap)}…` : text;
  } catch {
    return raw.length > cap ? `${raw.slice(0, cap)}…` : raw;
  }
}

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between border-t border-gray-50 px-5 py-3">
      <span className="text-[11.5px] font-medium text-gray-400">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
          className="flex h-8 items-center gap-1 rounded-full bg-gray-50 px-3 text-[11.5px] font-bold text-[#1a1a1a] transition active:scale-95 disabled:opacity-30"
        >
          <ChevronLeft size={13} /> Newer
        </button>
        <span className="text-[11px] font-semibold text-gray-400">{page + 1}/{pages}</span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages - 1}
          className="flex h-8 items-center gap-1 rounded-full bg-gray-50 px-3 text-[11.5px] font-bold text-[#1a1a1a] transition active:scale-95 disabled:opacity-30"
        >
          Older <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-50 py-2.5 last:border-0">
      <span className="shrink-0 text-[11.5px] font-semibold text-gray-400">{label}</span>
      <span className={`break-all text-right text-[12.5px] font-semibold text-[#1a1a1a] ${mono ? "font-mono text-[11.5px]" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function UserDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminApi.userDetail(id).then(setDetail).catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [id]);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-[17px] font-extrabold tracking-tight text-[#1a1a1a]">User detail</SheetTitle>
        </SheetHeader>
        <div className="px-5 pb-8">
          {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-[12.5px] font-medium text-rose-600">{error}</p>}
          {!detail && !error && <div className="py-6 text-center text-[13px] font-medium text-gray-400">Loading…</div>}
          {detail && (
            <>
              <div className="mb-2 flex items-center gap-3">
                {detail.user.avatar ? (
                  <img src={detail.user.avatar} alt="" className="h-11 w-11 rounded-full object-cover ring-1 ring-black/[0.06]" />
                ) : (
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-[15px] font-extrabold text-gray-500">
                    {(detail.user.name ?? detail.user.email ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div>
                  <div className="text-[15px] font-extrabold text-[#1a1a1a]">{detail.user.name ?? "Unnamed"}</div>
                  <div className="text-[12px] text-gray-400">{detail.user.email ?? detail.user.wallet_address ?? "no contact"}</div>
                </div>
              </div>

          <Field label="ID" value={detail.user.id} mono />
          <Field label="Wallet" value={detail.user.wallet_address} mono />
          <Field label="Plan" value={`${detail.user.plan} (${detail.user.plan_status})`} />
          <Field label="Renewal" value={detail.user.plan_renewal_at ? `${ago(detail.user.plan_renewal_at)} (${detail.user.plan_renewal_at})` : null} mono={!!detail.user.plan_renewal_at} />
          <Field label="Rail entitlement" value={detail.entitlement ? `${detail.entitlement.plan} through ${detail.entitlement.paid_through}` : "none"} />
          <Field label="Onboarded" value={detail.onboarding ? "yes" : "no"} />
          {detail.onboarding && (
            <Field
              label="Onboarding"
              value={`${String(detail.onboarding.role ?? "?")} · heard via ${String(detail.onboarding.heard_from ?? "?")} · newsletter ${detail.onboarding.newsletter ? "yes" : "no"}`}
            />
          )}
          <Field label="Saved flows" value={String(detail.counts.flows)} />
          <Field label="Local runs" value={String(detail.counts.local_runs)} />
          <Field label="Cloud runs" value={String(detail.counts.cloud_runs)} />
          <Field label="Joined" value={detail.user.created_at} mono />

          {detail.settlements.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-gray-400">Payments</h4>
              {detail.settlements.map((s) => (
                <div key={s.tx_hash} className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold capitalize text-gray-600">
                    <span className={`h-2 w-2 rounded-full ${dot(s.status)}`} />
                    {s.plan} · {s.status}
                  </span>
                  <span className="font-mono text-[10.5px] text-gray-400">{s.tx_hash.slice(0, 12)}…</span>
                </div>
              ))}
            </div>
          )}

              {detail.recentRuns.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-gray-400">Recent cloud runs</h4>
                  {detail.recentRuns.map((r) => (
                    <div key={r.id} className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0">
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold capitalize text-gray-600">
                        <span className={`h-2 w-2 rounded-full ${dot(r.status)}`} />
                        {r.status}
                      </span>
                      <span className="text-[11px] text-gray-400">{ago(r.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RunDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminApi.runDetail(id).then(setDetail).catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [id]);

  const run = detail?.run;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-[17px] font-extrabold tracking-tight text-[#1a1a1a]">Process detail</SheetTitle>
        </SheetHeader>
        <div className="px-5 pb-8">
          {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-[12.5px] font-medium text-rose-600">{error}</p>}
          {!detail && !error && <div className="py-6 text-center text-[13px] font-medium text-gray-400">Loading…</div>}
          {run && (
            <>
              <Field label="Run ID" value={String(run.id)} mono />
              <Field label="User" value={run.user_email ?? "—"} />
              <Field label="Status" value={String(run.status)} />
              <Field label="Error class" value={run.error_class ? String(run.error_class) : null} />
              <Field label="Created" value={String(run.created_at)} mono />
              <Field label="Started" value={run.started_at ? String(run.started_at) : null} mono />
              <Field label="Duration" value={run.duration_ms ? `${(Number(run.duration_ms) / 1000).toFixed(1)}s` : null} />
              <Field label="Est. cost" value={run.cost_est_usd ? `$${Number(run.cost_est_usd).toFixed(4)}` : null} />
              <Field label="Source" value={run.src_gcs_uri ? String(run.src_gcs_uri) : null} mono />
              <Field label="Execution" value={run.execution_name ? String(run.execution_name) : null} mono />

              {typeof run.result === "string" && run.result && (
                <div className="mt-3">
                  <h4 className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-gray-400">Result</h4>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-gray-50 p-3 font-mono text-[11px] text-[#1a1a1a]">
                    {prettyEvent(run.result, 1200)}
                  </pre>
                </div>
              )}

              <div className="mt-3">
                <h4 className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-gray-400">
                  Event stream{detail && detail.eventCount > detail.events.length ? ` (first ${detail.events.length} of ${detail.eventCount})` : ""}
                </h4>
                {detail!.events.length === 0 ? (
                  <p className="text-[12px] text-gray-400">No buffered events.</p>
                ) : (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-gray-50 p-3 font-mono text-[11px] text-[#1a1a1a]">
                    {detail!.events.map((e) => prettyEvent(e)).join("\n")}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

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
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(0);
  const [runs, setRuns] = useState<AdminRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(0);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const loadStats = useCallback(async () => setStats(await adminApi.stats()), []);
  const loadUsers = useCallback(async (page: number) => {
    const r = await adminApi.users(PAGE_SIZE, page * PAGE_SIZE);
    setUsers(r.users);
    setUsersTotal(r.total);
  }, []);
  const loadRuns = useCallback(async (page: number) => {
    const r = await adminApi.runs(PAGE_SIZE, page * PAGE_SIZE);
    setRuns(r.runs);
    setRunsTotal(r.total);
  }, []);

  useEffect(() => {
    adminApi
      .session()
      .then(async (s) => {
        setAuthed(s.authed);
        if (s.authed) {
          await Promise.all([loadStats(), loadUsers(0), loadRuns(0)]).catch(() => showToast("Could not load stats"));
        }
      })
      .catch(() => setAuthed(false));
  }, [loadStats, loadUsers, loadRuns]);

  // Auto-refresh stats while logged in (tables keep their loaded page).
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => loadStats().catch(() => undefined), 60_000);
    return () => clearInterval(t);
  }, [authed, loadStats]);

  const gotoUsersPage = (p: number) => {
    setUsersPage(p);
    loadUsers(p).catch(() => showToast("Could not load users"));
  };
  const gotoRunsPage = (p: number) => {
    setRunsPage(p);
    loadRuns(p).catch(() => showToast("Could not load runs"));
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setLoginError(null);
    try {
      await adminApi.login(email, password);
      setAuthed(true);
      setUsersPage(0);
      setRunsPage(0);
      await Promise.all([loadStats(), loadUsers(0), loadRuns(0)]);
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
        { icon: CreditCard, label: "Paid plans", value: String(stats.mrr ? stats.mrr.activePaid : stats.users.paid_plans), sub: `${stats.mrr ? `$${stats.mrr.mrrUsd.toFixed(2)} est. MRR` : "rail not linked"}` },
        { icon: Cloud, label: "Cloud runs", value: String(stats.runs.total), sub: `${stats.runs.active} active now` },
        { icon: Activity, label: "Success rate", value: `${successRate}%`, sub: `${stats.runs.last7d} runs last 7d` },
        { icon: Wallet, label: "Compute (est.)", value: `$${stats.runs.cost_usd.toFixed(2)}`, sub: "executed runs only" },
        { icon: RefreshCw, label: "Avg run", value: stats.runs.avg_duration_ms ? `${(stats.runs.avg_duration_ms / 1000).toFixed(1)}s` : "—", sub: "cloud runs" },
        { icon: Activity, label: "Local runs", value: String(stats.flowRuns.total), sub: `${stats.flowRuns.last7d} last 7d` },
        { icon: CreditCard, label: "Settlements", value: `${settlementCount("credited")} done`, sub: `${settlementCount("queued")} queued · ${settlementCount("dead")} dead` },
      ]
    : [];

  return (
    // The detail sheets portal to body (shadcn/Radix), so normal document
    // scrolling is fine here - no fixed-height container needed.
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
              onClick={() =>
                Promise.all([loadStats(), loadUsers(usersPage), loadRuns(runsPage)]).catch(() => showToast("Refresh failed"))
              }
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
        <p className="mt-1 text-[12.5px] text-gray-400">Live view of users, processes and spend. Stats refresh every 60s. Tap a row for full detail.</p>

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
                <h3 className="text-[15px] font-extrabold text-[#1a1a1a]">Users</h3>
                <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-500">{usersTotal} total</span>
              </div>
              <div className="no-scrollbar mt-3 overflow-x-auto">
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
                      <tr
                        key={u.id}
                        onClick={() => setOpenUser(u.id)}
                        className="cursor-pointer border-b border-gray-50 transition last:border-0 hover:bg-gray-50/70"
                      >
                        <td className="px-5 py-3">
                          <div className="text-[13px] font-bold text-[#1a1a1a]">{u.name ?? u.email ?? "—"}</div>
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
              <Pagination page={usersPage} total={usersTotal} onPage={gotoUsersPage} />
            </motion.div>

            {/* runs table */}
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42, type: "spring", damping: 26, stiffness: 260 }}
              className="mt-4 overflow-hidden rounded-[24px] bg-white ring-1 ring-black/[0.05]"
            >
              <div className="flex items-center justify-between px-5 pt-5">
                <h3 className="text-[15px] font-extrabold text-[#1a1a1a]">Cloud processes</h3>
                <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-500">{runsTotal} total</span>
              </div>
              <div className="no-scrollbar mt-3 overflow-x-auto">
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
                      <tr
                        key={r.id}
                        onClick={() => setOpenRun(r.id)}
                        className="cursor-pointer border-b border-gray-50 transition last:border-0 hover:bg-gray-50/70"
                      >
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
              <Pagination page={runsPage} total={runsTotal} onPage={gotoRunsPage} />
            </motion.div>
          </>
        )}
      </div>

      {openUser && <UserDetailSheet id={openUser} onClose={() => setOpenUser(null)} />}
      {openRun && <RunDetailSheet id={openRun} onClose={() => setOpenRun(null)} />}
      <Toast toast={toast} />
    </div>
  );
}
