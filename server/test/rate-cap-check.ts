// Phase 4 Slice 4A local verification: per-user rate caps in assertRateLimits.
// Runs migrations on a scratch DB, seeds users + runs, and proves:
//   1. under-limit user passes
//   2. user at the 24h cap throws with the daily-limit message
//   3. user at the concurrent cap throws with the inflight message
//   4. rows aged out of the 24h window stop counting
// Usage (local docker postgres):
//   psql -c "CREATE DATABASE ratecap_verify" \
//     postgres://postgres:postgres@localhost:5432/postgres
//   bun run server/test/rate-cap-check.ts
// Env: SIM_RATE_MAX_RUNS_24H / SIM_RATE_MAX_INFLIGHT override the defaults.
// Scratch DB by default; override with RATECAP_DATABASE_URL. Never inherits
// DATABASE_URL silently - this script seeds throwaway rows.
process.env.DATABASE_URL = process.env.RATECAP_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ratecap_verify";
process.env.SIM_RATE_MAX_RUNS_24H ??= "50";
process.env.SIM_RATE_MAX_INFLIGHT ??= "3";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { resolve } from "node:path";
import { db, pool, schema } from "../src/db/client";
import { assertRateLimits, RATE_LIMIT_MAX_RUNS_24H, RATE_LIMIT_MAX_INFLIGHT } from "../src/sim";

const now = () => new Date().toISOString();
let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
};

const old = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

await migrate(db, { migrationsFolder: resolve(import.meta.dir, "../src/db/migrations") });

// Seed one user + 2 fresh runs (under both caps) + 100 ancient runs that must not count.
await db.insert(schema.users).values({ id: "rate-cap-user", email: "rate-cap@example.com", createdAt: now() }).onConflictDoNothing();
await db.insert(schema.simulationRuns).values([
  { id: "rc-1", userId: "rate-cap-user", status: "succeeded", triggerIdx: 0, createdAt: now(), updatedAt: now() },
  { id: "rc-2", userId: "rate-cap-user", status: "failed", triggerIdx: 0, createdAt: now(), updatedAt: now() },
  ...Array.from({ length: 100 }, (_, i) => ({
    id: `rc-old-${i}`, userId: "rate-cap-user", status: "succeeded", triggerIdx: 0, createdAt: old(2), updatedAt: old(2),
  })),
]).onConflictDoNothing();

// 1. Under limit -> passes (2 fresh, 100 ancient).
try {
  await assertRateLimits("rate-cap-user");
  check("under-limit user passes", true, "2 fresh runs");
} catch (e) {
  check("under-limit user passes", false, String(e));
}

// 2. At the 24h cap -> throws the daily message. Inflate fresh count to the cap.
await db.insert(schema.simulationRuns).values(
  Array.from({ length: RATE_LIMIT_MAX_RUNS_24H - 2 }, (_, i) => ({
    id: `rc-fill-${i}`, userId: "rate-cap-user", status: "succeeded", triggerIdx: 0, createdAt: now(), updatedAt: now(),
  })),
).onConflictDoNothing();
try {
  await assertRateLimits("rate-cap-user");
  check("24h cap rejects", false, "no throw at cap");
} catch (e) {
  check("24h cap rejects", (e as Error).message.includes("Daily simulation limit"), (e as Error).message);
}

// 3. Concurrent cap on a fresh user with 3 stuck runs.
await db.insert(schema.users).values({ id: "rate-cap-user-2", email: "rate-cap-2@example.com", createdAt: now() }).onConflictDoNothing();
await db.insert(schema.simulationRuns).values(
  Array.from({ length: RATE_LIMIT_MAX_INFLIGHT }, (_, i) => ({
    id: `rc2-${i}`, userId: "rate-cap-user-2", status: i === 0 ? "queued" : "running", triggerIdx: 0, createdAt: now(), updatedAt: now(),
  })),
).onConflictDoNothing();
try {
  await assertRateLimits("rate-cap-user-2");
  check("inflight cap rejects", false, "no throw at inflight cap");
} catch (e) {
  check("inflight cap rejects", (e as Error).message.includes("in flight"), (e as Error).message);
}

// 4. Aging rows out of the window frees budget: backdate half the fresh rows.
await db.update(schema.simulationRuns)
  .set({ createdAt: old(2) })
  .where(sql`${schema.simulationRuns.userId} = ${"rate-cap-user"} and ${schema.simulationRuns.id} like 'rc-fill-%' and ${schema.simulationRuns.id} < 'rc-fill-25'`);
try {
  await assertRateLimits("rate-cap-user");
  check("aged-out rows stop counting", true);
} catch (e) {
  check("aged-out rows stop counting", false, String(e));
}

await pool.end();
console.log(failures ? `${failures} FAILURES` : "ALL PASS");
process.exit(failures ? 1 : 0);
