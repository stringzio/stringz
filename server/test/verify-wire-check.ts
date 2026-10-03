/** Wire check for billing.verify (stringz issue #58, acceptance criterion 4).
 *
 *  Pins the exact JSON shape the BROWSER receives from POST /trpc/billing.verify
 *  for every outcome class - credited, rejected (typed code), and exceptional
 *  (stringz-pay down). The #56 envelope bug shipped three times because nothing
 *  tested this seam; this check fails CI the moment the browser-visible shape
 *  drifts (tRPC envelope changes, unmapped throws, swallowed errors).
 *
 *  Runs the REAL api (subprocess, scratch DATABASE_URL) against a fixture
 *  stub that answers with stringz-pay's own pinned response shapes
 *  (see stringz-pay/test/api.test.ts - both sides of the seam are covered).
 *
 *  Usage:
 *    DATABASE_URL=postgres://user:pass@host:5432/scratch_db \
 *      VERIFY_RETRY_ATTEMPTS=2 VERIFY_RETRY_INTERVAL_MS=50 \
 *      bun server/test/verify-wire-check.ts
 */

const STUB_PORT = 8792;
const API_PORT = 8791;
const API_HEALTH = `http://127.0.0.1:${API_PORT}/health`;

let failures = 0;
const check = (name: string, cond: boolean, detail: unknown) => {
  console.log(`${cond ? "ok" : "FAIL"} - ${name}${cond ? "" : ` :: ${JSON.stringify(detail)}`}`);
  if (!cond) failures++;
};

/** The exact shapes stringz-pay's verifyHandler emits (pinned by its own
 *  api.test.ts). Selected deterministically by txHash so one boot covers all
 *  scenarios. 0xfa/0xfb count calls: transient for the request-path retry
 *  budget, decisive on the next call - the settle-later worker (stringz#62)
 *  must land the credit (0xfa) or dead-letter with the reason (0xfb) with no
 *  user retry in between. */
const stubCalls = new Map<string, number>();
const stub = Bun.serve({
  port: STUB_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/verify") return new Response("not found", { status: 404 });
    const body = (await req.json().catch(() => ({}))) as { txHash?: string; userId?: string };
    const h = body.txHash ?? "";
    const call = (stubCalls.get(h) ?? 0) + 1;
    stubCalls.set(h, call);
    if (h.startsWith("0xfa") && call <= 2) {
      return Response.json({ error: `no receipt for ${h} on avalanche`, code: "TX_NOT_FOUND" }, { status: 422 });
    }
    if (h.startsWith("0xfb") && call <= 2) {
      return Response.json({ error: `no receipt for ${h} on avalanche`, code: "TX_NOT_FOUND" }, { status: 422 });
    }
    if (h.startsWith("0xfa") || h.startsWith("0xcc")) {
      // 0xfa was credited by the worker on call 3; like the real rail, any
      // later verify reports alreadyCredited instead of double-crediting.
      const alreadyCredited = h.startsWith("0xfa") && call > 3;
      return Response.json({
        credited: true,
        alreadyCredited,
        plan: "pro_monthly",
        userId: body.userId,
        paidThrough: "2027-09-28T00:00:00.000Z",
        receipt: {
          chain: "avalanche",
          txHash: h,
          from: "0x7dAf10000000000000000000000000000000fEE5d",
          token: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
          amount: "0.1",
          confirmations: 5,
        },
      });
    }
    if (h.startsWith("0xdd")) {
      return Response.json(
        {
          error: "paid 100000 base units, plan requires 19000000",
          code: "UNDERPAID",
          detail: { paid: "100000", required: "19000000" },
        },
        { status: 422 },
      );
    }
    if (h.startsWith("0xee")) {
      return Response.json({ error: "simulated upstream failure" }, { status: 500 });
    }
    if (h.startsWith("0xfb")) {
      return Response.json(
        { error: "payment went to 0xdead…e5D2, not the treasury", code: "WRONG_RECIPIENT" },
        { status: 422 },
      );
    }
    return Response.json({ error: `no receipt for ${h} on avalanche`, code: "TX_NOT_FOUND" }, { status: 422 });
  },
});

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/wirecheck";
const serverDir = new URL("..", import.meta.url).pathname;

const api = Bun.spawn(["bun", "run", "src/index.ts"], {
  cwd: serverDir,
  stdout: "ignore",
  stderr: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    STRINGZ_PAY_URL: `http://127.0.0.1:${STUB_PORT}`,
    SERVER_PORT: String(API_PORT),
    // Worker cadence compressed for the check: a queued row lands within one
    // tick and backoff steps stay sub-second.
    SETTLE_TICK_MS: "200",
    SETTLE_BACKOFF_MS: "100",
    SETTLE_MAX_BACKOFF_MS: "200",
  },
});

const trpc = async (path: string, input?: unknown, cookie?: string) => {
  // Mirrors src/lib/api.ts: mutations POST, no-input queries GET (tRPC v11
  // rejects POST to query procedures with METHOD_NOT_SUPPORTED).
  const res = await fetch(`http://127.0.0.1:${API_PORT}/trpc/${path}`, {
    method: input !== undefined ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
  });
  const setCookie = res.headers.get("set-cookie");
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, cookie: setCookie ? setCookie.split(";")[0] : undefined };
};

