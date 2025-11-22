import { router } from './init';
import { userRouter } from './routers/user';

/**
 * Main tRPC router
 * Combines all sub-routers
 */
export const appRouter = router({
  user: userRouter,
});

export type AppRouter = typeof appRouter;
