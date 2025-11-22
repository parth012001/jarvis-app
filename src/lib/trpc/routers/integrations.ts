import { router, protectedProcedure } from '../init';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Integrations router - manages user connections to Hyperspell and Composio
 */
export const integrationsRouter = router({
  /**
   * List all integrations for the current user
   * Returns connection status for Hyperspell and Composio
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const userIntegrations = await ctx.db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, ctx.userId));

    // Transform array into object with provider as key
    const integrationsMap = userIntegrations.reduce(
      (acc, integration) => {
        acc[integration.provider] = {
          id: integration.id,
          status: integration.status,
          connectedAt: integration.connectedAt,
          connectedAccountId: integration.connectedAccountId,
        };
        return acc;
      },
      {} as Record<
        string,
        {
          id: string;
          status: string;
          connectedAt: Date | null;
          connectedAccountId: string | null;
        }
      >
    );

    return {
      hyperspell: integrationsMap['hyperspell'] || null,
      composio: integrationsMap['composio'] || null,
    };
  }),

  /**
   * Get a specific integration by provider
   */
  getByProvider: protectedProcedure
    .input(
      z.object({
        provider: z.enum(['hyperspell', 'composio']),
      })
    )
    .query(async ({ ctx, input }) => {
      const integration = await ctx.db.query.integrations.findFirst({
        where: and(
          eq(integrations.userId, ctx.userId),
          eq(integrations.provider, input.provider)
        ),
      });

      return integration || null;
    }),

  /**
   * Disconnect an integration
   * Removes the integration from the database
   */
  disconnect: protectedProcedure
    .input(
      z.object({
        provider: z.enum(['hyperspell', 'composio']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(integrations)
        .where(
          and(
            eq(integrations.userId, ctx.userId),
            eq(integrations.provider, input.provider)
          )
        );

      return { success: true, provider: input.provider };
    }),
});
