import { Storage } from "@google-cloud/storage";
import { CloudTasksClient } from "@google-cloud/tasks";
import { JobsClient } from "@google-cloud/run";
import { OAuth2Client } from "google-auth-library";
import { and, eq, gt } from "drizzle-orm";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db, pool, schema } from "./db/client";

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
let oauth2: OAuth2Client | null = null;
const getStorage = () => (storage ??= new Storage());
const getTasks = () => (tasks ??= new CloudTasksClient());
const getJobs = () => (jobs ??= new JobsClient());
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

/** Push a dispatch task onto the queue. Returns the created task name. */
export async function enqueueTask(runId: string): Promise<string> {
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
        body: Buffer.from(JSON.stringify({ runId })).toString("base64"),
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

/** Transition a queued run to running and kick the Cloud Run Job. */
export async function dispatchRun(runId: string): Promise<DispatchOutcome> {
  assertCloudSimEnabled();
  const [row] = await db.select().from(schema.simulationRuns).where(eq(schema.simulationRuns.id, runId)).limit(1);
  if (!row) return "not-found";
  if (row.status !== "queued") return "not-queued";
  const now = new Date().toISOString();
  await db.update(schema.simulationRuns).set({ status: "running", updatedAt: now }).where(eq(schema.simulationRuns.id, runId));
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

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "auth_error", "timeout"]);

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
      const runnerStatus = typeof resultEvent.status === "string" ? resultEvent.status : "failed";
      // Keep auth_error/timeout as first-class row statuses: the rotation
      // alert keys off auth_error, and the UI explains each differently.
      const known = runnerStatus === "succeeded" || runnerStatus === "auth_error" || runnerStatus === "timeout";
      const patch = {
        status: known ? runnerStatus : "failed",
        errorClass: runnerStatus === "succeeded" ? null : runnerStatus,
        exitCode: typeof resultEvent.exitCode === "number" ? resultEvent.exitCode : null,
        result: typeof resultEvent.result === "string" ? resultEvent.result : null,
        updatedAt: now,
      };
      const [updated] = await db.update(schema.simulationRuns).set(patch).where(eq(schema.simulationRuns.id, row.id)).returning();
      void deleteRunSecrets(row.id);
      return { row: updated ?? { ...row, ...patch }, events };
    }
    if (Date.now() - new Date(row.updatedAt).getTime() > STALE_RUNNING_MS) {
      const patch = { status: "failed", errorClass: "stale", updatedAt: now };
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
  const clean = events
    .filter(isEventLike)
    .map((e) => JSON.stringify(e))
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
