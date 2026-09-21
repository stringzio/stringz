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

// ── result wrappers ──────────────────────────────────────────────────────

export const waitlistJoinResult = z.object({
  position: z.number().int().positive(),
});
export type WaitlistJoinResult = z.infer<typeof waitlistJoinResult>;

export const okResult = z.object({ ok: z.boolean() });
