import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

/**
 * Creates context for tRPC procedures
 * Includes authenticated user ID from Clerk and database client
 */
export async function createContext() {
  const { userId } = await auth();

  return {
    userId,
    db,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
