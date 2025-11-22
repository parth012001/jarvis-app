import { createTRPCReact } from '@trpc/react-query';
import { type AppRouter } from './router';

/**
 * tRPC React client
 * Use this in components to call tRPC procedures
 */
export const trpc = createTRPCReact<AppRouter>();
