import { router, protectedProcedure } from '../init';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * User router - handles user-related operations
 */
export const userRouter = router({
  /**
   * Get current user info from database
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });

    return user || null; // Always return null instead of undefined
  }),
});
