/** Admin dashboard API client. Talks to the server's /admin routes (separate
 *  operator session cookie, never the app user's tRPC surface). */

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/admin/api${path}`, {
    credentials: "same-origin",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export interface AdminStats {
  users: { total: number; last24h: number; last7d: number; paid_plans: number };
  plans: { plan: string; n: number }[];
  runs: {
    total: number;
    last24h: number;
    last7d: number;
    active: number;
    succeeded: number;
    failed: number;
    cost_usd: number;
    avg_duration_ms: number;
  };
  runStatuses: { status: string; n: number }[];
  flowRuns: { total: number; last7d: number };
  settlements: { status: string; n: number }[];
  billingEvents: number;
  mrr: { mrrUsd: number; activePaid: number } | null;
}

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  plan: string;
  plan_status: string;
  created_at: string;
  wallet_address: string | null;
  onboarded: boolean;
}

export interface AdminRun {
  id: string;
  status: string;
  error_class: string | null;
  duration_ms: number | null;
  cost_est_usd: string | null;
  created_at: string;
  user_email: string | null;
}

export interface AdminUserDetail {
  user: AdminUser & { avatar: string | null; plan_renewal_at: string | null; plan_provider: string | null; plan_ref: string | null };
  counts: { flows: number; local_runs: number; cloud_runs: number };
  onboarding: Record<string, unknown> | null;
  entitlement: { plan: string; paid_through: string } | null;
  settlements: { status: string; chain: string; tx_hash: string; plan: string; attempts: number; last_error: string | null; created_at: string }[];
  recentRuns: { id: string; status: string; error_class: string | null; duration_ms: number | null; cost_est_usd: string | null; created_at: string }[];
}

export interface AdminRunDetail {
  run: Record<string, unknown> & { id: string; status: string; user_email: string | null };
  events: string[];
  eventCount: number;
}

export const adminApi = {
  session: () => call<{ authed: boolean }>("/session"),
  login: (email: string, password: string) =>
    call<{ ok: boolean }>("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => call<{ ok: boolean }>("/logout", { method: "POST" }),
  stats: () => call<AdminStats>("/stats"),
  users: (limit = 50, offset = 0) =>
    call<{ total: number; users: AdminUser[] }>(`/users?limit=${limit}&offset=${offset}`),
  userDetail: (id: string) => call<AdminUserDetail>(`/users/${id}`),
  runs: (limit = 50, offset = 0) =>
    call<{ total: number; runs: AdminRun[] }>(`/runs?limit=${limit}&offset=${offset}`),
  runDetail: (id: string) => call<AdminRunDetail>(`/runs/${id}`),
};
