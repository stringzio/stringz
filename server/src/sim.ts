import { Storage } from "@google-cloud/storage";
import { CloudTasksClient } from "@google-cloud/tasks";
import { JobsClient } from "@google-cloud/run";
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { db, schema } from "./db/client";

/**
 * Cloud simulation orchestration. A run's life:
 *   enqueue -> user PUTs the project tarball to a signed URL -> Cloud Tasks
 *   POSTs /sim-dispatch -> the API starts the Cloud Run Job -> the runner
 *   uploads its NDJSON event stream to a signed URL -> polling reconciles the
 *   row from the uploaded result object.
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
  const [srcUrl, resultUrl] = await Promise.all([signProjectDownloadUrl(runId), signResultUploadUrl(runId)]);
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
      return { row: updated ?? { ...row, ...patch }, events };
    }
    if (Date.now() - new Date(row.updatedAt).getTime() > STALE_RUNNING_MS) {
      const patch = { status: "failed", errorClass: "stale", updatedAt: now };
      const [updated] = await db.update(schema.simulationRuns).set(patch).where(eq(schema.simulationRuns.id, row.id)).returning();
      return { row: updated ?? { ...row, ...patch }, events: [] };
    }
    return { row, events: [] };
  }
  if (TERMINAL_STATUSES.has(row.status)) {
    return { row, events: await loadEvents(row.id) };
  }
  return { row, events: [] };
}
