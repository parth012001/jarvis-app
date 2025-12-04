import { db } from '@/lib/db';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { type ComposioApp } from '../composio/client';

/**
 * Mastra Agent Utilities
 *
 * REFACTORED: Agent creation moved to centralized Mastra instance (src/mastra/index.ts)
 *
 * This file now only contains utility functions for:
 * - getUserComposioIntegrations: Database queries for connected apps (used by tool-cache.ts)
 * - getUserAvailableApps: UI helper for onboarding page
 *
 * Legacy functions removed:
 * - createUserAgent() -> Use mastra.getAgent('chatAgent') instead
 * - createBasicAgent() -> Not needed with centralized instance
 */

/**
 * Gets all connected Composio apps for a user
 *
 * @param userId - Clerk user ID
 * @returns Array of connected integrations with their details
 */
export async function getUserComposioIntegrations(userId: string) {
  const userIntegrations = await db.query.integrations.findMany({
    where: and(
      eq(integrations.userId, userId),
      eq(integrations.provider, 'composio'),
      eq(integrations.status, 'connected')
    ),
  });

  return userIntegrations.filter(
    (integration) => integration.connectedAccountId && integration.appName
  );
}

// REMOVED: createUserAgent() - Use mastra.getAgent('chatAgent') instead
// REMOVED: createBasicAgent() - Not needed with centralized Mastra instance
//
// Migration notes:
// - Agent creation now happens in src/mastra/agents/*.ts
// - Agents are registered in src/mastra/index.ts
// - Tools are cached in src/mastra/cache/tool-cache.ts with 5-min TTL
// - Dynamic tool loading uses RuntimeContext pattern

/**
 * Gets available apps that a user can connect
 *
 * @param userId - Clerk user ID
 * @returns Object with available and connected apps
 */
export async function getUserAvailableApps(userId: string) {
  const allApps: ComposioApp[] = [
    'gmail',
    'googlecalendar',
    'slack',
    'notion',
    'github',
  ];

  const connected = await getUserComposioIntegrations(userId);
  const connectedAppNames = new Set(connected.map((i) => i.appName));

  return {
    available: allApps.filter((app) => !connectedAppNames.has(app)),
    connected: Array.from(connectedAppNames) as ComposioApp[],
  };
}
