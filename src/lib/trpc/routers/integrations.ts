import { router, protectedProcedure } from '../init';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getUserAvailableApps } from '@/lib/mastra/agent-factory';
import { invalidateUserCache } from '@/mastra/cache/tool-cache';
import {
  initiateComposioConnection,
  waitForComposioConnection
} from '@/lib/composio/client';

/**
 * Integrations router - manages user connections to Composio
 */
export const integrationsRouter = router({
  /**
   * List all integrations for the current user
   * Returns connection status for Composio apps
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const userIntegrations = await ctx.db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, ctx.userId));

    // Get Composio integrations
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
      composio: composioApps,
    };
  }),

  /**
   * Get a specific integration by provider
   */
  getByProvider: protectedProcedure
    .input(
      z.object({
        provider: z.literal('composio'),
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
   * Disconnect a Composio integration
   * Requires appName to disconnect specific app
   */
  disconnect: protectedProcedure
    .input(
      z.object({
        provider: z.literal('composio'),
        appName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(integrations).where(
        and(
          eq(integrations.userId, ctx.userId),
          eq(integrations.provider, input.provider),
          eq(integrations.appName, input.appName)
        )
      );

      // Invalidate tool cache after disconnecting
      // This ensures agents don't have stale tools
      console.log(`[tRPC] Invalidating tool cache for user ${ctx.userId} after disconnect`);
      invalidateUserCache(ctx.userId);

      return {
        success: true,
        provider: input.provider,
        appName: input.appName,
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
   * Initiate a Composio connection
   * Creates a pending integration and returns OAuth URL + connection ID
   */
  initiateComposioConnection: protectedProcedure
    .input(
      z.object({
        app: z.enum(['gmail', 'googlecalendar', 'slack', 'notion', 'github']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Check if integration already exists for this user+app
        const existing = await ctx.db.query.integrations.findFirst({
          where: and(
            eq(integrations.userId, ctx.userId),
            eq(integrations.provider, 'composio'),
            eq(integrations.appName, input.app)
          ),
        });

        // Create or update to pending status
        if (existing) {
          await ctx.db
            .update(integrations)
            .set({
              status: 'pending',
              connectedAccountId: null,
              connectedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(integrations.id, existing.id));
        } else {
          await ctx.db.insert(integrations).values({
            userId: ctx.userId,
            provider: 'composio',
            appName: input.app,
            status: 'pending',
          });
        }

        // Generate OAuth URL using Composio SDK
        const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/composio/callback`;
        const state = Buffer.from(
          JSON.stringify({
            userId: ctx.userId,
            app: input.app,
            timestamp: Date.now(),
          })
        ).toString('base64url');
        const callbackUrlWithState = `${callbackUrl}?state=${state}`;

        const { redirectUrl, connectionId } = await initiateComposioConnection(
          ctx.userId,
          input.app,
          callbackUrlWithState
        );

        return {
          redirectUrl,
          connectionId,
          app: input.app,
        };
      } catch (error) {
        console.error('[tRPC] Composio connection initiation failed:', error);
        throw new Error(
          `Failed to initiate connection: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }),

  /**
   * Poll for Composio connection status
   * Waits for connection to become ACTIVE or FAILED
   */
  pollComposioConnection: protectedProcedure
    .input(
      z.object({
        connectionId: z.string(),
        app: z.enum(['gmail', 'googlecalendar', 'slack', 'notion', 'github']),
        timeoutMs: z.number().min(10000).max(180000).default(120000), // 10s to 3min
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        console.log(`[tRPC] Polling connection ${input.connectionId} for app ${input.app}`);

        // Wait for connection to complete
        const connectedAccount = await waitForComposioConnection(
          input.connectionId,
          input.timeoutMs
        );

        // Find the integration record
        const integration = await ctx.db.query.integrations.findFirst({
          where: and(
            eq(integrations.userId, ctx.userId),
            eq(integrations.provider, 'composio'),
            eq(integrations.appName, input.app)
          ),
        });

        if (!integration) {
          throw new Error('Integration record not found');
        }

        // Update database based on connection status
        const isActive = connectedAccount.status === 'ACTIVE';
        await ctx.db
          .update(integrations)
          .set({
            connectedAccountId: isActive ? connectedAccount.id : null,
            status: isActive ? 'connected' : 'error',
            connectedAt: isActive ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(integrations.id, integration.id));

        // Invalidate tool cache when integration status changes
        // This ensures agents get fresh tools on next request
        if (isActive) {
          console.log(`[tRPC] Invalidating tool cache for user ${ctx.userId} after successful connection`);
          invalidateUserCache(ctx.userId);
        }

        return {
          status: connectedAccount.status,
          connectedAccountId: connectedAccount.id,
          app: input.app,
          isActive,
        };
      } catch (error) {
        console.error('[tRPC] Connection polling failed:', error);

        // Update integration to error state
        await ctx.db
          .update(integrations)
          .set({
            status: 'error',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(integrations.userId, ctx.userId),
              eq(integrations.provider, 'composio'),
              eq(integrations.appName, input.app)
            )
          );

        throw new Error(
          `Connection polling failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }),

  // NOTE: The chat endpoint has been removed as it duplicates functionality
  // in src/lib/trpc/routers/chat.ts. Use chatRouter.sendMessage instead.
});
