import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';

/**
 * Composio Client Configuration
 *
 * Uses the new @composio/core SDK with MastraProvider for proper API compatibility.
 * This replaces the deprecated @mastra/composio package.
 */

// Singleton Composio client with MastraProvider
let composioClient: Composio<MastraProvider> | null = null;

/**
 * Gets or creates the Composio client with MastraProvider
 */
function getComposioClient(): Composio<MastraProvider> {
  if (!composioClient) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
      throw new Error('COMPOSIO_API_KEY environment variable is not set');
    }

    composioClient = new Composio({
      apiKey,
      provider: new MastraProvider(),
    });
  }
  return composioClient;
}

/**
 * Gets Composio tools for specific toolkits using a connected account
 * Uses the new @composio/core SDK with MastraProvider
 *
 * @param connectedAccountId - The Composio connected account ID
 * @param toolkits - Array of toolkit names (e.g., ['gmail', 'googlecalendar']) - lowercase!
 * @param entityId - Optional entity ID (userId) - not used in new SDK but kept for API compatibility
 * @returns Tools object formatted for Mastra agents
 *
 * @example
 * ```typescript
 * const tools = await getComposioTools('conn_abc123', ['gmail', 'googlecalendar'], 'user_123');
 * const agent = new Agent({ tools, ... });
 * ```
 */
export async function getComposioTools(
  connectedAccountId: string,
  toolkits: string[],
  entityId?: string
) {
  const composio = getComposioClient();

  // The new SDK expects uppercase toolkit names
  const normalizedToolkits = toolkits.map(t => t.toUpperCase());

  console.log('[Composio] Getting tools:', {
    connectedAccountId,
    entityId,
    toolkits: normalizedToolkits,
  });

  try {
    // Get tools using the new SDK - userId is required, toolkits filter the tools
    // The entityId (userId) is used to scope tools to that user's connected accounts
    const userId = entityId || connectedAccountId;
    const tools = await composio.tools.get(userId, {
      toolkits: normalizedToolkits,
    });

    console.log(`[Composio] Loaded ${Object.keys(tools).length} tools for ${normalizedToolkits.join(', ')}`);

    return tools;
  } catch (error: any) {
    console.error('[Composio] Failed to get tools:', {
      error: error?.message,
      code: error?.code,
      statusCode: error?.statusCode,
    });
    throw new Error(`Failed to get Composio tools for toolkits: ${normalizedToolkits.join(', ')}: ${error?.message}`);
  }
}

/**
 * Gets specific Composio tools by their action slugs
 *
 * Use this when you need specific actions that aren't included in the default toolkit.
 * For example, GMAIL_SEND_EMAIL is not included in the GMAIL toolkit by default.
 *
 * @param entityId - The user ID (entity ID in Composio)
 * @param toolSlugs - Array of specific tool slugs (e.g., ['GMAIL_SEND_EMAIL', 'GMAIL_REPLY_TO_THREAD'])
 * @returns Tools object formatted for Mastra agents
 *
 * @example
 * ```typescript
 * const sendTools = await getComposioToolsBySlug('user_123', ['GMAIL_SEND_EMAIL', 'GMAIL_REPLY_TO_THREAD']);
 * ```
 */
export async function getComposioToolsBySlug(
  entityId: string,
  toolSlugs: string[]
): Promise<Record<string, unknown>> {
  const composio = getComposioClient();

  console.log('[Composio] Getting specific tools by slug:', {
    entityId,
    toolSlugs,
  });

  const allTools: Record<string, unknown> = {};

  for (const slug of toolSlugs) {
    try {
      // Fetch each tool individually by its slug
      const tool = await composio.tools.get(entityId, slug);

      if (tool && typeof tool === 'object') {
        // The SDK returns a single tool object keyed by the tool name
        Object.assign(allTools, tool);
        console.log(`[Composio] Loaded tool: ${slug}`);
      }
    } catch (error: any) {
      // Log but don't fail - some tools might not be available
      console.warn(`[Composio] Failed to load tool ${slug}:`, error?.message);
    }
  }

  console.log(`[Composio] Loaded ${Object.keys(allTools).length}/${toolSlugs.length} specific tools`);

  return allTools;
}

