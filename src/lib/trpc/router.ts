import { router } from './init';
import { userRouter } from './routers/user';
import { integrationsRouter } from './routers/integrations';
import { chatRouter } from './routers/chat';
import { draftsRouter } from './routers/drafts';

/**
 * Main tRPC router
 * Combines all sub-routers
 */
export const appRouter = router({
  user: userRouter,
  integrations: integrationsRouter,
  chat: chatRouter,
  drafts: draftsRouter,
});

export type AppRouter = typeof appRouter;
