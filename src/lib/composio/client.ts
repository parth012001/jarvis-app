import { ComposioIntegration } from '@mastra/composio';

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
