import { Storage } from "@google-cloud/storage";
import { CloudTasksClient } from "@google-cloud/tasks";
import { ExecutionsClient, JobsClient } from "@google-cloud/run";
import { OAuth2Client } from "google-auth-library";
import { and, eq, gt, sql } from "drizzle-orm";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db, pool, schema } from "./db/client";
import { scrubSecretValues } from "./scrub";
import { TIER_SIM_LIMITS, type Tier } from "../../src/lib/pricing";

/**
 * Cloud simulation orchestration. A run's life:
 *   enqueue -> user PUTs the project tarball to a signed URL -> Cloud Tasks
 *   POSTs /sim-dispatch -> the API starts the Cloud Run Job -> the runner
 *   streams NDJSON events to /sim-ingest during execution (Phase 2, HMAC-
 *   tokened) and uploads the full NDJSON stream to a signed URL at the end ->
 *   polling reconciles the row from the uploaded result object.
 *
 * Env-gated: without SIM_BUCKET every entry point throws, so instances with no
 * bucket configured stay inert.
 */

const bucketName = process.env.SIM_BUCKET ?? "";
const queueName = process.env.SIM_QUEUE ?? "simulation-dispatch";
const queueLocation = process.env.SIM_QUEUE_LOCATION ?? "us-central1";
const jobName = process.env.SIM_JOB_NAME ?? "sim-runner";
const jobLocation = process.env.SIM_JOB_LOCATION ?? "us-central1";
const projectId = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "";

export const cloudSimEnabled = bucketName.length > 0;

/** Signed PUT TTL for the project upload; also reported as uploadExpiresAt. */
export const PROJECT_UPLOAD_TTL_MS = 60 * 60 * 1000;
const DOWNLOAD_TTL_MS = 15 * 60 * 1000;
const RESULT_UPLOAD_TTL_MS = 60 * 60 * 1000;
const STALE_RUNNING_MS = 15 * 60 * 1000;
const MAX_EVENTS = 500;

// ── Phase 4 Slice 4A: per-user rate caps (issue #11) ─────────────────────────
//
// Trial billing has no budget-alert API, so cost ceilings are enforced here,
// in-app, before any GCS write or task dispatch. Env-tunable; defaults match
// the Phase 4 plan (50 runs per rolling 24h, 3 concurrent).
const intFromEnv = (v: string | undefined, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : dflt;
};

/** Max runs a user may have queued + running at once. */
export const RATE_LIMIT_MAX_INFLIGHT = intFromEnv(process.env.SIM_RATE_MAX_INFLIGHT, 3);
/** Rolling window for the monthly runs quota. */
export const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000 * 30;

// ── Phase 4 Slice 4C: payload + log caps ─────────────────────────────────────
//
// Signed-URL PUT cannot be size-capped, so dispatch measures the uploaded
// object and refuses before any job starts. The runner re-checks
// post-download for file:// sources and local runs.
/** Max compiled-project size in bytes (env: SIM_MAX_PROJECT_BYTES). */
export const MAX_PROJECT_BYTES = intFromEnv(process.env.SIM_MAX_PROJECT_BYTES, 10 * 1024 * 1024);

// ── Phase 5 Slice 5A: per-run metering ───────────────────────────────────────
/** Estimated Cloud Run task cost per executed second: 1 vCPU + 512 MiB at the
 *  us-central1 active rate ($0.000024/vCPU-s + $0.0000025/GiB-s). This feeds
 *  dashboards and quota economics - an estimate, not a billing figure. */
export const RUN_COST_PER_SECOND_USD = 0.0000253;

/** Duration (ms) -> cost estimate as a fixed 8-decimal string for numeric(14,8). */
export function costEstimateFor(durationMs: number): string {
  const usd = (durationMs / 1000) * RUN_COST_PER_SECOND_USD;
  return (Math.round(usd * 1e8) / 1e8).toFixed(8);
}

/** Wall-time from a run's startedAt (dispatch) to now, with a pre-5A fallback. */
function meteredDurationMs(row: { startedAt: string | null; updatedAt: string }): number {
  const from = row.startedAt ?? row.updatedAt;
  return Math.max(0, Date.now() - new Date(from).getTime());
}