/**
 * Essential Gmail action tools that are NOT included in the default GMAIL toolkit
 * These must be explicitly requested when sending/replying to emails
 */
export const GMAIL_ACTION_TOOLS = [
  'GMAIL_SEND_EMAIL',
  'GMAIL_REPLY_TO_THREAD',
] as const;

/**
 * Supported Composio apps for Jarvis
 * Add more as needed
 */
export const COMPOSIO_APPS = {
  GMAIL: 'gmail',
  GOOGLE_CALENDAR: 'googlecalendar',
  SLACK: 'slack',
  NOTION: 'notion',
  GITHUB: 'github',
} as const;

export type ComposioApp = typeof COMPOSIO_APPS[keyof typeof COMPOSIO_APPS];

/**
 * Maps friendly app names to Composio SDK app identifiers
 */
export function getComposioAppId(app: ComposioApp): string {
  const appMap: Record<ComposioApp, string> = {
    gmail: 'GMAIL',
    googlecalendar: 'GOOGLECALENDAR',
    slack: 'SLACK',
    notion: 'NOTION',
    github: 'GITHUB',
  };

  return appMap[app];
}

// Note: getComposioClient() is defined at the top of this file

/**
 * Auth Config IDs for each Composio integration
 *
 * These must be configured in .env.local:
 * - COMPOSIO_GMAIL_AUTH_CONFIG_ID
 * - COMPOSIO_CALENDAR_AUTH_CONFIG_ID
 * - COMPOSIO_SLACK_AUTH_CONFIG_ID
 * - COMPOSIO_NOTION_AUTH_CONFIG_ID
 * - COMPOSIO_GITHUB_AUTH_CONFIG_ID
 *
 * Get these IDs from Composio dashboard after creating auth configs
 */
const AUTH_CONFIG_IDS: Record<string, string | undefined> = {
  gmail: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
  googlecalendar: process.env.COMPOSIO_CALENDAR_AUTH_CONFIG_ID,
  slack: process.env.COMPOSIO_SLACK_AUTH_CONFIG_ID,
  notion: process.env.COMPOSIO_NOTION_AUTH_CONFIG_ID,
  github: process.env.COMPOSIO_GITHUB_AUTH_CONFIG_ID,
};

/**
 * Wait for a Composio connection to complete
 *
 * Polls Composio API until the connection status becomes ACTIVE, FAILED, or times out.
 * This replaces the need for OAuth callback handling for connection status.
 *
 * @param connectionId - The connection ID from initiateComposioConnection
 * @param timeoutMs - Timeout in milliseconds (default: 120000 = 2 minutes)
 * @returns Connected account object with id, status, toolkit, etc.
 * @throws {Error} If connection times out or fails
 *
 * @example
 * ```typescript
 * try {
 *   const account = await waitForComposioConnection('conn_abc123', 120000);
 *   console.log('Connected!', account.id, account.status);
 * } catch (error) {
 *   console.error('Connection failed:', error);
 * }
 * ```
 */
export async function waitForComposioConnection(
  connectionId: string,
  timeoutMs: number = 120000
) {
  const composio = getComposioClient();

  try {
    console.log(`[Composio] Waiting for connection ${connectionId} (timeout: ${timeoutMs}ms)`);

    const connectedAccount = await composio.connectedAccounts.waitForConnection(
      connectionId,
      timeoutMs
    );

    console.log(`[Composio] Connection completed:`, {
      id: connectedAccount.id,
      status: connectedAccount.status,
      toolkit: connectedAccount.toolkit?.slug,
      statusReason: connectedAccount.statusReason,
    });

    return connectedAccount;
  } catch (error) {
    console.error('[Composio] waitForConnection failed:', error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        throw new Error('Connection timed out. Please try again.');
      }
      throw new Error(`Connection failed: ${error.message}`);
    }

    throw new Error('Connection failed due to an unknown error.');
  }
}

