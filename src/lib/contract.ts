import { z } from "zod";

/**
 * FlowKit API contract - the single source of truth shared by the tRPC server
 * (server/src/trpc/*) and the frontend client (src/lib/trpc.ts).
 * Keep this file free of Bun/DOM/React APIs so both toolchains can compile it.
 */

// ── waitlist + newsletter ────────────────────────────────────────────────

export const waitlistJoinInput = z.object({
  email: z.string().email().max(254),
});
export type WaitlistJoinInput = z.infer<typeof waitlistJoinInput>;

export const newsletterSubscribeInput = z.object({
  email: z.string().email().max(254),
});
export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeInput>;

// ── auth ─────────────────────────────────────────────────────────────────

export const emailSignupInput = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(80).optional(),
});
export type EmailSignupInput = z.infer<typeof emailSignupInput>;

export const emailSigninInput = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});
export type EmailSigninInput = z.infer<typeof emailSigninInput>;

export const siweVerifyInput = z.object({
  message: z.string().min(1).max(4096),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});
export type SiweVerifyInput = z.infer<typeof siweVerifyInput>;

export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  walletAddress: z.string().nullable(),
  avatar: z.string().nullable(),
  createdAt: z.string(),
  plan: z.string(),
  planStatus: z.string(),
  planRenewalAt: z.string().nullable(),
  onboarded: z.boolean(),
  /** How the user signs in: "github", "email", or null (legacy/anonymous). */
  authProvider: z.string().nullable(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authConfigSchema = z.object({
  email: z.boolean(),
  siwe: z.boolean(),
  google: z.boolean(),
  github: z.boolean(),
  apple: z.boolean(),
});
export type AuthConfig = z.infer<typeof authConfigSchema>;

// ── flows ────────────────────────────────────────────────────────────────

export const flowNodeSchema = z.object({
  id: z.string().min(1).max(120),
  service: z.string().min(1).max(40),
  action: z.string().min(1).max(120),
  x: z.number(),
  y: z.number(),
  chain: z.string().max(20).optional(),
  pair: z.string().max(20).optional(),
  params: z.record(z.string(), z.string()).optional(),
});
export type FlowNodeDto = z.infer<typeof flowNodeSchema>;

export const flowEdgeSchema = z.object({
  from: z.string().min(1).max(120),
  to: z.string().min(1).max(120),
});
export type FlowEdgeDto = z.infer<typeof flowEdgeSchema>;

export const flowSaveInput = z.object({
  name: z.string().min(1).max(120),
  nodes: z.array(flowNodeSchema).max(200),
  edges: z.array(flowEdgeSchema).max(400),
});
export type FlowSaveInput = z.infer<typeof flowSaveInput>;

export const savedFlowSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
  updatedAt: z.string(),
});
export type SavedFlow = z.infer<typeof savedFlowSchema>;

// ── onboarding + run tracking (v0.2) ────────────────────────────────────────

export const onboardingSubmitInput = z.object({
  role: z.enum(["developer", "founder", "enthusiast", "other"]),
  roleOther: z.string().max(30).optional(),
  heardFrom: z.enum(["social", "friend", "invite", "other"]),
  heardOther: z.string().max(30).optional(),
  newsletter: z.boolean(),
});
export type OnboardingSubmitInput = z.infer<typeof onboardingSubmitInput>;

export const runRecordInput = z.object({
  flowName: z.string().min(1).max(120),
  status: z.enum(["success", "failed"]),
  nodeCount: z.number().int().min(1).max(200),
  chains: z.array(z.string().max(20)).max(10),
  durationMs: z.number().int().min(0).max(600000),
});
export type RunRecordInput = z.infer<typeof runRecordInput>;

export const runRecordSchema = z.object({
  id: z.string(),
  flowName: z.string(),
  status: z.string(),
  nodeCount: z.number(),
  chains: z.array(z.string()),
  durationMs: z.number(),
  createdAt: z.string(),
});
export type RunRecord = z.infer<typeof runRecordSchema>;

// ── cloud simulation ─────────────────────────────────────────────────────────