// ── Phase 4 Slice 4D: log-redaction backstop ─────────────────────────────────
//
// The runner already scrubs full secret values from every emitted line
// (classify.sh classify_redact + stream.ts scrubSecrets). This backstop re-
// scrubs each event at the API boundary before it reaches the stream table,
// so a value that slips past a runner emitter still cannot persist. Values
// come from the run's secrets object, fetched once per run and cached in
// memory for the run's lifetime; the entry drops at terminal reconcile.
// Semantic matches the runner on purpose: full-value masking only, <4-char
// values skipped, partial echoes are accepted residual.

const secretValueCache = new Map<string, string[]>();
const SECRET_CACHE_MAX_RUNS = 1000;

async function secretValuesForRun(runId: string): Promise<string[]> {
  const cached = secretValueCache.get(runId);
  if (cached) return cached;
  const values: string[] = [];
  try {
    const file = getStorage().bucket(bucketName).file(secretsObject(runId));
    const [exists] = await file.exists();
    if (exists) {
      const [buf] = await file.download();
      const parsed = JSON.parse(buf.toString("utf8")) as Record<string, string>;
      for (const v of Object.values(parsed)) if (typeof v === "string" && v.length >= 4) values.push(v);
    }
  } catch {
    // secrets object gone or unreadable - nothing to scrub with; the runner
    // scrubbed what it could before its own teardown delete
  }
  if (secretValueCache.size >= SECRET_CACHE_MAX_RUNS) {
    const oldest = secretValueCache.keys().next().value;
    if (oldest !== undefined) secretValueCache.delete(oldest);
  }
  secretValueCache.set(runId, values);
  return values;
}

/** Enforce the per-user caps at enqueue time. Throws with a clear error when
 *  over budget. A per-user advisory xact lock serializes concurrent enqueues
 *  so two simultaneous requests cannot both pass the counts (READ COMMITTED
 *  alone would let both snapshot the same count). The lock is transactional,
 *  so it releases with the insert commit or rollback.
 *
 *  Phase 5 Slice 5C: the monthly quota is tier-based (Free 50 / Pro 1,000 /
 *  Team 4,000 per rolling 30 days), from the same entitlements source the
 *  billing surface shows. */
export async function assertRateLimits(userId: string, tier: Tier): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const [recent] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.simulationRuns)
    .where(sql`${schema.simulationRuns.userId} = ${userId} and ${schema.simulationRuns.createdAt} >= ${windowStart}`);
  const monthlyLimit = TIER_SIM_LIMITS[tier];
  if ((recent?.count ?? 0) >= monthlyLimit) {
    throw new Error(
      tier === "community"
        ? `Free tier includes ${monthlyLimit} cloud simulations per 30 days - upgrade to Pro for 1,000, or export and self-host for unlimited.`
        : `Your plan includes ${monthlyLimit.toLocaleString("en-US")} cloud simulations per 30 days - it resets as older runs age out.`,
    );
  }
  const [inflight] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.simulationRuns)
    .where(sql`${schema.simulationRuns.userId} = ${userId} and ${schema.simulationRuns.status} in ('queued', 'running')`);
  if ((inflight?.count ?? 0) >= RATE_LIMIT_MAX_INFLIGHT) {
    throw new Error(`Too many simulations in flight (max ${RATE_LIMIT_MAX_INFLIGHT}) - wait for one to finish.`);
  }
}

export type SimulationRunRow = typeof schema.simulationRuns.$inferSelect;
export type SimulationEvent = Record<string, unknown>;

export function assertCloudSimEnabled(): void {
  if (!cloudSimEnabled) throw new Error("Cloud simulation is not enabled on this instance");
  if (!projectId) throw new Error("Cloud simulation is enabled but no GCP project id is set (GCP_PROJECT_ID)");
}

const appUrl = () => process.env.PUBLIC_APP_URL ?? "http://localhost:3000";

// Lazy clients so importing this module never touches the network or ADC.
let storage: Storage | null = null;
let tasks: CloudTasksClient | null = null;
let jobs: JobsClient | null = null;
let executions: ExecutionsClient | null = null;
let oauth2: OAuth2Client | null = null;
const getStorage = () => (storage ??= new Storage());
const getTasks = () => (tasks ??= new CloudTasksClient());
const getJobs = () => (jobs ??= new JobsClient());
const getExecutions = () => (executions ??= new ExecutionsClient());
const getOAuth2 = () => (oauth2 ??= new OAuth2Client());

