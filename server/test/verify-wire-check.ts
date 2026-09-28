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
 *  scenarios. */
const stub = Bun.serve({
  port: STUB_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/verify") return new Response("not found", { status: 404 });
    const body = (await req.json().catch(() => ({}))) as { txHash?: string; userId?: string };
    const h = body.txHash ?? "";
    if (h.startsWith("0xcc")) {
      return Response.json({
        credited: true,
        alreadyCredited: false,
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
  },
});

const trpc = async (path: string, input: unknown, cookie?: string) => {
  const res = await fetch(`http://127.0.0.1:${API_PORT}/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(input),
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
} finally {
  api.kill();
  stub.stop();
}

console.log(failures === 0 ? "\nwire check: all checks passed" : `\nwire check: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
