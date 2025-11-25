import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { db } from '@/lib/db';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getComposioTools, getComposioAppId, type ComposioApp } from '../composio/client';
import { hyperspellSearchTool } from './tools/hyperspell';

/**
 * Mastra Agent Factory
 *
 * Creates user-specific Mastra agents with their connected tools:
 * - Composio tools for actions (send emails, create events, etc.)
 * - Hyperspell tool for RAG search across user's historical data
 *
 * Each agent is dynamically created with tools based on user's connections
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

/**
 * Checks if user has Hyperspell connected
 *
 * @param userId - Clerk user ID
 * @returns True if Hyperspell is connected, false otherwise
 */
export async function isHyperspellConnected(userId: string): Promise<boolean> {
  const hyperspellIntegration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.userId, userId),
      eq(integrations.provider, 'hyperspell'),
      eq(integrations.status, 'connected')
    ),
  });

  return !!hyperspellIntegration;
}

/**
 * Creates a Mastra agent with user-specific Composio tools
 *
 * @param userId - Clerk user ID
 * @param options - Agent configuration options
 * @returns Configured Mastra Agent instance
 *
 * @example
 * ```typescript
 * const agent = await createUserAgent('user_123', {
 *   name: 'My Assistant',
 *   instructions: 'You are a helpful assistant',
 * });
 *
 * const response = await agent.generate('Check my emails');
 * ```
 */
export async function createUserAgent(
  userId: string,
  options: {
    name?: string;
    instructions?: string;
    model?: unknown;
  } = {}
) {
  // Get user's connected integrations
  const connectedIntegrations = await getUserComposioIntegrations(userId);
  const hasHyperspell = await isHyperspellConnected(userId);

  // Build tools from all connected integrations
  let tools: Record<string, unknown> = {};

  // 1. Load Composio tools (actions)
  if (connectedIntegrations.length > 0) {
    // Group by connectedAccountId (some apps might share the same account)
    const accountGroups = new Map<string, ComposioApp[]>();

    for (const integration of connectedIntegrations) {
      const accountId = integration.connectedAccountId!;
      const appName = integration.appName as ComposioApp;

      if (!accountGroups.has(accountId)) {
        accountGroups.set(accountId, []);
      }
      accountGroups.get(accountId)!.push(appName);
    }

    // Fetch tools for each connected account
    for (const [accountId, apps] of accountGroups) {
      try {
        const appIds = apps.map(getComposioAppId);
        const accountTools = await getComposioTools(accountId, appIds, userId);

        // Merge tools
        tools = { ...tools, ...accountTools };

        console.log(`[Agent Factory] Loaded Composio tools for ${apps.join(', ')} (account: ${accountId})`);
      } catch (error) {
        console.error(`[Agent Factory] Failed to load tools for account ${accountId}:`, error);
        // Continue with other accounts even if one fails
      }
    }
  }

  // 2. Add Hyperspell tool if connected (memory/RAG search)
  if (hasHyperspell) {
    tools.hyperspellSearchTool = hyperspellSearchTool;
    console.log('[Agent Factory] Added Hyperspell search tool');
  }

  // Build instructions based on available capabilities
  const capabilities = [];
  if (connectedIntegrations.length > 0) {
    capabilities.push(`- Perform actions on ${connectedIntegrations.map((i) => i.appName).join(', ')}`);
  }
  if (hasHyperspell) {
    capabilities.push('- Search your historical data from Gmail, Calendar, Slack, and Notion');
  }
  capabilities.push('- Answer questions and help with general tasks');

  // Create agent with user-specific tools
  const agent = new Agent({
    name: options.name || 'Jarvis Assistant',
    instructions:
      options.instructions ||
      `You are Jarvis, an AI assistant with access to the user's connected applications.

${capabilities.length > 0 ? `Capabilities:\n${capabilities.join('\n')}` : 'The user has not connected any applications yet.'}

${hasHyperspell ? `\nWhen users ask about past information, emails, meetings, or documents, use the hyperspell-search-memories tool to retrieve relevant context from their connected accounts.` : ''}

Always be helpful, professional, and respect the user's privacy.`,
    model: options.model || openai('gpt-4o'),
    tools,
  });

  console.log(`[Agent Factory] Created agent for user ${userId} with ${Object.keys(tools).length} tools (${connectedIntegrations.length} Composio + ${hasHyperspell ? '1 Hyperspell' : '0 Hyperspell'})`);

  return agent;
}

/**
 * Creates a lightweight agent instance for users with no connected integrations
 *
 * @returns Basic Mastra Agent without external tools
 */
export async function createBasicAgent() {
  return new Agent({
    name: 'Jarvis Assistant',
    instructions: `You are Jarvis, an AI assistant.

    The user hasn't connected any external applications yet, but you can still:
    - Answer questions
    - Provide information
    - Help with general tasks

    Suggest connecting apps like Gmail, Calendar, or Slack to unlock more capabilities.`,
    model: openai('gpt-4o'),
    tools: {}, // No external tools
  });
}

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