const projectObject = (runId: string) => `projects/${runId}.tar.gz`;
const resultObject = (runId: string) => `results/${runId}.ndjson`;
const secretsObject = (runId: string) => `secrets/${runId}.json`;

/** gs:// URI of the uploaded project archive, recorded on the row at enqueue. */
export function srcObjectUri(runId: string): string {
  return `gs://${bucketName}/${projectObject(runId)}`;
}

export async function signUploadUrl(runId: string): Promise<string> {
  assertCloudSimEnabled();
  const [url] = await getStorage().bucket(bucketName).file(projectObject(runId)).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + PROJECT_UPLOAD_TTL_MS,
    contentType: "application/gzip",
  });
  return url;
}

export async function signProjectDownloadUrl(runId: string): Promise<string> {
  assertCloudSimEnabled();
  const [url] = await getStorage().bucket(bucketName).file(projectObject(runId)).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + DOWNLOAD_TTL_MS,
  });
  return url;
}

export async function signResultUploadUrl(runId: string): Promise<string> {
  assertCloudSimEnabled();
  const [url] = await getStorage().bucket(bucketName).file(resultObject(runId)).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + RESULT_UPLOAD_TTL_MS,
  });
  return url;
}

// ── Phase 3: run-scoped ephemeral secrets ────────────────────────────────────
//
// The client sends secrets in the enqueue body; the API writes them to a
// run-scoped GCS object (never the DB, never logs), dispatch hands the runner
// a short-lived signed GET, and reconcile deletes the object once the run is
// terminal. Lifecycle rules also purge the prefix as a backstop.

const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_SECRETS = 32;
const MAX_SECRET_VALUE_CHARS = 4096;

/** Validate + persist a run's secrets object. Throws with a clear message on bad input. */
export async function writeRunSecrets(runId: string, secrets: Record<string, string>): Promise<boolean> {
  assertCloudSimEnabled();
  const entries = Object.entries(secrets).filter(([, v]) => v.length > 0);
  if (!entries.length) return false;
  if (entries.length > MAX_SECRETS) throw new Error(`Too many secrets (max ${MAX_SECRETS})`);
  for (const [k, v] of entries) {
    if (!SECRET_NAME_RE.test(k)) throw new Error(`Invalid secret name "${k}" (letters, digits, underscore; no leading digit)`);
    if (k.length > 128) throw new Error(`Secret name "${k.slice(0, 24)}..." is too long`);
    if (v.includes("\n") || v.includes("\r")) throw new Error(`Secret "${k}" must be a single line`);
    if (v.length > MAX_SECRET_VALUE_CHARS) throw new Error(`Secret "${k}" is too long (max ${MAX_SECRET_VALUE_CHARS} chars)`);
  }
  await getStorage().bucket(bucketName).file(secretsObject(runId)).save(JSON.stringify(Object.fromEntries(entries)), {
    contentType: "application/json",
  });
  return true;
}

/** Signed GET for the runner; 404 is expected when the run carries no secrets. */
export async function signSecretsUrl(runId: string): Promise<string> {
  assertCloudSimEnabled();
  const [url] = await getStorage().bucket(bucketName).file(secretsObject(runId)).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + DOWNLOAD_TTL_MS,
  });
  return url;
}

/** Signed DELETE so the RUNNER destroys the secrets object at actual run end
 *  (reconcile-time deletion is lazy - polls may never come). */
export async function signSecretsDeleteUrl(runId: string): Promise<string> {
  assertCloudSimEnabled();
  const [url] = await getStorage().bucket(bucketName).file(secretsObject(runId)).getSignedUrl({
    version: "v4",
    action: "delete",
    expires: Date.now() + DOWNLOAD_TTL_MS,
  });
  return url;
}

/** Best-effort purge of a run's secrets; runs at reconcile AND at runner teardown. */
export async function deleteRunSecrets(runId: string): Promise<void> {
  if (!cloudSimEnabled) return;
  try {
    await getStorage().bucket(bucketName).file(secretsObject(runId)).delete();
  } catch {
    // already gone, or transient GCS error - lifecycle rules are the backstop
  }
}

