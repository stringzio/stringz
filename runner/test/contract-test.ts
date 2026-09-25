// Contract tests for the simulation runner's parsing/classification layer.
// No network, no docker: exercises runner/lib/classify.sh directly (the same
// functions sim-entry sources) against captured-output fixtures.
//
// Run: bun runner/test/contract-test.ts
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(import.meta.dir, "..");
const classify = path.join(root, "lib", "classify.sh");
const fixtures = path.join(root, "test", "fixtures");

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  checks++;
  if (cond) {
    console.log(`ok - ${name}`);
  } else {
    failures++;
    console.error(`FAIL - ${name}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`);
  }
}

function runClassify(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("bash", [classify, ...args], { encoding: "utf8" });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

type NdjsonEvent = Record<string, unknown> & { t: string };

function parseNdjson(stdout: string): NdjsonEvent[] {
  const lines = stdout.split("\n").filter((l) => l.length > 0);
  return lines.map((l) => JSON.parse(l) as NdjsonEvent);
}

// --- status classification -------------------------------------------------

{
  const r = runClassify(["status", path.join(fixtures, "success.log"), "0"]);
  check("success.log -> succeeded", r.stdout.trim() === "succeeded" && r.code === 0, r);
}
{
  // Auth failure exits 0 from the real CLI; marker must still win.
  const r = runClassify(["status", path.join(fixtures, "auth-failure.log"), "0"]);
  check("auth-failure.log exit 0 -> auth_error", r.stdout.trim() === "auth_error" && r.code === 0, r);
}
{
  // Second real auth mode (mock/missing session) exits 1; still auth_error.
  const r = runClassify(["status", path.join(fixtures, "auth-no-credentials.log"), "1"]);
  check("auth-no-credentials.log exit 1 -> auth_error", r.stdout.trim() === "auth_error" && r.code === 0, r);
}
{
  const r = runClassify(["status", path.join(fixtures, "write-failure.log"), "1"]);
  check("write-failure.log -> failed", r.stdout.trim() === "failed" && r.code === 0, r);
}
{
  // timeout(1) exits 124; even a log that contains no failure marker is timeout.
  const r = runClassify(["status", path.join(fixtures, "success.log"), "124"]);
  check("exit code 124 -> timeout (marker ignored)", r.stdout.trim() === "timeout" && r.code === 0, r);
}
{
  // auth marker beats exit 124 (degenerate both-signals case, auth is terminal).
  const r = runClassify(["status", path.join(fixtures, "auth-failure.log"), "124"]);
  check("auth marker + exit 124 -> auth_error", r.stdout.trim() === "auth_error", r);
}
{
  const r = runClassify(["status", path.join(fixtures, "success.log"), "1"]);
  check("success marker but CLI exit 1 -> succeeded (marker wins over bad exit code)", r.stdout.trim() === "succeeded", r);
}

// --- NDJSON event stream ----------------------------------------------------

{
  const r = runClassify(["events", path.join(fixtures, "success.log")]);
  check("events: exit 0", r.code === 0);
  const events = parseNdjson(r.stdout);
  check(
    "events: every line is a valid NDJSON object with a t field",
    events.length > 0 && events.every((e) => typeof e.t === "string"),
  );
  const logs = events.filter((e) => e.t === "log");
  const rawLines = fs.readFileSync(path.join(fixtures, "success.log"), "utf8").split("\n");
  if (rawLines[rawLines.length - 1] === "") rawLines.pop();
  check("events: one log event per raw line (blank lines included)", logs.length === rawLines.length, { got: logs.length, want: rawLines.length });
  const nodes = events.filter((e) => e.t === "node");
  check("events: node events emitted for both USER LOG nodes", nodes.length === 2, nodes);
  check(
    "events: node id and line preserved for fmt",
    nodes.some((e) => e.id === "fmt" && e.line === "2026-09-25T14:42:34Z [USER LOG] fmt: replace -> ETH/USD = $2689.72"),
    nodes,
  );
  check("events: timestamp-prefixed USER LOG lines still capture the node id", nodes.some((e) => e.id === "pf"));
  check("events: node event follows its log event", (() => {
    const i = events.findIndex((e) => e.t === "node" && e.id === "fmt");
    return i > 0 && events[i - 1].t === "log" && events[i - 1].line === events[i].line;
  })());
  check(
    "events: quotes and backslashes survive JSON round-trip",
    logs.some((e) => e.line === '[SIMULATION] node "fmt" said: chain="ethereum" pair="ETH/USD" ok=true') &&
      logs.some((e) => (e.line as string).includes('captured \\"as-is\\" on 2026-09-25')),
  );
}

// --- result extraction + summary event --------------------------------------

{
  const r = runClassify(["result", path.join(fixtures, "success.log")]);
  const want = '"{\n  "pair": "ETH/USD",\n  "price": "2689.72",\n  "note": "captured \\"as-is\\" on 2026-09-25"\n}"';
  check("result: quoted block extracted verbatim", r.stdout === want, { got: r.stdout, want });
}
{
  const r = runClassify(["summary", path.join(fixtures, "success.log"), "0", "run-123"]);
  const events = parseNdjson(r.stdout);
  check("summary: single result event", events.length === 1 && events[0].t === "result", events);
  const e = events[0];
  check("summary: status succeeded, exitCode 0, runId echoed", e.status === "succeeded" && e.exitCode === 0 && e.runId === "run-123", e);
  check("summary: result field is the JSON-escaped block", (e.result as string).includes('"price": "2689.72"'), e.result);
}
{
  const r = runClassify(["summary", path.join(fixtures, "auth-failure.log"), "0"]);
  const e = parseNdjson(r.stdout)[0];
  check("summary: auth_error carries no result payload", e.t === "result" && e.status === "auth_error" && e.result === undefined, e);
}
{
  const r = runClassify(["summary", path.join(fixtures, "auth-no-credentials.log"), "1"]);
  const e = parseNdjson(r.stdout)[0];
  check("summary: no-credentials auth mode -> auth_error, CLI exitCode preserved", e.t === "result" && e.status === "auth_error" && e.exitCode === 1, e);
}
{
  const r = runClassify(["summary", path.join(fixtures, "write-failure.log"), "1"]);
  const e = parseNdjson(r.stdout)[0];
  check("summary: write failure -> failed with CLI exitCode preserved", e.status === "failed" && e.exitCode === 1, e);
}
{
  const r = runClassify(["summary", path.join(fixtures, "write-failure.log"), "124"]);
  const e = parseNdjson(r.stdout)[0];
  check("summary: exit 124 -> timeout", e.status === "timeout" && e.exitCode === 124, e);
}
{
  const r = runClassify(["summary", path.join(fixtures, "success.log"), "abc"]);
  const e = parseNdjson(r.stdout)[0];
  check("summary: non-numeric exit code coerced to 1", e.status === "succeeded" && e.exitCode === 1, e);
}

// --- sim-entry's exit-code contract (0 only on succeeded) --------------------
// Runs the real entry.sh end to end in FILE mode with a stubbed cre binary on
// PATH (plus a GNU-timeout stand-in for hosts without coreutils, e.g. macOS).

function runEntryStubTests() {
  const cases: Array<[string, string, number, string]> = [
    ["success.log", "0", 0, "succeeded"],
    ["auth-failure.log", "0", 1, "auth_error"],
    ["write-failure.log", "1", 1, "failed"],
    ["success.log", "124", 1, "timeout"],
  ];
  for (const [fixture, stubExit, wantEntryExit, wantStatus] of cases) {
    const tmp = fs.mkdtempSync(path.join("/tmp", "sim-contract-"));
    const stubDir = path.join(tmp, "bin");
    fs.mkdirSync(stubDir);
    const fixtureAbs = path.join(fixtures, fixture);
    fs.writeFileSync(
      path.join(stubDir, "cre"),
      `#!/usr/bin/env bash\ncat "${fixtureAbs}"\nexit ${stubExit}\n`,
      { mode: 0o755 },
    );
    // GNU timeout stand-in (macOS has none): timeout [-k K] DURATION CMD...
    fs.writeFileSync(
      path.join(stubDir, "timeout"),
      '#!/usr/bin/env bash\nwhile [ "$#" -gt 0 ]; do\n  case "$1" in\n    -k) shift 2 ;;\n    -*|[0-9]*) shift ;;\n    *) break ;;\n  esac\ndone\nexec "$@"\n',
      { mode: 0o755 },
    );
    const projDir = path.join(tmp, "proj");
    fs.mkdirSync(path.join(projDir, "demo-workflow"), { recursive: true });
    fs.writeFileSync(path.join(projDir, "project.yaml"), 'name: "demo"\n');
    fs.writeFileSync(path.join(projDir, ".env.example"), "CRE_ETH_PRIVATE_KEY=\n");
    fs.writeFileSync(path.join(projDir, "demo-workflow", "package.json"), '{"name":"demo-workflow","private":true}\n');
    const tgz = path.join(tmp, "project.tgz");
    spawnSync("tar", ["-czf", tgz, "-C", projDir, "."], { stdio: "inherit" });
    const entry = path.join(root, "entry.sh");
    const env = {
      ...process.env,
      PATH: `${stubDir}:${process.env.PATH}`,
      SRC_URL: `file://${tgz}`,
      SIM_TIMEOUT: "30",
      HOME: tmp,
    } as NodeJS.ProcessEnv;
    const r = spawnSync("bash", [entry], { encoding: "utf8", env });
    const stdoutEvents = r.stdout.split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l) as NdjsonEvent);
    const resultEvent = stdoutEvents[stdoutEvents.length - 1];
    check(`entry.sh stub ${fixture} exit ${stubExit}: exit ${wantEntryExit} + status ${wantStatus}`,
      r.status === wantEntryExit && resultEvent?.t === "result" && resultEvent.status === wantStatus,
      { entryExit: r.status, resultEvent, stderrTail: r.stderr.split("\n").slice(-3) });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
runEntryStubTests();

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