export const simulateEnqueueInput = z.object({
  flowId: z.string().uuid().nullish(),
  triggerIdx: z.number().int().min(0).max(100).default(0),
  /**
   * Phase 3 (Slice 3B): optional trigger inputs passed straight through to
   * `cre workflow simulate` (`--http-payload <file>` / `--evm-tx-hash`). The
   * generated workflows' triggers are cron (and log) today; payload-consuming
   * HTTP triggers arrive with the http-trigger node in v0.1 - the plumbing is
   * ready for them.
   */
  triggerInput: z
    .object({
      httpPayload: z.string().max(64 * 1024).optional(),
      evmTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "evmTxHash must be a 32-byte 0x-prefixed hash").optional(),
    })
    .optional(),
  /**
   * Phase 3: run-scoped ephemeral secrets (env var name -> value). The server
   * writes them to a run-scoped GCS object the runner downloads into the
   * sandbox .env; they are deleted when the run reaches a terminal state and
   * are never written to the DB or logs. Single-line values, size-capped.
   */
  secrets: z.record(z.string(), z.string()).optional(),
});
export type SimulateEnqueueInput = z.infer<typeof simulateEnqueueInput>;

export const simulateEnqueueResponseSchema = z.object({
  runId: z.string(),
  uploadUrl: z.string(),
  uploadExpiresAt: z.string(),
  status: z.string(),
});
export type SimulateEnqueueResponse = z.infer<typeof simulateEnqueueResponseSchema>;

export const simulateCancelInput = z.object({ runId: z.string().uuid() });
export type SimulateCancelInput = z.infer<typeof simulateCancelInput>;

export const simulateCancelResponseSchema = z.object({
  status: z.enum(["ok", "not-found", "not-cancellable"]),
});
export type SimulateCancelResponse = z.infer<typeof simulateCancelResponseSchema>;

export const billingEntitlementsSchema = z.object({
  tier: z.enum(["community", "pro", "team"]),
  monthlySimLimit: z.number(),
  paidThrough: z.string().nullable(),
  simsUsed30d: z.number(),
  simsRemaining: z.number(),
});
export type BillingEntitlements = z.infer<typeof billingEntitlementsSchema>;

/** billing.verify result. Payment rejections are expected business outcomes
 *  (unconfirmed, underpaid, wrong recipient), not exceptions - the server
 *  returns them typed so the client can retry or explain without parsing
 *  exception message text. "pending" means the server-side retry budget was
 *  exhausted while the chain was still catching up; the client should watch
 *  billing.entitlements, where the credit lands when it confirms. */
export const verifyPaymentResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("credited"),
    credited: z.boolean(),
    alreadyCredited: z.boolean(),
    plan: z.string(),
    userId: z.string(),
    paidThrough: z.string(),
  }),
  z.object({
    outcome: z.literal("pending"),
  }),
  z.object({
    outcome: z.literal("rejected"),
    code: z.string(),
    message: z.string(),
  }),
]);
export type VerifyPaymentResult = z.infer<typeof verifyPaymentResultSchema>;

export const simulateRunSchema = z.object({
  id: z.string(),
  flowId: z.string().nullable(),
  status: z.string(),
  triggerIdx: z.number(),
  exitCode: z.number().nullable(),
  result: z.string().nullable(),
  errorClass: z.string().nullable(),
  srcGcsUri: z.string().nullable(),
  durationMs: z.number().nullable(),
  costEstUsd: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  events: z.array(z.record(z.string(), z.unknown())),
});
export type SimulateRun = z.infer<typeof simulateRunSchema>;

export const simulateListResponseSchema = z.array(simulateRunSchema.omit({ events: true }));
export type SimulateListResponse = z.infer<typeof simulateListResponseSchema>;

// ── result wrappers ──────────────────────────────────────────────────────

export const waitlistJoinResult = z.object({
  position: z.number().int().positive(),
});
export type WaitlistJoinResult = z.infer<typeof waitlistJoinResult>;

export const okResult = z.object({ ok: z.boolean() });
