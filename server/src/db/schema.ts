import { pgTable, text, bigint, integer, boolean, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";

/**
 * FlowKit Postgres schema (Drizzle). Primary and only database: the managed
 * Postgres instance in GCP for the cloud, and the same schema via
 * `docker compose` for local self-hosting (see compose.yaml).
 */

export const users = pgTable("users", {
  id: text("id").primaryKey(), // crypto.randomUUID()
  name: text("name"),
  email: text("email"), // nullable: wallet-only users
  emailPasswordHash: text("email_password_hash"),
  walletAddress: text("wallet_address"), // lowercase
  createdAt: text("created_at").notNull(), // ISO
  plan: text("plan").notNull().default("community"),
  planStatus: text("plan_status").notNull().default("active"), // active | past_due | canceled
  planRenewalAt: text("plan_renewal_at"), // ISO; null for community
  planProvider: text("plan_provider"), // x402 | commerce | null
  planRef: text("plan_ref"), // subscription/charge id on the rail
  avatar: text("avatar"), // profile picture URL (GitHub avatar for OAuth users)
}, (t) => [
  uniqueIndex("users_email_unique").on(t.email),
  uniqueIndex("users_wallet_unique").on(t.walletAddress),
]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(), // epoch ms
});

export const oauthAccounts = pgTable("oauth_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // google | github | apple
  providerAccountId: text("provider_account_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [
  uniqueIndex("oauth_provider_account_unique").on(t.provider, t.providerAccountId),
]);

export const waitlist = pgTable("waitlist", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("waitlist_email_unique").on(t.email)]);

export const newsletter = pgTable("newsletter", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("newsletter_email_unique").on(t.email)]);

export const flows = pgTable("flows", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nodes: jsonb("nodes").notNull(), // FlowNodeDto[]
  edges: jsonb("edges").notNull(), // FlowEdgeDto[]
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  index("flows_user_idx").on(t.userId),
  uniqueIndex("flows_user_name_unique").on(t.userId, t.name),
]);

// ── billing (Phase 3c) ──────────────────────────────────────────────────────
// Money moves only on the payment rail; FlowKit stores entitlement state.

export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  type: text("type").notNull(), // subscription.active | subscription.canceled | charge.confirmed | ...
  ref: text("ref"),
  payload: jsonb("payload").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [index("billing_events_user_idx").on(t.userId)]);

// ── run tracking + onboarding (v0.2) ────────────────────────────────────────

/** One executed canvas run. Recorded by the client after Run finishes. */
export const flowRuns = pgTable("flow_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  flowName: text("flow_name").notNull(), // canvas name at run time (drafts included)
  status: text("status").notNull(), // success | failed
  nodeCount: integer("node_count").notNull(),
  chains: text("chains").array().notNull(), // distinct chains used
  durationMs: integer("duration_ms").notNull(),
  createdAt: text("created_at").notNull(), // ISO
}, (t) => [index("flow_runs_user_idx").on(t.userId)]);

/** Post-signup onboarding answers. One row per user (upsert). */
export const onboarding = pgTable("onboarding", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // developer | founder | enthusiast | other
  roleOther: text("role_other"), // free text when role = other (max 30 chars)
  heardFrom: text("heard_from").notNull(), // social | friend | invite | other
  heardOther: text("heard_other"), // free text when heard_from = other
  newsletter: boolean("newsletter").notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("onboarding_user_unique").on(t.userId)]);

// ── cloud simulation runs ───────────────────────────────────────────────────
// One enqueue -> one row. The Cloud Tasks queue POSTs /sim-dispatch, the API
// starts the Cloud Run Job, and the runner uploads its NDJSON event stream;
// polling reconciles the row from the uploaded result object.

/** One cloud simulation run executed by the sim runner. */
export const simulationRuns = pgTable("simulation_runs", {
  id: text("id").primaryKey(), // crypto.randomUUID()
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  flowId: text("flow_id"), // nullable on purpose: runs may come from unsaved drafts (no FK)
  status: text("status").notNull(), // queued | running | succeeded | failed | auth_error | timeout
  triggerIdx: integer("trigger_idx").notNull().default(0),
  exitCode: integer("exit_code"),
  result: text("result"), // CLI result payload on success
  errorClass: text("error_class"), // runner status when failed: failed | auth_error | timeout | stale
  srcGcsUri: text("src_gcs_uri"), // gs:// URI of the uploaded project archive
  createdAt: text("created_at").notNull(), // ISO
  updatedAt: text("updated_at").notNull(), // ISO
}, (t) => [index("simulation_runs_user_idx").on(t.userId)]);