// ── Phase 4 Slice 4B: kill runaway runs ──────────────────────────────────────
//
// dispatch hands the run to a Cloud Run job task; runJob's await resolves in
// seconds (probe-verified), so the execution object is resolved afterwards by
// matching the RUN_ID container-env override on the job's executions. The env
// match is race-free: unlike "newest execution", two concurrent dispatches
// cannot confuse each other's execution. The stored execution name powers the
// user cancel and the stale-sweep kill. Live-probed 2026-09-27: cancel of a
// hung task landed as Completed=False, reason=Cancelled.

const jobResourcePath = () => `projects/${projectId}/locations/${jobLocation}/jobs/${jobName}`;

function executionHasRunId(execution: unknown, runId: string): boolean {
  const containers =
    (execution as { template?: { containers?: { env?: { name?: string; value?: string }[] }[] } })?.template?.containers ?? [];
  return containers.some((c) => (c.env ?? []).some((e) => e.name === "RUN_ID" && e.value === runId));
}

/** Best-effort cancel of a Cloud Run execution. All errors ignored - the
 *  execution may already be finished or gone. */
async function cancelExecutionByName(name: string | null): Promise<void> {
  if (!name) return;
  try {
    await getExecutions().cancelExecution({ name });
  } catch {
    // already terminal or gone - nothing left to kill
  }
}

/** Resolve the execution a dispatch created and remember it on the row.
 *  Polls briefly (the object appears a few seconds after runJob). If the run
 *  was cancelled while resolving, cancel the execution immediately. */
