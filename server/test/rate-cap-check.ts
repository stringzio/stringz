// Phase 5 Slice 5B/5C local verification: tier-based monthly quota in
// assertRateLimits. Runs migrations on a scratch DB, seeds users + runs, and
// proves:
//   1. under-quota community user passes
//   2. community user at 50 runs/30d throws the upgrade message
//   3. aged-out rows free budget again
//   4. pro tier clears usage that blocked community, then rejects at 1,000
//   5. user at the concurrent cap throws the inflight message
// Usage (local docker postgres):
//   psql -c "CREATE DATABASE ratecap_verify" \
//     postgres://postgres:postgres@localhost:5432/postgres
//   bun run server/test/rate-cap-check.ts
// Env: SIM_RATE_MAX_INFLIGHT overrides the concurrency cap.
// Scratch DB by default; override with RATECAP_DATABASE_URL. Never inherits
// DATABASE_URL silently - this script seeds throwaway rows.
process.env.DATABASE_URL = process.env.RATECAP_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ratecap_verify";
process.env.SIM_RATE_MAX_INFLIGHT ??= "3";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { resolve } from "node:path";
import { db, pool, schema } from "../src/db/client";
import { assertRateLimits, RATE_LIMIT_MAX_INFLIGHT } from "../src/sim";
import { TIER_SIM_LIMITS } from "../../src/lib/pricing";

const COMMUNITY_LIMIT = TIER_SIM_LIMITS.community;

const now = () => new Date().toISOString();
let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
};

const aged = () => new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

const seedFresh = (prefix: string, userId: string, count: number, startIdx = 0) =>
  db.insert(schema.simulationRuns).values(
    Array.from({ length: count }, (_, i) => ({
      id: `${prefix}-${startIdx + i}`, userId, status: "succeeded", triggerIdx: 0, createdAt: now(), updatedAt: now(),
    })),
  ).onConflictDoNothing();

await migrate(db, { migrationsFolder: resolve(import.meta.dir, "../src/db/migrations") });

// Seed one user + 2 fresh runs (under quota) + 100 ancient runs that must not count.
await db.insert(schema.users).values({ id: "rate-cap-user", email: "rate-cap@example.com", createdAt: now() }).onConflictDoNothing();
await seedFresh("rc-seed", "rate-cap-user", 2);
await db.insert(schema.simulationRuns).values(
  Array.from({ length: 100 }, (_, i) => ({
    id: `rc-old-${i}`, userId: "rate-cap-user", status: "succeeded", triggerIdx: 0, createdAt: aged(), updatedAt: aged(),
  })),
).onConflictDoNothing();

// 1. Under quota -> passes (2 fresh, 100 ancient).
try {
  await assertRateLimits("rate-cap-user", "community");
  check("under-quota community passes", true, "2 fresh runs");
} catch (e) {
  check("under-quota community passes", false, String(e));
}

// 2. At the community monthly quota -> throws the upgrade message.
await seedFresh("rc-fill", "rate-cap-user", COMMUNITY_LIMIT - 2);
try {
  await assertRateLimits("rate-cap-user", "community");
  check("community monthly quota rejects", false, "no throw at quota");
} catch (e) {
  const msg = (e as Error).message;
  check("community monthly quota rejects", msg.includes("Free tier") && msg.includes("50"), msg);
}

// 3. Aging half the fill rows out of the 30d window frees community budget.
await db.update(schema.simulationRuns)
  .set({ createdAt: aged() })
  .where(sql`${schema.simulationRuns.userId} = ${"rate-cap-user"} and ${schema.simulationRuns.id} like 'rc-fill-%' and ${schema.simulationRuns.id} < 'rc-fill-25'`);
try {
  await assertRateLimits("rate-cap-user", "community");
  check("aged-out rows stop counting", true);
} catch (e) {
  check("aged-out rows stop counting", false, String(e));
}

// 4. Pro clears the remaining 27 fresh runs, then rejects at its own 1,000 cap.
try {
  await assertRateLimits("rate-cap-user", "pro");
  check("pro tier allows past community usage", true, "27 fresh runs used");
} catch (e) {
  check("pro tier allows past community usage", false, String(e));
}
const freshCount = 2 + (COMMUNITY_LIMIT - 2 - 25);
await seedFresh("rc-pro", "rate-cap-user", TIER_SIM_LIMITS.pro - freshCount, 0);
try {
  await assertRateLimits("rate-cap-user", "pro");
  check("pro monthly quota rejects", false, "no throw at pro quota");
} catch (e) {
  check("pro monthly quota rejects", (e as Error).message.includes("1,000"), (e as Error).message);
}

// 5. Concurrent cap on a fresh user with 3 stuck runs.
await db.insert(schema.users).values({ id: "rate-cap-user-2", email: "rate-cap-2@example.com", createdAt: now() }).onConflictDoNothing();
await db.insert(schema.simulationRuns).values(
  Array.from({ length: RATE_LIMIT_MAX_INFLIGHT }, (_, i) => ({
    id: `rc2-${i}`, userId: "rate-cap-user-2", status: i === 0 ? "queued" : "running", triggerIdx: 0, createdAt: now(), updatedAt: now(),
  })),
).onConflictDoNothing();
try {
  await assertRateLimits("rate-cap-user-2", "community");
  check("inflight cap rejects", false, "no throw at inflight cap");
} catch (e) {
  check("inflight cap rejects", (e as Error).message.includes("in flight"), (e as Error).message);
}

await pool.end();
console.log(failures ? `${failures} FAILURES` : "ALL PASS");
process.exit(failures ? 1 : 0);