/**
 * Initiate OAuth connection for a user via Composio SDK
 *
 * This function intelligently handles connection resumption:
 * 1. First checks if a pending/initiated connection already exists
 * 2. If found, returns the existing connection's redirect URL to resume the flow
 * 3. If not found, creates a new connection
 *
 * @param userId - Your internal user ID (becomes Composio entity ID)
 * @param app - App to connect (gmail, googlecalendar, slack, notion, github)
 * @param redirectUrl - Your callback URL (with state parameter for identifying the user)
 * @returns Object with redirectUrl to send user to and connectionId
 *
 * @example
 * ```typescript
 * const { redirectUrl } = await initiateComposioConnection(
 *   'user_123',
 *   'gmail',
 *   'http://localhost:3000/api/integrations/composio/callback?state=...'
 * );
 * // Redirect user to redirectUrl
 * ```
 */
export async function initiateComposioConnection(
  userId: string,
  app: string,
  redirectUrl: string
) {
  const composio = getComposioClient();

  // Get auth config ID for the app
  const authConfigId = AUTH_CONFIG_IDS[app.toLowerCase()];
  if (!authConfigId) {
    throw new Error(`No auth config ID found for app: ${app}. Please add it to AUTH_CONFIG_IDS or environment variables.`);
  }

  try {
    console.log(`[Composio] Checking for existing connections for user ${userId}, app ${app}`);

    // First, check if there's already a pending/initiated connection for this user + auth config
    const existingAccounts = await composio.connectedAccounts.list({
      userIds: [userId],
    });

    // Filter for connections matching this auth config that are INITIATED or PENDING
    // Note: authConfig is an object with an 'id' property, not a string
    const pendingConnection = existingAccounts.items?.find((account: any) => {
      const matchesAuthConfig = account.authConfig?.id === authConfigId;
      const matchesStatus = account.status === 'INITIATED' || account.status === 'PENDING';
      return matchesAuthConfig && matchesStatus;
    });

    if (pendingConnection) {
      console.log(`[Composio] Found existing pending connection:`, {
        id: pendingConnection.id,
        status: pendingConnection.status,
        authConfigId: pendingConnection.authConfig?.id,
        createdAt: pendingConnection.createdAt,
      });

      // Check if the connection is stale (older than 30 minutes)
      const connectionAge = Date.now() - new Date(pendingConnection.createdAt).getTime();
      const MAX_CONNECTION_AGE = 30 * 60 * 1000; // 30 minutes

      if (connectionAge > MAX_CONNECTION_AGE) {
        console.log(`[Composio] Connection is stale (${Math.round(connectionAge / 1000 / 60)} minutes old), deleting and recreating...`);

        try {
          // Delete the stale connection
          await composio.connectedAccounts.delete(pendingConnection.id);
          console.log(`[Composio] Deleted stale connection:`, pendingConnection.id);

          // Fall through to create a new connection below
        } catch (deleteError) {
          console.error('[Composio] Failed to delete stale connection:', deleteError);
          // Continue anyway to try creating a new connection
        }
      } else {
        // Connection is fresh, reuse existing connection ID
        // We'll need to generate a new redirect URL for this connection
        console.log(`[Composio] Resuming fresh connection:`, pendingConnection.id);

        // Generate new OAuth URL for the existing connection
        const connection = await composio.connectedAccounts.initiate(
          userId,
          authConfigId,
          {
            callbackUrl: redirectUrl,
          }
        );

        return {
          redirectUrl: connection.redirectUrl,
          connectionId: pendingConnection.id, // Use existing connection ID
        };
      }
    }

    console.log(`[Composio] No pending connection found, creating new connection for user ${userId}, app ${app}, authConfig ${authConfigId}`);

    // No pending connection found, create a new one
    // Parameters: entityId, authConfigId, options
    const connection = await composio.connectedAccounts.initiate(
      userId,        // Entity ID = your user ID
      authConfigId,  // Auth config ID from dashboard
      {
        callbackUrl: redirectUrl,  // Callback URL
      }
    );

    // The connection object returned has the OAuth URL and connection details
    const connectionId = (connection as any).connectionRequest?.id || (connection as any).id || 'unknown';

    console.log(`[Composio] Connection initiated:`, {
      connectionId,
      redirectUrl: connection.redirectUrl,
    });

    return {
      redirectUrl: connection.redirectUrl,
      connectionId,
    };
  } catch (error) {
    console.error('[Composio] Connection initiation failed:', error);
    throw new Error(`Failed to initiate Composio connection for ${app}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
