import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';

/**
 * Composio Trigger Management
 *
 * Handles creation and deletion of Gmail triggers for the email draft system.
 * Each user gets their own trigger that fires when new emails arrive.
 *
 * IMPORTANT: Webhook URL must be configured in Composio dashboard:
 * https://app.composio.dev → Project Settings → Triggers → Set Webhook URL
 * Set it to: https://your-domain.com/api/webhooks/composio
 */

// Singleton Composio client (same pattern as client.ts)
let composioClient: Composio<MastraProvider> | null = null;

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
 * Create a Gmail new message trigger for a user
 *
 * When emails arrive in the user's inbox, Composio will send a webhook
 * to the configured callback URL in your Composio dashboard.
 *
 * @param userId - Internal user ID (Clerk ID)
 * @param connectedAccountId - Composio connected account ID for Gmail
 * @returns Object with triggerId
 */
export async function createGmailTrigger(
  userId: string,
  connectedAccountId: string
): Promise<{ triggerId: string }> {
  const composio = getComposioClient();

  console.log(`[Composio Triggers] Creating Gmail trigger for user ${userId}`);

  try {
    // SDK uses camelCase for parameters
    const response = await composio.triggers.create(userId, 'GMAIL_NEW_GMAIL_MESSAGE', {
      connectedAccountId,
      triggerConfig: {
        labelIds: 'INBOX',
        userId: 'me',
        interval: 60, // Check every 60 seconds
      },
    });

    // Response type is { triggerId: string }
    const triggerId = response.triggerId;

    console.log(`[Composio Triggers] Gmail trigger created:`, {
      triggerId,
      userId,
      connectedAccountId,
    });

    return { triggerId };
  } catch (error: any) {
    console.error('[Composio Triggers] Failed to create trigger:', {
      error: error?.message,
      code: error?.code,
      userId,
    });

    // Check for duplicate trigger error
    if (error?.message?.includes('already exists') || error?.code === 'TRIGGER_EXISTS') {
      throw new Error('A Gmail trigger already exists for this user');
    }

    throw new Error(`Failed to create Gmail trigger: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Delete a Gmail trigger
 *
 * @param triggerId - The Composio trigger ID to delete
 */
export async function deleteGmailTrigger(triggerId: string): Promise<void> {
  const composio = getComposioClient();

  console.log(`[Composio Triggers] Deleting trigger: ${triggerId}`);

  try {
    await composio.triggers.delete(triggerId);
    console.log(`[Composio Triggers] Trigger deleted successfully: ${triggerId}`);
  } catch (error: any) {
    console.error('[Composio Triggers] Failed to delete trigger:', {
      error: error?.message,
      triggerId,
    });

    // If trigger doesn't exist, don't throw
    if (error?.message?.includes('not found') || error?.code === 'NOT_FOUND') {
      console.log(`[Composio Triggers] Trigger already deleted or not found: ${triggerId}`);
      return;
    }

    throw new Error(`Failed to delete Gmail trigger: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Enable a disabled trigger
 *
 * @param triggerId - The Composio trigger ID to enable
 */
export async function enableGmailTrigger(triggerId: string): Promise<void> {
  const composio = getComposioClient();

  console.log(`[Composio Triggers] Enabling trigger: ${triggerId}`);

  try {
    await composio.triggers.enable(triggerId);
    console.log(`[Composio Triggers] Trigger enabled successfully: ${triggerId}`);
  } catch (error: any) {
    console.error('[Composio Triggers] Failed to enable trigger:', {
      error: error?.message,
      triggerId,
    });
    throw new Error(`Failed to enable Gmail trigger: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Disable a trigger without deleting it
 *
 * @param triggerId - The Composio trigger ID to disable
 */
export async function disableGmailTrigger(triggerId: string): Promise<void> {
  const composio = getComposioClient();

  console.log(`[Composio Triggers] Disabling trigger: ${triggerId}`);

  try {
    await composio.triggers.disable(triggerId);
    console.log(`[Composio Triggers] Trigger disabled successfully: ${triggerId}`);
  } catch (error: any) {
    console.error('[Composio Triggers] Failed to disable trigger:', {
      error: error?.message,
      triggerId,
    });
    throw new Error(`Failed to disable Gmail trigger: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * List all active triggers for a user
 *
 * @param connectedAccountId - Optional filter by connected account
 * @returns List of active triggers
 */
export async function listActiveTriggers(connectedAccountId?: string) {
  const composio = getComposioClient();

  try {
    const response = await composio.triggers.listActive({
      connectedAccountIds: connectedAccountId ? [connectedAccountId] : undefined,
    });

    return response.items;
  } catch (error: any) {
    console.error('[Composio Triggers] Failed to list triggers:', {
      error: error?.message,
    });
    return [];
  }
}