try {
  let up = false;
  for (let i = 0; i < 60; i++) {
    if (await fetch(API_HEALTH).then((r) => r.ok).catch(() => false)) {
      up = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  check("api boots against scratch db + stub rail", up, { databaseUrl });
  if (!up) throw new Error("api did not become healthy");

  const signup = await trpc("auth.emailSignup", {
    email: `wire-${Date.now()}@example.com`,
    password: "wirecheck123",
    name: "wire",
  });
  check("signup through the real http envelope", signup.status === 200 && !!signup.cookie, signup);

  const verify = (txHash: string) =>
    trpc("billing.verify", { chain: "avalanche", txHash, plan: "pro_monthly" }, signup.cookie);

  const credited = await verify("0xcc" + "11".repeat(31));
  const cd = (credited.body as { result?: { data?: Record<string, unknown> } }).result?.data;
  check("credited reaches the browser as outcome=credited", credited.status === 200 && cd?.outcome === "credited", credited.body);
  check("credited carries paidThrough + passthrough userId", typeof cd?.paidThrough === "string" && typeof cd?.userId === "string", cd);

  const rejected = await verify("0xdd" + "22".repeat(31));
  const rd = (rejected.body as { result?: { data?: Record<string, unknown> } }).result?.data;
  check("underpaid reaches the browser as typed rejection", rejected.status === 200 && rd?.outcome === "rejected" && rd?.code === "UNDERPAID", rejected.body);
  check("rejection keeps a human-readable message", typeof rd?.message === "string" && /base units/.test(String(rd?.message)), rd);

  const outage = await verify("0xee" + "33".repeat(31));
  const ob = outage.body as { result?: unknown; error?: { message?: string } };
  check(
    "stringz-pay 500 surfaces as an error, never a fake credit",
    outage.status === 500 && !ob.result && typeof ob.error?.message === "string",
    outage.body,
  );

  const missing = await verify("0x99" + "44".repeat(31));
  const md = (missing.body as { result?: { data?: Record<string, unknown> } }).result?.data;
  const attempts = Number(process.env.VERIFY_RETRY_ATTEMPTS ?? 10);
  check(
    "transient TX_NOT_FOUND is absorbed server-side into pending",
    missing.status === 200 && md?.outcome === "pending",
    { missing: missing.body, attempts },
  );

  // ── S2b settle-later queue (stringz#62) ──────────────────────────────────
  // The stub's 0xfa/0xfb hashes stay transient through the request-path retry
  // budget (TX_NOT_FOUND for the first 2 calls), then turn decisive: 0xfa
  // confirms, 0xfb proves WRONG_RECIPIENT. The worker must land the credit /
  // dead-letter with no user retry in between.

  const pg = (await import("pg")).default;
  const pgClient = new pg.Client({ connectionString: databaseUrl });
  await pgClient.connect();
  const settlementRow = async (txHash: string) => {
    const { rows } = await pgClient.query(
      "select status, last_error, attempts from payment_settlements where tx_hash = $1",
      [txHash],
    );
    return rows[0] as { status: string; last_error: string | null; attempts: number } | undefined;
  };
  const waitForSettlement = async (txHash: string, want: "credited" | "dead", timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const row = await settlementRow(txHash);
      if (row?.status === want) return row;
      if (Date.now() > deadline) return row;
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const slowHash = "0xfa" + "55".repeat(31);
  const slow = await verify(slowHash);
  const sd = (slow.body as { result?: { data?: Record<string, unknown> } }).result?.data;
  check("slow payment answers pending, same as before S2b", slow.status === 200 && sd?.outcome === "pending", slow.body);
  const creditedRow = await waitForSettlement(slowHash, "credited");
  check(
    "worker settles the slow payment without a user retry",
    creditedRow?.status === "credited",
    creditedRow,
  );
  // The entitlements flip itself lives in stringz-pay (it writes
  // sp_entitlements on credit - pinned by stringz-pay's own api.test.ts), so
  // this stub harness observes settlement via the queue row, not the tier.

  const badHash = "0xfb" + "66".repeat(31);
  const bad = await verify(badHash);
  const bd = (bad.body as { result?: { data?: Record<string, unknown> } }).result?.data;
  check("late-proving payment also answers pending first", bad.status === 200 && bd?.outcome === "pending", bad.body);
  const deadRow = await waitForSettlement(badHash, "dead");
  check(
    "unpayable tx dead-letters with the coded reason",
    deadRow?.status === "dead" && deadRow?.last_error === "WRONG_RECIPIENT",
    deadRow,
  );

  const requeued = await verify(slowHash);
  const rq = (requeued.body as { result?: { data?: Record<string, unknown> } }).result?.data;
  check(
    "re-verifying an already-settled tx credits instantly, never double-enqueues",
    requeued.status === 200 && rq?.outcome === "credited" && rq?.alreadyCredited === true,
    requeued.body,
  );
  const duplicateRows = await pgClient.query("select count(*)::int as n from payment_settlements where tx_hash = $1", [slowHash]);
  check("settlement row stayed unique per (chain, txHash)", duplicateRows.rows[0]?.n === 1, duplicateRows.rows[0]);

  await pgClient.end();
} finally {
  api.kill();
  stub.stop();
}

console.log(failures === 0 ? "\nwire check: all checks passed" : `\nwire check: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