async function recordExecutionForRun(runId: string): Promise<string> {
  try {
    for (let attempt = 0; attempt < 15; attempt++) {
      const [list] = await getExecutions().listExecutions({ parent: jobResourcePath(), pageSize: 50 }, { autoPaginate: false });
      const hit = (list ?? []).find((e) => executionHasRunId(e, runId));
      if (hit?.name) {
        await db.update(schema.simulationRuns).set({ executionName: hit.name }).where(eq(schema.simulationRuns.id, runId));
        const [row] = await db
          .select({ status: schema.simulationRuns.status })
          .from(schema.simulationRuns)
          .where(eq(schema.simulationRuns.id, runId))
          .limit(1);
        if (row?.status === "cancelled") await cancelExecutionByName(hit.name);
        return hit.name;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch {
    // best effort - cancel re-resolves on demand
  }
  return "";
}

export type CancelOutcome = "not-found" | "not-cancellable" | "ok";

/** User-initiated cancel. Marks the row first so no dispatch can pick it up,
 *  sweeps secrets, then kills the Cloud Run execution when one exists (a
 *  still-queued run has no execution yet - nothing to kill). */
export async function cancelRun(runId: string, userId: string): Promise<CancelOutcome> {
  assertCloudSimEnabled();
  const [row] = await db.select().from(schema.simulationRuns).where(eq(schema.simulationRuns.id, runId)).limit(1);
  if (!row || row.userId !== userId) return "not-found";
  if (row.status !== "queued" && row.status !== "running") return "not-cancellable";
  const durationMs = row.status === "running" ? meteredDurationMs(row) : 0;
  await db.update(schema.simulationRuns).set({
    status: "cancelled",
    ...(durationMs > 0 ? { durationMs, costEstUsd: costEstimateFor(durationMs) } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.simulationRuns.id, runId));
  void deleteRunSecrets(runId);
  const execName = row.executionName ?? (await recordExecutionForRun(runId));
  await cancelExecutionByName(execName);
  return "ok";
}

/** Push a dispatch task onto the queue. Returns the created task name.
 *  Trigger inputs ride the task body (they are not secret and stay small);
 *  dispatch forwards them to the runner as CLI flags. */
export async function enqueueTask(runId: string, triggerInput?: { httpPayload?: string; evmTxHash?: string }): Promise<string> {
  assertCloudSimEnabled();
  const audience = `${appUrl()}/sim-dispatch`;
  const client = getTasks();
  const [task] = await client.createTask({
    parent: client.queuePath(projectId, queueLocation, queueName),
    task: {
      httpRequest: {
        httpMethod: "POST",
        url: audience,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify({ runId, ...triggerInput })).toString("base64"),
        // The Cloud Tasks API requires an explicit SA email here (it does NOT
        // default to the caller's identity). It must be an SA the Cloud Tasks
        // service agent can impersonate - flowkit-api-run was granted that.
        oidcToken: {
          serviceAccountEmail: process.env.SIM_DISPATCH_SA_EMAIL ?? `flowkit-api-run@${projectId}.iam.gserviceaccount.com`,
          audience,
        },
      },
      scheduleTime: { seconds: Math.floor(Date.now() / 1000) },
    },
  });
  return task.name ?? "";
}

export type DispatchOutcome = "not-found" | "not-queued" | "ok";

/** Transition a queued run to running and kick the Cloud Run Job. Trigger
 *  inputs arrive on the dispatch request body (via the queue task). */
export async function dispatchRun(runId: string, triggerInput?: { httpPayload?: string; evmTxHash?: string }): Promise<DispatchOutcome> {
  assertCloudSimEnabled();
  const [row] = await db.select().from(schema.simulationRuns).where(eq(schema.simulationRuns.id, runId)).limit(1);
  if (!row) return "not-found";
  if (row.status !== "queued") return "not-queued";
  // Phase 4 Slice 4C: refuse oversized projects BEFORE starting a job (the
  // signed PUT itself cannot be size-capped). The client uploads right after
  // enqueue, so the object may not exist yet when this task fires - poll for
  // it briefly (the live 4C validation caught the race: a slow PUT let the
  // task through before the object landed, dispatching a job that died on a
  // 404 download and held the row 'running' until the stale sweep). A still-
  // missing object after the grace window falls through to the runner, which
  // surfaces it as today.
  const projectFile = getStorage().bucket(bucketName).file(projectObject(runId));
  let meta: { size?: string } | null = null;
  for (let attempt = 0; attempt < 15 && !meta; attempt++) {
    try {
      const [m] = await projectFile.getMetadata();
      meta = m as { size?: string };
    } catch (err) {
      if ((err as { code?: number }).code !== 404) break; // real error - let the runner deal
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (meta) {
    const size = Number(meta.size ?? 0);
    if (size > MAX_PROJECT_BYTES) {
      const patch = { status: "failed", errorClass: "payload_too_large", updatedAt: new Date().toISOString() };
      await db.update(schema.simulationRuns).set(patch).where(eq(schema.simulationRuns.id, runId));
      void projectFile.delete();
      void deleteRunSecrets(runId);
      return "ok";
    }
  }
  const now = new Date().toISOString();
  await db.update(schema.simulationRuns).set({ status: "running", startedAt: now, updatedAt: now }).where(eq(schema.simulationRuns.id, runId));
  const [srcUrl, resultUrl, secretsUrl, secretsDeleteUrl] = await Promise.all([
    signProjectDownloadUrl(runId),
    signResultUploadUrl(runId),
    signSecretsUrl(runId),
    signSecretsDeleteUrl(runId),
  ]);
  try {
    await getJobs().runJob({
      name: `projects/${projectId}/locations/${jobLocation}/jobs/${jobName}`,
      overrides: {
        containerOverrides: [
          {
            env: [
              { name: "SRC_URL", value: srcUrl },
              { name: "RESULT_URL", value: resultUrl },
              { name: "RUN_ID", value: runId },
              { name: "TRIGGER_IDX", value: String(row.triggerIdx) },
              // Phase 2: live event stream back to the API. The runner only
              // starts POSTing once its build includes the ingest client;
              // until then these are inert extra env vars.
              { name: "INGEST_URL", value: `${appUrl()}/sim-ingest?runId=${runId}` },
              { name: "INGEST_TOKEN", value: ingestTokenFor(runId) },
              // Phase 3: signed GET for the run's ephemeral secrets; a 404
              // means the run has none. SECRETS_DELETE_URL lets the runner
              // destroy the object at actual run end (reconcile deletion is
              // lazy - a run nobody polls again would otherwise keep its
              // secrets until the lifecycle purge).
              { name: "SECRETS_URL", value: secretsUrl },
              { name: "SECRETS_DELETE_URL", value: secretsDeleteUrl },
              // Phase 3 Slice 3B: trigger inputs for the CLI flags; the
              // runner only adds the flags when set.
              { name: "HTTP_PAYLOAD", value: triggerInput?.httpPayload ?? "" },
              { name: "EVM_TX_HASH", value: triggerInput?.evmTxHash ?? "" },
            ],
          },
        ],
      },
    });
  } catch (err) {
    // The job never started: go back to queued so the queue's retry (or the
    // next user poll) gets a real second attempt instead of a row stuck
    // "running" until the stale sweep.
    await db.update(schema.simulationRuns).set({ status: "queued", updatedAt: new Date().toISOString() }).where(eq(schema.simulationRuns.id, runId));
    throw err;
  }
  // Phase 4 Slice 4B: resolve the created execution (RUN_ID env match) in the
  // background and store it on the row - this is what cancel/stale-kill target.
  void recordExecutionForRun(runId);
  return "ok";
}

/** Verify a Cloud Tasks OIDC Bearer token for the dispatch endpoint. */
export async function verifyDispatchToken(authHeader: string | undefined, audience: string): Promise<boolean> {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return false;
  try {
    const ticket = await getOAuth2().verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    return !!payload?.email_verified && payload.aud === audience;
  } catch {
    return false;
  }
}

/** Parse the uploaded NDJSON stream; tolerates bad lines, keeps the tail. */
async function loadEvents(runId: string): Promise<SimulationEvent[]> {
  const file = getStorage().bucket(bucketName).file(resultObject(runId));
  const [exists] = await file.exists();
  if (!exists) return [];
  const [buf] = await file.download();
  const events: SimulationEvent[] = [];
  for (const line of buf.toString("utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as SimulationEvent);
    } catch {
      // tolerate bad lines
    }
  }
  return events.slice(-MAX_EVENTS);
}

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "auth_error", "timeout", "cancelled"]);

/**
 * Move a row towards its final state from the uploaded result object. Running
 * rows with a result transition to their terminal status; running rows whose
 * result never arrives go stale after 15 minutes. Terminal rows get their
 * event stream re-read so status polls keep returning it.
 */
export async function reconcileRun(row: SimulationRunRow): Promise<{ row: SimulationRunRow; events: SimulationEvent[] }> {
  const now = new Date().toISOString();
  if (row.status === "running") {
    const events = await loadEvents(row.id);
    const resultEvent = [...events].reverse().find((e) => e.t === "result");
    if (resultEvent) {
      secretValueCache.delete(row.id);
      const runnerStatus = typeof resultEvent.status === "string" ? resultEvent.status : "failed";
      // Keep auth_error/timeout as first-class row statuses: the rotation
      // alert keys off auth_error, and the UI explains each differently.
      const known = runnerStatus === "succeeded" || runnerStatus === "auth_error" || runnerStatus === "timeout";
      const durationMs = meteredDurationMs(row);
      const patch = {
        status: known ? runnerStatus : "failed",
        errorClass: runnerStatus === "succeeded" ? null : runnerStatus,
        exitCode: typeof resultEvent.exitCode === "number" ? resultEvent.exitCode : null,
        result: typeof resultEvent.result === "string" ? resultEvent.result : null,
        durationMs,
        costEstUsd: costEstimateFor(durationMs),
        updatedAt: now,
      };
      const [updated] = await db.update(schema.simulationRuns).set(patch).where(eq(schema.simulationRuns.id, row.id)).returning();
      void deleteRunSecrets(row.id);
      return { row: updated ?? { ...row, ...patch }, events };
    }
    if (Date.now() - new Date(row.updatedAt).getTime() > STALE_RUNNING_MS) {
      // Phase 4 Slice 4B: kill the Cloud Run execution too, not just the row.
      await cancelExecutionByName(row.executionName ?? "");
      secretValueCache.delete(row.id);
      const durationMs = meteredDurationMs(row);
      const patch = { status: "failed", errorClass: "stale", durationMs, costEstUsd: costEstimateFor(durationMs), updatedAt: now };
      const [updated] = await db.update(schema.simulationRuns).set(patch).where(eq(schema.simulationRuns.id, row.id)).returning();
      void deleteRunSecrets(row.id);
      return { row: updated ?? { ...row, ...patch }, events: [] };
    }
    return { row, events: [] };
  }
  if (TERMINAL_STATUSES.has(row.status)) {
    return { row, events: await loadEvents(row.id) };
  }
  return { row, events: [] };
}

// ── Phase 2: live event stream (ingest + fan-out) ────────────────────────────
//
// The runner POSTs NDJSON events to /sim-ingest while it executes; the SSE
// endpoint (/sim/stream) relays them to the builder. Events are buffered in
// the simulation_events table (not process memory) so streaming works when the
// API service scales past one instance; LISTEN/NOTIFY on 'sim_events' carries
// only the runId (never the payload - NOTIFY caps at 8000 bytes) and
// subscribers re-SELECT. The GCS result object stays the canonical completed
// log; this table feeds live views and fast reconnects.

/** Ingest auth: HMAC of the runId. Env secret when set (stable across
 *  restarts); otherwise a per-boot random one (in-flight ingest dies on
 *  restart, runs still finish via the GCS path). */
const ingestSecret = process.env.SIM_INGEST_SECRET ?? randomBytes(32).toString("hex");

export function ingestTokenFor(runId: string): string {
  return createHmac("sha256", ingestSecret).update(`sim-ingest:${runId}`).digest("hex");
}

export function verifyIngestToken(runId: string, token: string | undefined): boolean {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const want = Buffer.from(ingestTokenFor(runId), "hex");
  const got = Buffer.from(token, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

const MAX_INGEST_BATCH = 500;
const MAX_EVENT_BYTES = 16 * 1024;

const isEventLike = (e: unknown): e is SimulationEvent =>
  typeof e === "object" && e !== null && typeof (e as SimulationEvent).t === "string";

export type IngestOutcome = "ok" | "bad-token" | "not-found";

/** Append a runner event batch to the live buffer and wake subscribers. */
export async function ingestEvents(
  runId: string,
  token: string | undefined,
  events: unknown[],
): Promise<{ outcome: IngestOutcome; received?: number }> {
  // Only the bucket flag gates here - ingest touches Postgres, never GCS or
  // the GCP project id (unlike enqueue/dispatch).
  if (!cloudSimEnabled) throw new Error("Cloud simulation is not enabled on this instance");
  if (!verifyIngestToken(runId, token)) return { outcome: "bad-token" };
  const [row] = await db.select({ id: schema.simulationRuns.id }).from(schema.simulationRuns).where(eq(schema.simulationRuns.id, runId)).limit(1);
  if (!row) return { outcome: "not-found" };
  // Phase 4 Slice 4D: re-scrub against the run's secret values before the
  // events touch the stream table. No-op when the run carries no secrets.
  const values = await secretValuesForRun(runId);
  const clean = events
    .filter(isEventLike)
    .map((e) => JSON.stringify(e))
    .map((s) => (values.length ? scrubSecretValues(s, values) : s))
    .filter((s) => s.length <= MAX_EVENT_BYTES)
    .slice(0, MAX_INGEST_BATCH);
  if (!clean.length) return { outcome: "ok", received: 0 };
  const now = new Date().toISOString();
  await db.insert(schema.simulationEvents).values(clean.map((event) => ({ runId, event, createdAt: now })));
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_notify('sim_events', $1)", [runId]);
  } finally {
    client.release();
  }
  return { outcome: "ok", received: clean.length };
}

export interface StoredEvent {
  seq: bigint;
  event: SimulationEvent;
}

/** Events for a run after the given seq, in arrival order. */
export async function readEventsSince(runId: string, sinceSeq: bigint, limit = 1000): Promise<StoredEvent[]> {
  const rows = await db
    .select()
    .from(schema.simulationEvents)
    .where(and(eq(schema.simulationEvents.runId, runId), gt(schema.simulationEvents.seq, sinceSeq)))
    .orderBy(schema.simulationEvents.seq)
    .limit(limit);
  const out: StoredEvent[] = [];
  for (const row of rows) {
    try {
      out.push({ seq: row.seq, event: JSON.parse(row.event) as SimulationEvent });
    } catch {
      // tolerate a bad row, keep the stream moving
    }
  }
  return out;
}

export interface RunNotifier {
  close: () => void;
}

/**
 * Subscribe to run-event notifications. Fires with the runId; payloads travel
 * via the table, never through NOTIFY itself. One pooled connection per
 * subscriber - PoC concurrency is tiny.
 */
export async function acquireRunNotifier(onNotify: (runId: string) => void): Promise<RunNotifier> {
  const client = await pool.connect();
  client.on("notification", (n) => {
    if (n.channel === "sim_events" && n.payload) onNotify(n.payload);
  });
  await client.query("LISTEN sim_events");
  return {
    close: () => {
      client.removeAllListeners("notification");
      client.release();
    },
  };
}
