import { initTRPC, TRPCError } from '@trpc/server';
import { type Context } from './context';
import superjson from 'superjson';

/**
 * Initialize tRPC with context type
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  // Enable SSE for subscriptions
  sse: {
    maxDurationMs: 5 * 60 * 1000, // 5 minutes max connection
    ping: {
      enabled: true,
      intervalMs: 3000, // Keep-alive ping every 3 seconds
    },
    client: {
      reconnectAfterInactivityMs: 5000, // Reconnect after 5 seconds of inactivity
    },
  },
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
