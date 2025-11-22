import { router, protectedProcedure } from '../init';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { createUserAgent, getUserAvailableApps } from '@/lib/mastra/agent-factory';

/**
 * Integrations router - manages user connections to Hyperspell and Composio
 */
export const integrationsRouter = router({
  /**
   * List all integrations for the current user
   * Returns connection status for Hyperspell and Composio apps
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const userIntegrations = await ctx.db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, ctx.userId));

    // Separate Hyperspell and Composio integrations
    const hyperspell = userIntegrations.find((i) => i.provider === 'hyperspell') || null;
    const composioApps = userIntegrations
      .filter((i) => i.provider === 'composio')
      .map((i) => ({
        id: i.id,
        appName: i.appName,
        status: i.status,
        connectedAt: i.connectedAt,
        connectedAccountId: i.connectedAccountId,
      }));

    return {
      hyperspell: hyperspell
        ? {
            id: hyperspell.id,
            status: hyperspell.status,
            connectedAt: hyperspell.connectedAt,
            connectedAccountId: hyperspell.connectedAccountId,
          }
        : null,
      composio: composioApps,
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
   * For Hyperspell: removes the integration
   * For Composio: requires appName to disconnect specific app
   */
  disconnect: protectedProcedure
    .input(
      z.object({
        provider: z.enum(['hyperspell', 'composio']),
        appName: z.string().optional(), // Required for Composio
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conditions = [
        eq(integrations.userId, ctx.userId),
        eq(integrations.provider, input.provider),
      ];

      // For Composio, require appName
      if (input.provider === 'composio') {
        if (!input.appName) {
          throw new Error('appName is required when disconnecting Composio apps');
        }
        conditions.push(eq(integrations.appName, input.appName));
      }

      await ctx.db.delete(integrations).where(and(...conditions));

      return {
        success: true,
        provider: input.provider,
        appName: input.appName || null,
      };
    }),

  /**
   * List available and connected Composio apps
   */
  listComposioApps: protectedProcedure.query(async ({ ctx }) => {
    const apps = await getUserAvailableApps(ctx.userId);
    return apps;
  }),

  /**
   * Chat with the user's AI agent
   * Creates an agent with user's connected tools and sends a message
   */
  chat: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Create agent with user's connected tools
        const agent = await createUserAgent(ctx.userId);

        // Generate response
        const response = await agent.generate(input.message);

        return {
          response: response.text,
          toolCalls: response.toolCalls || [],
        };
      } catch (error) {
        console.error('[tRPC] Agent chat error:', error);
        throw new Error(
          `Failed to process chat: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }),
});
