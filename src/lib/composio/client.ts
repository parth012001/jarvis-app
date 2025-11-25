import { ComposioIntegration } from '@mastra/composio';
import { Composio } from '@composio/core';

/**
 * Composio Client Configuration
 *
 * Creates user-specific Composio integrations for accessing connected apps
 * Each user's connectedAccountId is stored in the database per app
 */

/**
 * Creates a Composio integration instance for a specific user and connected account
 *
 * @param connectedAccountId - The Composio connected account ID from database
 * @param entityId - Optional entity ID (defaults to connectedAccountId)
 * @returns ComposioIntegration instance
 *
 * @example
 * ```typescript
 * const composio = createComposioClient('conn_abc123', 'user_123');
 * const tools = await composio.getTools({ apps: ['GMAIL'] });
 * ```
 */
export function createComposioClient(
  connectedAccountId: string,
  entityId?: string
): ComposioIntegration {
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY environment variable is not set');
  }

  return new ComposioIntegration({
    config: {
      API_KEY: apiKey,
      connectedAccountId,
      entityId: entityId || connectedAccountId,
    },
  });
}

/**
 * Gets Composio tools for specific apps using a connected account
 *
 * @param connectedAccountId - The Composio connected account ID
 * @param apps - Array of app names (e.g., ['GMAIL', 'GOOGLECALENDAR'])
 * @param entityId - Optional entity ID
 * @returns Tools object from Composio
 *
 * @example
 * ```typescript
 * const tools = await getComposioTools('conn_abc123', ['GMAIL', 'GOOGLECALENDAR']);
 * // Use with Mastra agent
 * const agent = new Agent({ tools, ... });
 * ```
 */
export async function getComposioTools(
  connectedAccountId: string,
  apps: string[],
  entityId?: string
) {
  const composio = createComposioClient(connectedAccountId, entityId);

  try {
    const tools = await composio.getTools({ apps });
    return tools;
  } catch (error) {
    console.error('[Composio] Failed to get tools:', error);
    throw new Error(`Failed to get Composio tools for apps: ${apps.join(', ')}`);
  }
}

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

/**
 * Initialize Composio client for OAuth connection management
 * Separate from ComposioIntegration which is used for tool execution
 */
function getComposioClient() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY environment variable is not set');
  }
  return new Composio({ apiKey });
}

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
