/**
 * Local run log: a localStorage mirror of flow runs so Statistics works for
 * signed-out users and offline. Server-side flow_runs stays the source of
 * truth when logged in; this log fills the gap and never blocks a run.
 */
import type { RunRecord } from "./contract";

const KEY = "stringz:runs";
const CAP = 300;
/** Local ids are prefixed so they never collide with server UUIDs. */
let seq = 0;

function read(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RunRecord[]) : [];
  } catch {
    return [];
  }
}

export function logRunLocal(run: Omit<RunRecord, "id">): RunRecord {
  const record: RunRecord = { ...run, id: `local-${Date.now()}-${++seq}` };
  try {
    const runs = [record, ...read()].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(runs));
  } catch {
    // storage full or unavailable - stats are best-effort
  }
  return record;
}

export function recentRunsLocal(): RunRecord[] {
  return read();
}

/** Drop local copies once the server has them (called after a sync). */
export function clearLocalRuns(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
