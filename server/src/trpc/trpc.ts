import { initTRPC, TRPCError } from "@trpc/server";
import type { schema } from "../db/client";

export interface TrpcContext {
  user: typeof schema.users.$inferSelect | null;
  sessionToken: string | undefined;
  setSessionCookie: (token: string) => void;
  clearSessionCookie: () => void;
}

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to continue." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
