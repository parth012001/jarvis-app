import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { db } from '@/lib/db';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getComposioTools, getComposioToolsBySlug, getComposioAppId, GMAIL_ACTION_TOOLS, type ComposioApp } from '../composio/client';

/**
 * Mastra Agent Factory
 *
 * Creates user-specific Mastra agents with their connected Composio tools
 * for actions (send emails, create events, etc.)
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
    model?: any;
  } = {}
) {
  // Get user's connected integrations
  const connectedIntegrations = await getUserComposioIntegrations(userId);

  // Build tools from all connected integrations
  let tools: Record<string, unknown> = {};

  // DEBUG: Log tool loading
  console.log(`[Agent Factory] Loading tools for user ${userId}...`);

  // Load Composio tools (actions)
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

        const toolNames = Object.keys(accountTools);
        console.log(`[Agent Factory] Loaded ${toolNames.length} Composio tools for ${apps.join(', ')} (account: ${accountId})`);

        // If Gmail is connected, also load the action tools (SEND_EMAIL, REPLY_TO_THREAD)
        // These are NOT included in the default GMAIL toolkit
        if (apps.includes('gmail')) {
          try {
            const gmailActionTools = await getComposioToolsBySlug(userId, [...GMAIL_ACTION_TOOLS]);
            tools = { ...tools, ...gmailActionTools };
            console.log(`[Agent Factory] Loaded ${Object.keys(gmailActionTools).length} Gmail action tools (send/reply)`);
          } catch (gmailError) {
            console.warn(`[Agent Factory] Failed to load Gmail action tools:`, gmailError);
          }
        }
      } catch (error) {
        // Log error but continue - don't break the agent if Composio fails
        console.error(`[Agent Factory] Failed to load Composio tools for ${apps.join(', ')}:`, error);
        console.log(`[Agent Factory] Continuing without Composio tools for this account`);
      }
    }
  }

  // Build instructions based on available capabilities
  const capabilities = [];
  if (connectedIntegrations.length > 0) {
    capabilities.push(`- Perform actions on ${connectedIntegrations.map((i) => i.appName).join(', ')}`);
  }
  capabilities.push('- Answer questions and help with general tasks');

  // Create agent with user-specific tools
  const agent = new Agent({
    name: options.name || 'Jarvis Assistant',
    instructions:
      options.instructions ||
      `You are Jarvis, an AI assistant with access to the user's connected applications.

${capabilities.length > 0 ? `Capabilities:\n${capabilities.join('\n')}` : 'The user has not connected any applications yet.'}

Always be helpful, professional, and respect the user's privacy.`,
    model: options.model || openai('gpt-4o'),
    tools,
  });

  console.log(`[Agent Factory] Created agent for user ${userId} with ${Object.keys(tools).length} Composio tools`);

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
