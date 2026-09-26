import { api } from "./api";

/**
 * Controller for a "Test in cloud" run (issue #11 Phase 2). Owns the whole
 * client-side lifecycle: enqueue -> tarball upload -> live event stream ->
 * terminal status. State is pushed through onState so the UI can render
 * queued/running/terminal without knowing transport details.
 *
 * Transport: events arrive over SSE (`GET /sim/stream`, same-origin, session
 * cookie). If the stream drops (deploy mid-run, flaky network), we fall back
 * to polling `simulate.status`, which reconciles the run from the uploaded
 * GCS result object and returns the same event list - the run is never lost.
 */

export type CloudPhase =
  | "preparing"
  | "uploading"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "auth_error"
  | "timeout";

export interface CloudRunEvent {
  t: string;
  [key: string]: unknown;
}

export interface CloudRunState {
  phase: CloudPhase;
  runId: string | null;
  events: CloudRunEvent[];
  /** Human-readable note for non-success terminals (and the "timeout" guard). */
  note?: string;
  startedAt: number;
}

const TERMINAL: CloudPhase[] = ["succeeded", "failed", "auth_error", "timeout"];
const OVERALL_TIMEOUT_MS = 10 * 60 * 1000;
const STATUS_POLL_MS = 8000;

const terminalFrom = (status: string): CloudPhase =>
  (TERMINAL as string[]).includes(status) ? (status as CloudPhase) : "failed";

export function isTerminal(phase: CloudPhase): boolean {
  return TERMINAL.includes(phase);
}

/** Strip the "ts [USER LOG] id: " prefix from a runner node-event line. */
export function cloudNodeLine(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const m = /^\S+ \[USER LOG\] [^:]+:([\s\S]*)$/.exec(s);
  return (m ? m[1] : s).trim();
}

/** Minimal SSE frame reader over fetch (EventSource cannot set headers and
 *  adds no value here - the stream is same-origin with cookie auth). */
async function readSse(
  url: string,
  onEvent: (event: string, data: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`stream open failed (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) onEvent(event, data);
    }
  }
}

export async function runCloudSimulation(opts: {
  tarball: Uint8Array;
  flowId?: string | null;
  /** Phase 3: run-scoped ephemeral secrets (env var name -> value). */
  secrets?: Record<string, string>;
  onState: (state: CloudRunState) => void;
  signal?: AbortSignal;
}): Promise<CloudRunState> {
  const startedAt = Date.now();
  let state: CloudRunState = { phase: "preparing", runId: null, events: [], startedAt };
  const push = (patch: Partial<CloudRunState>) => {
    state = { ...state, ...patch };
    opts.onState(state);
  };

  // 1. Reserve the run + signed upload URL (secrets ride the enqueue body;
  // the server persists them to a run-scoped GCS object, never the DB).
  const enq = await api.simulate.enqueue({ triggerIdx: 0, flowId: opts.flowId ?? null, secrets: opts.secrets });
  push({ phase: "uploading", runId: enq.runId });

  // 2. Upload the packed CRE project.
  const up = await fetch(enq.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "application/gzip" },
    // TS 5.9's typed-array generics reject Uint8Array as BodyInit; it is a
    // valid body at runtime (and in every fetch implementation we run on).
    body: opts.tarball as unknown as BodyInit,
    signal: opts.signal,
  });
  if (!up.ok) throw new Error(`Project upload failed (${up.status})`);
  push({ phase: "queued" });

  // 3. Stream events until the runner's result event (or fall back to polls).
  let sawResult = false;
  const ingestEvent = (raw: string) => {
    let parsed: CloudRunEvent;
    try {
      parsed = JSON.parse(raw) as CloudRunEvent;
    } catch {
      return;
    }
    if (typeof parsed.t !== "string") return;
    const events = [...state.events, parsed];
    if (parsed.t === "result") {
      sawResult = true;
      const status = typeof parsed.status === "string" ? terminalFrom(parsed.status) : "failed";
      push({ phase: status, events });
    } else {
      push({ phase: state.phase === "queued" ? "running" : state.phase, events });
    }
  };

  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  const pollUntilTerminal = async (): Promise<CloudRunState> => {
    while (Date.now() < deadline) {
      if (opts.signal?.aborted) return { ...state, note: "Cancelled" };
      const st = await api.simulate.status({ runId: enq.runId });
      const phase = terminalFrom(st.status);
      push({
        phase,
        events: st.events as CloudRunEvent[],
        ...(st.errorClass && phase !== "succeeded" ? { note: `Runner reported: ${st.errorClass}` } : {}),
      });
      if (isTerminal(phase)) return state;
      await new Promise((r) => setTimeout(r, STATUS_POLL_MS));
    }
    return { ...state, phase: "timeout", note: "The run did not finish in time - try again." };
  };

  try {
    await Promise.race([
      readSse(`/sim/stream?runId=${enq.runId}`, (event, data) => {
        if (event === "ping" || event === "ready") return;
        if (event === "done") return;
        ingestEvent(data);
      }, opts.signal ?? new AbortController().signal),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("stream idle deadline")), OVERALL_TIMEOUT_MS),
      ),
    ]);
  } catch {
    // Stream dropped or never opened: the run itself is unaffected - the
    // runner uploads its full event log to GCS. Poll for the final state.
  }
  if (!sawResult || !isTerminal(state.phase)) return pollUntilTerminal();
  return state;
}
