import { initTRPC, TRPCError } from '@trpc/server';
import { type Context } from './context';
import superjson from 'superjson';

/**
 * Initialize tRPC with context type
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure - requires authentication
 * Throws UNAUTHORIZED if user is not logged in
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId, // Now guaranteed to be non-null
    },
  });
});
