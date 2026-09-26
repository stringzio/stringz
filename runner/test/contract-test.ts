// Contract tests for the simulation runner's parsing/classification layer.
// No network, no docker: exercises runner/lib/classify.sh directly (the same
// functions sim-entry sources) against captured-output fixtures.
//
// Run: bun runner/test/contract-test.ts
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { classifyLine, scrubSecrets, loadSecretValues } from "../lib/stream-classify";

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

// GNU timeout stand-in (macOS has none): timeout [-k K] DURATION CMD...
const TIMEOUT_STUB =
  '#!/usr/bin/env bash\nwhile [ "$#" -gt 0 ]; do\n  case "$1" in\n    -k) shift 2 ;;\n    -*|[0-9]*) shift ;;\n    *) break ;;\n  esac\ndone\nexec "$@"\n';

function writeStubBin(stubDir: string, fixtureAbs: string, stubExit: string) {
  fs.writeFileSync(
    path.join(stubDir, "cre"),
    `#!/usr/bin/env bash\ncat "${fixtureAbs}"\nexit ${stubExit}\n`,
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(stubDir, "timeout"), TIMEOUT_STUB, { mode: 0o755 });
}

function makeProjectTgz(tmp: string): string {
  const projDir = path.join(tmp, "proj");
  fs.mkdirSync(path.join(projDir, "demo-workflow"), { recursive: true });
  fs.writeFileSync(path.join(projDir, "project.yaml"), 'name: "demo"\n');
  fs.writeFileSync(path.join(projDir, ".env.example"), "CRE_ETH_PRIVATE_KEY=\n");
  fs.writeFileSync(path.join(projDir, "demo-workflow", "package.json"), '{"name":"demo-workflow","private":true}\n');
  const tgz = path.join(tmp, "project.tgz");
  spawnSync("tar", ["-czf", tgz, "-C", projDir, "."], { stdio: "inherit" });
  return tgz;
}

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
    writeStubBin(stubDir, path.join(fixtures, fixture), stubExit);
    const tgz = makeProjectTgz(tmp);
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

// --- RESULT_URL mirror: entry.sh uploads the event stream --------------------

