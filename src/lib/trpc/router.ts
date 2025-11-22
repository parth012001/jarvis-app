import { router } from './init';
import { userRouter } from './routers/user';
import { integrationsRouter } from './routers/integrations';

/**
 * Main tRPC router
 * Combines all sub-routers
 */
export const appRouter = router({
  user: userRouter,
  integrations: integrationsRouter,
});

export type AppRouter = typeof appRouter;
