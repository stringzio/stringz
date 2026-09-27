import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { verifyMessage } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { publicProcedure, protectedProcedure, router } from "./trpc";
import { db, schema } from "../db/client";
import { createSession, destroySession, issueNonce, consumeNonce } from "../session";
import { getProvider, PLANS } from "../billing";
import {
  waitlistJoinInput,
  newsletterSubscribeInput,
  emailSignupInput,
  emailSigninInput,
  siweVerifyInput,
  flowSaveInput,
  savedFlowSchema,
  onboardingSubmitInput,
  runRecordInput,
  runRecordSchema,
  simulateEnqueueInput,
  simulateRunSchema,
  simulateListResponseSchema,
  type PublicUser,
} from "../../../src/lib/contract";
import {
  assertCloudSimEnabled,
  assertRateLimits,
  srcObjectUri,
  signUploadUrl,
  enqueueTask,
  reconcileRun,
  writeRunSecrets,
  deleteRunSecrets,
  PROJECT_UPLOAD_TTL_MS,
} from "../sim";

const toPublicUser = (u: {
  id: string;
  name?: string | null;
  email?: string | null;
  walletAddress?: string | null;
  avatar?: string | null;
  createdAt?: string;
  plan?: string | null;
  planStatus?: string | null;
  planRenewalAt?: string | null;
}, onboarded = false, authProvider: string | null = null): PublicUser => ({
  id: u.id,
  name: u.name ?? null,
  email: u.email ?? null,
  walletAddress: u.walletAddress ?? null,
  avatar: u.avatar ?? null,
  createdAt: u.createdAt ?? "",
  plan: u.plan ?? "community",
  planStatus: u.planStatus ?? "active",
  planRenewalAt: u.planRenewalAt ?? null,
  onboarded,
  authProvider,
});

const publicConfig = {
  email: true,
  siwe: false, // wallet-as-auth removed v0 lockup - wallets connect on the canvas instead
  google: !!process.env.GOOGLE_CLIENT_ID,
  github: !!process.env.GITHUB_CLIENT_ID,
  apple: false, // requires an Apple Developer account
};