function runEntryResultUrlTest() {
  const tmp = fs.mkdtempSync(path.join("/tmp", "sim-contract-"));
  const stubDir = path.join(tmp, "bin");
  fs.mkdirSync(stubDir);
  writeStubBin(stubDir, path.join(fixtures, "success.log"), "0");
  const tgz = makeProjectTgz(tmp);
  const eventsPath = path.join(tmp, "events.ndjson");
  const entry = path.join(root, "entry.sh");
  const env = {
    ...process.env,
    PATH: `${stubDir}:${process.env.PATH}`,
    SRC_URL: `file://${tgz}`,
    RESULT_URL: `file://${eventsPath}`,
    RUN_ID: "run-result-url",
    SIM_TIMEOUT: "30",
    HOME: tmp,
  } as NodeJS.ProcessEnv;
  const r = spawnSync("bash", [entry], { encoding: "utf8", env });
  const written = fs.existsSync(eventsPath);
  check("entry.sh RESULT_URL=file://: exit 0 and events file written",
    r.status === 0 && written,
    { entryExit: r.status, stderrTail: r.stderr.split("\n").slice(-3) });
  if (written) {
    const lines = fs.readFileSync(eventsPath, "utf8").split("\n").filter((l) => l.length > 0);
    const last = lines.length > 0 ? (JSON.parse(lines[lines.length - 1]) as NdjsonEvent) : null;
    check("entry.sh RESULT_URL=file://: last line is the result event",
      last?.t === "result" && last.status === "succeeded" && last.runId === "run-result-url", last);
    const stdoutLines = (r.stdout ?? "").split("\n").filter((l) => l.length > 0);
    check("entry.sh RESULT_URL=file://: uploaded stream matches stdout",
      lines.length === stdoutLines.length && lines.every((l, i) => l === stdoutLines[i]),
      { uploaded: lines.length, stdout: stdoutLines.length });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
runEntryResultUrlTest();

// --- Phase 3: entry.sh merges SECRETS_JSON and redacts values everywhere ----
// The stub CLI "logs" a line containing the planted secret value; every
// emitted event (stdout batch, RESULT_URL mirror) must carry *** instead.

function runEntryRedactionTest() {
  const tmp = fs.mkdtempSync(path.join("/tmp", "sim-contract-"));
  const stubDir = path.join(tmp, "bin");
  fs.mkdirSync(stubDir);
  const leakyFixture = path.join(tmp, "leaky.log");
  fs.writeFileSync(
    leakyFixture,
    `2026-09-26T00:00:00Z [USER LOG] fmt: posting to https://hooks.example.com/sk-test-PLANTED-12345\n✓ Workflow Simulation Result:\n"ok"\n`,
  );
  writeStubBin(stubDir, leakyFixture, "0");
  const tgz = makeProjectTgz(tmp);
  const eventsPath = path.join(tmp, "events.ndjson");
  const entry = path.join(root, "entry.sh");
  const env = {
    ...process.env,
    PATH: `${stubDir}:${process.env.PATH}`,
    SRC_URL: `file://${tgz}`,
    RESULT_URL: `file://${eventsPath}`,
    SECRETS_JSON: JSON.stringify({ WEBHOOK_URL: "https://hooks.example.com/sk-test-PLANTED-12345" }),
    RUN_ID: "run-redaction",
    SIM_TIMEOUT: "30",
    HOME: tmp,
  } as NodeJS.ProcessEnv;
  const r = spawnSync("bash", [entry], { encoding: "utf8", env });
  const stdoutClean = !(r.stdout ?? "").includes("sk-test-PLANTED-12345");
  const uploaded = fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, "utf8") : "";
  check("entry.sh SECRETS_JSON: exit 0, planted value scrubbed from stdout + upload",
    r.status === 0 && stdoutClean && uploaded.length > 0 && !uploaded.includes("sk-test-PLANTED-12345"),
    { entryExit: r.status, stdoutLeak: !stdoutClean, uploadLeak: uploaded.includes("sk-test-PLANTED-12345"), stderrTail: r.stderr.split("\n").slice(-4) });
  check("entry.sh SECRETS_JSON: marker replaced with ***", (r.stdout ?? "").includes("***"), {});
  // Documented semantic: PARTIAL echoes (a substring of a secret, e.g. a key
  // without its URL prefix) are not scrubbed - full-value masking is the
  // contract (same as GitHub Actions masking); partials are Phase 4+ hardening.
  fs.writeFileSync(
    leakyFixture,
    '2026-09-26T00:00:00Z [USER LOG] fmt: leaked fragment sk-test-PLANTED-12345\n✓ Workflow Simulation Result:\n"ok"\n',
  );
  const r2 = spawnSync("bash", [entry], { encoding: "utf8", env });
  check("entry.sh redaction: partial-value echo is NOT scrubbed (documented semantic)",
    (r2.stdout ?? "").includes("sk-test-PLANTED-12345"), {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
runEntryRedactionTest();

// --- Secret Manager archive mode: CRE_SECRETS points at a session tgz file --

function runEntrySecretsArchiveTest() {
  // Build the artifact the rotation runbook uploads: the session tar.gz,
  // BASE64-ENCODED (binary payloads do not survive every transport layer;
  // base64 is pure ASCII). Secret Manager volumes mount the payload as one
  // file, not a directory.
  const src = fs.mkdtempSync(path.join("/tmp", "sim-crets-src-"));
  fs.mkdirSync(path.join(src, ".cre"));
  fs.writeFileSync(path.join(src, ".cre", "cre.yaml"), "tokens: mock\n");
  fs.writeFileSync(path.join(src, ".cre", "context.yaml"), "tenant: mock\n");
  const tgzTmp = path.join(src, "session.tgz");
  spawnSync("tar", ["-czf", tgzTmp, "-C", src, ".cre"], { stdio: "inherit" });
  const sessionB64 = path.join(src, "session.b64");
  spawnSync("sh", ["-c", `base64 < "${tgzTmp}" > "${sessionB64}"`], { stdio: "inherit" });

  const tmp = fs.mkdtempSync(path.join("/tmp", "sim-contract-"));
  const stubDir = path.join(tmp, "bin");
  fs.mkdirSync(stubDir);
  writeStubBin(stubDir, path.join(fixtures, "success.log"), "0");
  const tgz = makeProjectTgz(tmp);
  const eventsPath = path.join(tmp, "events.ndjson");
  const entry = path.join(root, "entry.sh");
  const env = {
    ...process.env,
    PATH: `${stubDir}:${process.env.PATH}`,
    SRC_URL: `file://${tgz}`,
    RESULT_URL: `file://${eventsPath}`,
    CRE_SECRETS: sessionB64,
    SIM_TIMEOUT: "30",
    HOME: tmp,
  } as NodeJS.ProcessEnv;
  const r = spawnSync("bash", [entry], { encoding: "utf8", env });
  const extracted = fs.existsSync(path.join(tmp, ".cre", "cre.yaml"));
  check("entry.sh CRE_SECRETS archive: exit 0, session extracted to $HOME/.cre",
    r.status === 0 && extracted,
    { entryExit: r.status, extracted, stderrTail: r.stderr.split("\n").slice(-3) });
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(src, { recursive: true, force: true });
}
runEntrySecretsArchiveTest();

// --- live-stream classifier parity (stream-classify.ts vs classify.sh) ------
// entry.sh emits the completed stream from classify.sh; the Phase 2 tailer
// emits the live stream from stream-classify.ts. Both streams reach the same
// consumer, so per-line output must be byte-identical on the fixtures.

function runStreamParityTest() {
  for (const name of ["success.log", "auth-failure.log", "write-failure.log", "auth-no-credentials.log"]) {
    const file = path.join(fixtures, name);
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    const tsStream = lines.flatMap((l) => classifyLine(l)).join("\n") + "\n";
    const bash = runClassify(["events", file]);
    check(`stream parity: ${name} matches classify.sh events`, tsStream === bash.stdout, {
      fixture: name,
      tsLines: tsStream.split("\n").length,
      bashLines: bash.stdout.split("\n").length,
      firstDiff: tsStream.split("\n").findIndex((l, i) => l !== bash.stdout.split("\n")[i]),
    });
  }
  // Edge cases: quoting, backslashes, tabs, unicode, node-id trailing spaces.
  const edge = [
    'plain line',
    'quote " and backslash \\ and tab\tend',
    '2026-09-26T00:00:00Z [USER LOG] fmt: replace -> ETH/USD = $2689.62',
    '2026-09-26T00:00:00Z [USER LOG] spaced-id   : trailing spaces in id',
    'unicode box-drawing ✓ and emoji 🚀',
  ];
  const tmpEdge = path.join("/tmp", "sim-parity-edge.log");
  fs.writeFileSync(tmpEdge, edge.join("\n") + "\n");
  const tsEdge = edge.flatMap((l) => classifyLine(l)).join("\n") + "\n";
  const bashEdge = runClassify(["events", tmpEdge]);
  check("stream parity: edge cases match classify.sh events", tsEdge === bashEdge.stdout, {
    tsEdge: tsEdge.split("\n").slice(0, 3),
    bashEdge: bashEdge.stdout.split("\n").slice(0, 3),
  });
  fs.rmSync(tmpEdge, { force: true });
}
runStreamParityTest();

// --- Phase 3 redaction (classify.sh classify_redact vs scrubSecrets) ---------
// Every emitted line - batch stdout, live ingest, and the GCS upload - must
// have run-secret values scrubbed before it leaves the runner. Both emitters
// implement the same fixed-string replacement; these checks pin parity and
// the edge cases (values <4 chars skipped, multiple hits, hit at edges).

function runRedactionTest() {
  const valuesFile = path.join("/tmp", "sim-redact-values.txt");
  fs.writeFileSync(valuesFile, "sk-test-PLANTED-12345\nhttps://hooks.example.com/TOKEN/abc\nabc\n");

  const cases: [string, string][] = [
    ["token is sk-test-PLANTED-12345, end", "token is ***, end"],
    ["https://hooks.example.com/TOKEN/abc posted", "*** posted"],
    ["twice sk-test-PLANTED-12345 and sk-test-PLANTED-12345 done", "twice *** and *** done"],
    ["abc stays (3 chars, under the 4-char minimum)", "abc stays (3 chars, under the 4-char minimum)"],
    ["sk-test-PLANTED-12345 at the very start", "*** at the very start"],
    ["ends with sk-test-PLANTED-12345", "ends with ***"],
    ["no secrets here", "no secrets here"],
  ];
  for (const [raw, expected] of cases) {
    const bash = spawnSync("bash", ["-c", `printf '%s' "$0" | bash "$1" redact "$2"`, raw, classify, valuesFile], { encoding: "utf8" });
    check(`redact bash: ${raw.slice(0, 40)}`, bash.stdout === expected, { got: bash.stdout, want: expected });
    const ts = scrubSecrets(raw, loadSecretValues(valuesFile));
    check(`redact TS parity: ${raw.slice(0, 40)}`, ts === expected && ts === bash.stdout, { ts, bash: bash.stdout, want: expected });
  }

  // Full-stream parity WITH redaction active: batch (classify.sh) and live
  // (classifyLine+scrub) must agree byte-for-byte on a fixture whose USER LOG
  // line carries a planted value.
  const plantedLog = path.join("/tmp", "sim-redact-fixture.log");
  fs.writeFileSync(
    plantedLog,
    '2026-09-26T00:00:00Z [USER LOG] fmt: replace -> key=sk-test-PLANTED-12345\n✓ Workflow Simulation Result:\n"ok"\n',
  );
  const values = loadSecretValues(valuesFile);
  const lines = fs.readFileSync(plantedLog, "utf8").split("\n").filter((l) => l.length > 0);
  const tsStream = lines.map((l) => scrubSecrets(l, values)).flatMap((l) => classifyLine(l)).join("\n") + "\n";
  const bashInit = runClassify(["redacted-events", valuesFile, plantedLog]);
  check("redact stream parity: batch == TS", bashInit.stdout === tsStream && bashInit.code === 0, {
    bashInit: bashInit.stdout.slice(0, 160),
    ts: tsStream.slice(0, 160),
    code: bashInit.code,
    stderr: bashInit.stderr.slice(0, 120),
  });
  check("redact: planted value absent from both streams",
    !bashInit.stdout.includes("sk-test-PLANTED-12345") && !tsStream.includes("sk-test-PLANTED-12345"),
    {});
  check("redact: summary result block scrubbed", (() => {
    const summary = runClassify(["redacted-summary", valuesFile, plantedLog, "0"]);
    return !summary.stdout.includes("sk-test-PLANTED-12345");
  })());

  fs.rmSync(valuesFile, { force: true });
  fs.rmSync(plantedLog, { force: true });
}
runRedactionTest();

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
