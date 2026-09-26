/**
 * Live event tailer for the sim runner (Phase 2, issue #11).
 *
 * Tails the raw `cre workflow simulate` log while the CLI runs, classifies
 * new lines with stream-classify.ts (parity with classify.sh is pinned by
 * the contract tests), and POSTs event batches to the Stringz ingest
 * endpoint so the builder sees logs stream in real time.
 *
 * Started by entry.sh only when INGEST_URL + INGEST_TOKEN are set (job env
 * overrides from the dispatch endpoint). Best effort by contract: ingest
 * failures never change the run status or exit code - the GCS result upload
 * stays the canonical completed log.
 *
 * Env:   INGEST_URL, INGEST_TOKEN (secrets via env, never argv)
 * Args:  <rawlog> <workdir>
 * Protocol: entry.sh writes <workdir>/result-event.json (one NDJSON line)
 * and then touches <workdir>/cli-done once the CLI has exited; the tailer
 * drains the log, flushes, posts the result event last, and exits.
 *
 * Exit code is always 0 - this process is advisory.
 */

import fs from "node:fs";
import { classifyLine } from "./stream-classify";

const [rawlog, workdir] = process.argv.slice(2);
const url = process.env.INGEST_URL ?? "";
const token = process.env.INGEST_TOKEN ?? "";

const FLUSH_MS = 1000;
const MAX_BATCH = 200;
const MAX_FAILURES = 3;
const TICK_MS = 250;
const MAX_TICKS = 3600; // 15 min hard stop - the job timeout is the backstop

const log = (m: string) => console.error(`[stream] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let offset = 0;
let carry = "";
let queue: string[] = [];
let lastFlush = 0;
let failures = 0;
let givenUp = false;

async function postBatch(events: string[]): Promise<boolean> {
  if (givenUp) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-run-token": token },
      body: `[${events.join(",")}]`,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) log(`WARN ingest HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    log(`WARN ingest POST failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function flushAll(): Promise<void> {
  while (queue.length > 0 && !givenUp) {
    const batch = queue.splice(0, MAX_BATCH);
    if (await postBatch(batch)) {
      failures = 0;
    } else {
      failures++;
      if (failures >= MAX_FAILURES) {
        givenUp = true;
        queue = [];
        log("WARN giving up on ingest after repeated failures (run unaffected)");
      }
    }
  }
  lastFlush = Date.now();
}

async function readNewLines(): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(rawlog);
  } catch {
    return;
  }
  if (stat.size <= offset) return;
  const fh = await fs.promises.open(rawlog, "r");
  try {
    const buf = Buffer.alloc(stat.size - offset);
    await fh.read(buf, 0, buf.length, offset);
    offset = stat.size;
    carry += buf.toString("utf8");
    const parts = carry.split("\n");
    carry = parts.pop() ?? "";
    for (const line of parts) queue.push(...classifyLine(line));
  } finally {
    await fh.close();
  }
}

async function main(): Promise<void> {
  const redacted = url.replace(/\/\/([^@/]+)@/, "//***@");
  log(`tailing ${rawlog} -> ${redacted}`);
  const donePath = `${workdir}/cli-done`;
  const resultPath = `${workdir}/result-event.json`;

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    await readNewLines();
    const done = fs.existsSync(donePath);
    if (queue.length > 0 && (done || queue.length >= MAX_BATCH || Date.now() - lastFlush >= FLUSH_MS)) {
      await flushAll();
    }
    if (done) break;
    await sleep(TICK_MS);
  }

  // Final drain: entry.sh only writes the marker after the CLI process has
  // exited, so the log is stable here; one last pass catches anything the
  // tail loop missed, then the result event goes out last.
  await readNewLines();
  await flushAll();
  try {
    const resultLine = (await fs.promises.readFile(resultPath, "utf8"))
      .split("\n")
      .find((l) => l.trim().length > 0);
    if (resultLine) {
      queue.push(resultLine.trim());
      await flushAll();
    } else {
      log("WARN no result-event.json; result event will not be streamed");
    }
  } catch {
    log("WARN result-event.json unreadable; result event will not be streamed");
  }
  log("done");
}

main().catch((err) => {
  log(`WARN tailer error: ${err instanceof Error ? err.message : String(err)}`);
});