const runShape = (r: typeof schema.simulationRuns.$inferSelect) => ({
  id: r.id,
  flowId: r.flowId,
  status: r.status,
  triggerIdx: r.triggerIdx,
  exitCode: r.exitCode,
  result: r.result,
  errorClass: r.errorClass,
  srcGcsUri: r.srcGcsUri,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const appRouter = router({
  config: router({
    auth: publicProcedure.query(() => publicConfig),
  }),

  waitlist: router({
    join: publicProcedure.input(waitlistJoinInput).mutation(async ({ input }) => {
      const email = input.email.toLowerCase();
      await db.insert(schema.waitlist).values({ id: randomUUID(), email, createdAt: new Date().toISOString() }).onConflictDoNothing();
      const [row] = await db.select({ count: sql<number>`count(*)` }).from(schema.waitlist);
      return { position: row?.count ?? 1 };
    }),
  }),

  newsletter: router({
    subscribe: publicProcedure.input(newsletterSubscribeInput).mutation(async ({ input }) => {
      await db
        .insert(schema.newsletter)
        .values({ id: randomUUID(), email: input.email.toLowerCase(), createdAt: new Date().toISOString() })
        .onConflictDoNothing();
      return { ok: true };
    }),
  }),

  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      const [onboarding] = await db
        .select({ id: schema.onboarding.id })
        .from(schema.onboarding)
        .where(eq(schema.onboarding.userId, ctx.user.id))
        .limit(1);
      const [oauth] = await db
        .select({ provider: schema.oauthAccounts.provider })
        .from(schema.oauthAccounts)
        .where(eq(schema.oauthAccounts.userId, ctx.user.id))
        .limit(1);
      const authProvider = oauth?.provider ?? (ctx.user.emailPasswordHash ? "email" : null);
      return toPublicUser(ctx.user, !!onboarding, authProvider);
    }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      await destroySession(ctx.sessionToken);
      ctx.clearSessionCookie();
      return { ok: true };
    }),

    emailSignup: publicProcedure.input(emailSignupInput).mutation(async ({ input, ctx }) => {
      const email = input.email.toLowerCase();
      const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (existing.length) throw new Error("An account with this email already exists.");
      const user: typeof schema.users.$inferInsert = {
        id: randomUUID(),
        name: input.name ?? null,
        email,
        emailPasswordHash: await Bun.password.hash(input.password),
        walletAddress: null,
        createdAt: new Date().toISOString(),
      };
      await db.insert(schema.users).values(user);
      ctx.setSessionCookie(await createSession(user.id));
      return toPublicUser(user, false, "email");
    }),

    emailSignin: publicProcedure.input(emailSigninInput).mutation(async ({ input, ctx }) => {
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, input.email.toLowerCase())).limit(1);
      if (!user?.emailPasswordHash || !(await Bun.password.verify(input.password, user.emailPasswordHash))) {
        throw new Error("Invalid email or password.");
      }
      ctx.setSessionCookie(await createSession(user.id));
      return toPublicUser(user, false, "email");
    }),

    siweNonce: publicProcedure.query(() => ({ nonce: issueNonce() })),

    siweVerify: publicProcedure.input(siweVerifyInput).mutation(async ({ input, ctx }) => {
      const parsed = parseSiweMessage(input.message);
      if (!parsed.address || !parsed.nonce) throw new Error("Malformed sign-in message.");
      if (!consumeNonce(parsed.nonce)) throw new Error("Sign-in expired - try again.");
      if (parsed.expirationTime && new Date(parsed.expirationTime).getTime() < Date.now()) {
        throw new Error("Sign-in message expired.");
      }
      const valid = await verifyMessage({
        address: parsed.address,
        message: input.message,
        signature: input.signature as `0x${string}`,
      });
      if (!valid) throw new Error("Signature does not match the wallet address.");

      const address = parsed.address.toLowerCase();
      let [user] = await db.select().from(schema.users).where(eq(schema.users.walletAddress, address)).limit(1);
      if (!user) {
        const id = randomUUID();
        await db.insert(schema.users).values({ id, name: null, email: null, emailPasswordHash: null, walletAddress: address, createdAt: new Date().toISOString() });
        [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
      }
      ctx.setSessionCookie(await createSession(user.id));
      return toPublicUser(user);
    }),
  }),

  flows: router({
    save: protectedProcedure.input(flowSaveInput).mutation(async ({ input, ctx }) => {
      // Plan gate: the Community plan caps saved flows (cloud-only entitlements
      // like the vault and teams arrive with the rest of Phase 3c/3d).
      const plan = (ctx.user.plan ?? "community") as keyof typeof PLANS;
      const [existing] = await db
        .select()
        .from(schema.flows)
        .where(sql`${schema.flows.userId} = ${ctx.user.id} and ${schema.flows.name} = ${input.name}`)
        .limit(1);
      if (!existing) {
        const [row] = await db.select({ count: sql<number>`count(*)` }).from(schema.flows).where(eq(schema.flows.userId, ctx.user.id));
        if ((row?.count ?? 0) >= PLANS[plan].savedFlows) {
          throw new Error(`Community plan holds up to ${PLANS.community.savedFlows} saved flows - upgrade to Pro for ${PLANS.pro.savedFlows}.`);
        }
      }
      const now = new Date().toISOString();
      if (existing) {
        await db.update(schema.flows)
          .set({ nodes: input.nodes, edges: input.edges, updatedAt: now })
          .where(eq(schema.flows.id, existing.id));
        return { id: existing.id };
      }
      const id = randomUUID();
      await db.insert(schema.flows).values({
        id, userId: ctx.user.id, name: input.name, nodes: input.nodes, edges: input.edges, updatedAt: now,
      });
      return { id };
    }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db.select().from(schema.flows)
        .where(eq(schema.flows.userId, ctx.user.id))
        .orderBy(sql`${schema.flows.updatedAt} desc`)
        .limit(50);
      return rows.map((r) => savedFlowSchema.parse({ id: r.id, name: r.name, nodes: r.nodes, edges: r.edges, updatedAt: r.updatedAt }));
    }),

    remove: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input, ctx }) => {
      await db.delete(schema.flows).where(sql`${schema.flows.id} = ${input.id} and ${schema.flows.userId} = ${ctx.user.id}`);
      return { ok: true };
    }),
  }),

  billing: router({
    /** Returns the hosted checkout URL for the configured rail. */
    checkout: protectedProcedure.mutation(async ({ ctx }) => {
      const provider = getProvider();
      if (!provider) {
        throw new Error("Billing is not live yet - the payment rail keys are being provisioned.");
      }
      const baseUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
      return provider.createCheckout({ userId: ctx.user.id, email: ctx.user.email, baseUrl });
    }),
  }),

  onboarding: router({
    /** Post-signup questions: role, how they heard about Stringz, newsletter opt-in. */
    submit: protectedProcedure.input(onboardingSubmitInput).mutation(async ({ input, ctx }) => {
      const values = {
        role: input.role,
        roleOther: input.role === "other" ? (input.roleOther?.trim() || null) : null,
        heardFrom: input.heardFrom,
        heardOther: input.heardFrom === "other" ? (input.heardOther?.trim() || null) : null,
        newsletter: input.newsletter,
      };
      const [existing] = await db.select().from(schema.onboarding).where(eq(schema.onboarding.userId, ctx.user.id)).limit(1);
      if (existing) {
        await db.update(schema.onboarding).set(values).where(eq(schema.onboarding.id, existing.id));
      } else {
        await db.insert(schema.onboarding).values({ id: randomUUID(), userId: ctx.user.id, createdAt: new Date().toISOString(), ...values });
      }
      if (input.newsletter && ctx.user.email) {
        await db.insert(schema.newsletter).values({ id: randomUUID(), email: ctx.user.email, createdAt: new Date().toISOString() }).onConflictDoNothing();
      }
      return { ok: true };
    }),
  }),

  runs: router({
    /** Record one finished canvas run (drafts included - flowName is the canvas name). */
    record: protectedProcedure.input(runRecordInput).mutation(async ({ input, ctx }) => {
      await db.insert(schema.flowRuns).values({
        id: randomUUID(),
        userId: ctx.user.id,
        flowName: input.flowName,
        status: input.status,
        nodeCount: input.nodeCount,
        chains: input.chains,
        durationMs: input.durationMs,
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    }),
    /** Recent runs for the Stats screen; aggregations happen client-side. */
    recent: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(500).default(200) }))
      .query(async ({ input, ctx }) => {
        const rows = await db
          .select()
          .from(schema.flowRuns)
          .where(eq(schema.flowRuns.userId, ctx.user.id))
          .orderBy(sql`${schema.flowRuns.createdAt} desc`)
          .limit(input.limit);
        return rows.map((r) =>
          runRecordSchema.parse({
            id: r.id,
            flowName: r.flowName,
            status: r.status,
            nodeCount: r.nodeCount,
            chains: r.chains,
            durationMs: r.durationMs,
            createdAt: r.createdAt,
          }),
        );
      }),
  }),

  simulate: router({
    /** Reserve a run row + signed upload URL, then push a dispatch task. The client PUTs the project tarball before the task fires. */
    enqueue: protectedProcedure.input(simulateEnqueueInput).mutation(async ({ input, ctx }) => {
      assertCloudSimEnabled();
      // Phase 4 Slice 4A: per-user daily + concurrent caps, enforced in
      // Postgres before any GCS write or task dispatch (see sim.ts).
      await assertRateLimits(ctx.user.id);
      const runId = randomUUID();
      const now = new Date().toISOString();
      await db.insert(schema.simulationRuns).values({
        id: runId,
        userId: ctx.user.id,
        flowId: input.flowId ?? null,
        status: "queued",
        triggerIdx: input.triggerIdx,
        srcGcsUri: srcObjectUri(runId),
        createdAt: now,
        updatedAt: now,
      });
      try {
        // Phase 3: ephemeral secrets persist to a run-scoped GCS object
        // (never the DB) BEFORE the task can dispatch.
        if (input.secrets) await writeRunSecrets(runId, input.secrets);
        await enqueueTask(runId, input.triggerInput);
      } catch (err) {
        await db.delete(schema.simulationRuns).where(eq(schema.simulationRuns.id, runId));
        void deleteRunSecrets(runId);
        throw err;
      }
      const uploadUrl = await signUploadUrl(runId);
      return {
        runId,
        uploadUrl,
        uploadExpiresAt: new Date(Date.now() + PROJECT_UPLOAD_TTL_MS).toISOString(),
        status: "queued",
      };
    }),

    /** One run's state, reconciled against the uploaded result object. */
    status: protectedProcedure.input(z.object({ runId: z.string().uuid() })).query(async ({ input, ctx }) => {
      const [row] = await db.select().from(schema.simulationRuns).where(eq(schema.simulationRuns.id, input.runId)).limit(1);
      if (!row || row.userId !== ctx.user.id) throw new Error("Not found");
      const reconciled = await reconcileRun(row);
      return simulateRunSchema.parse({ ...runShape(reconciled.row), events: reconciled.events });
    }),

    /** Recent runs for the Simulations screen; aggregations happen client-side. */
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db
        .select()
        .from(schema.simulationRuns)
        .where(eq(schema.simulationRuns.userId, ctx.user.id))
        .orderBy(sql`${schema.simulationRuns.createdAt} desc`)
        .limit(50);
      return rows.map((r) => simulateListResponseSchema.element.parse(runShape(r)));
    }),
  }),
});

export type AppRouter = typeof appRouter;
