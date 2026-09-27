import type {
  AuthConfig,
  EmailSigninInput,
  EmailSignupInput,
  FlowSaveInput,
  NewsletterSubscribeInput,
  OnboardingSubmitInput,
  PublicUser,
  RunRecord,
  RunRecordInput,
  SavedFlow,
  SimulateEnqueueInput,
  SimulateEnqueueResponse,
  SimulateCancelInput,
  SimulateCancelResponse,
  BillingEntitlements,
  SimulateListResponse,
  SimulateRun,
  SiweVerifyInput,
  WaitlistJoinInput,
  WaitlistJoinResult,
} from "./contract";

/**
 * Typed client for the FlowKit tRPC server. It mirrors the router
 * (server/src/trpc/routers.ts) 1:1 over plain fetch - same-origin via the
 * Vite dev proxy (`/trpc` -> :8787) or a same-origin deployment in prod.
 * Shapes come from ./contract, the shared zod schemas, so drift fails typecheck.
 */

async function call<T>(path: string, input?: unknown): Promise<T> {
  const hasInput = input !== undefined;
  const res = await fetch(hasInput ? `/trpc/${path}` : `/trpc/${path}`, {
    method: hasInput ? "POST" : "GET",
    headers: hasInput ? { "content-type": "application/json" } : undefined,
    body: hasInput ? JSON.stringify(input) : undefined,
    credentials: "same-origin",
  });
  const body = (await res.json()) as { result?: { data: T }; error?: { message?: string } };
  if (!res.ok || body.error) {
    throw new Error(body.error?.message ?? `Request failed (${res.status})`);
  }
  return body.result!.data;
}

export const api = {
  config: {
    auth: () => call<AuthConfig>("config.auth"),
  },
  waitlist: {
    join: (input: WaitlistJoinInput) => call<WaitlistJoinResult>("waitlist.join", input),
  },
  newsletter: {
    subscribe: (input: NewsletterSubscribeInput) => call<{ ok: boolean }>("newsletter.subscribe", input),
  },
  auth: {
    me: () => call<PublicUser | null>("auth.me"),
    logout: () => call<{ ok: boolean }>("auth.logout", {}),
    emailSignup: (input: EmailSignupInput) => call<PublicUser>("auth.emailSignup", input),
    emailSignin: (input: EmailSigninInput) => call<PublicUser>("auth.emailSignin", input),
    siweNonce: () => call<{ nonce: string }>("auth.siweNonce"),
    siweVerify: (input: SiweVerifyInput) => call<PublicUser>("auth.siweVerify", input),
  },
  flows: {
    save: (input: FlowSaveInput) => call<{ id: string }>("flows.save", input),
    list: () => call<SavedFlow[]>("flows.list"),
    remove: (input: { id: string }) => call<{ ok: boolean }>("flows.remove", input),
  },
  billing: {
    /** Verify a wallet payment with the stringz-pay rail (server-held key). */
    verify: (input: { chain: string; txHash: string; plan: "pro_monthly" | "pro_annual" | "team_monthly" | "team_annual" }) =>
      call<{ credited: boolean; alreadyCredited: boolean; plan: string; paidThrough: string }>("billing.verify", input),
    entitlements: () => call<BillingEntitlements>("billing.entitlements"),
  },
  onboarding: {
    submit: (input: OnboardingSubmitInput) => call<{ ok: boolean }>("onboarding.submit", input),
  },
  runs: {
    record: (input: RunRecordInput) => call<{ ok: boolean }>("runs.record", input),
    recent: (input: { limit: number }) => call<RunRecord[]>("runs.recent", input),
  },
  simulate: {
    enqueue: (input: SimulateEnqueueInput) => call<SimulateEnqueueResponse>("simulate.enqueue", input),
    status: (input: { runId: string }) => call<SimulateRun>("simulate.status", input),
    cancel: (input: SimulateCancelInput) => call<SimulateCancelResponse>("simulate.cancel", input),
    list: () => call<SimulateListResponse>("simulate.list"),
  },
};
