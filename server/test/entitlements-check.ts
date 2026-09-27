// Phase 5C regression: the entitlements source must read stringz-pay's
// schema exactly (sp_entitlements with ISO-text paid_through - never compare
// it to now() in SQL, that is a text-vs-timestamptz operator error).
// Usage: bun run server/test/entitlements-check.ts  (command-line DATABASE_URL)
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { resolve } from "node:path";
import { db, pool } from "../src/db/client";
import { getEntitlements } from "../src/entitlements";

await migrate(db, { migrationsFolder: resolve(import.meta.dir, "../src/db/migrations") });
// Recreate the stringz-pay schema (mirrors stringz-pay/db/001_init.sql).
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS sp_entitlements (
    user_id text PRIMARY KEY,
    plan text NOT NULL,
    paid_through text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
};

const USER = "ent-check-user";
await db.execute(sql`INSERT INTO users (id, email, created_at) VALUES (${USER}, 'ent@example.com', ${new Date().toISOString()}) ON CONFLICT (id) DO NOTHING`);

// No entitlement row -> community.
let ent = await getEntitlements(USER);
check("no row -> community", ent.tier === "community" && ent.monthlySimLimit === 50, `tier=${ent.tier}`);

// Active pro row -> pro tier.
await db.execute(sql`INSERT INTO sp_entitlements (user_id, plan, paid_through) VALUES (${USER}, 'pro_monthly', ${new Date(Date.now() + 30 * 86400e3).toISOString()})
  ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, paid_through = EXCLUDED.paid_through`);
ent = await getEntitlements(USER);
check("active pro row -> pro", ent.tier === "pro" && ent.monthlySimLimit === 1000, `tier=${ent.tier} limit=${ent.monthlySimLimit}`);
check("paidThrough surfaced", ent.paidThrough !== null);

// Expired row -> falls back to community (this was the live bug class).
await db.execute(sql`UPDATE sp_entitlements SET paid_through = ${new Date(Date.now() - 86400e3).toISOString()} WHERE user_id = ${USER}`);
ent = await getEntitlements(USER);
check("expired row -> community again", ent.tier === "community" && ent.paidThrough === null, `tier=${ent.tier}`);

// Team plan id resolves to team limits.
await db.execute(sql`UPDATE sp_entitlements SET plan = 'team_annual', paid_through = ${new Date(Date.now() + 365 * 86400e3).toISOString()} WHERE user_id = ${USER}`);
ent = await getEntitlements(USER);
check("team_annual -> team limits", ent.tier === "team" && ent.monthlySimLimit === 4000, `tier=${ent.tier} limit=${ent.monthlySimLimit}`);

await pool.end();
console.log(failures ? `${failures} FAILURES` : "ALL PASS");
process.exit(failures ? 1 : 0);
