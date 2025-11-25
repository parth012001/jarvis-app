import { db } from '@/lib/db';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { NextRequest } from 'next/server';

/**
 * Composio OAuth Callback Endpoint
 *
 * Receives callback from Composio after user completes OAuth flow
 * Query params from Composio:
 *   - connectedAccountId: The unique ID for this connection
 *   - state: Our encoded state (userId, app, timestamp)
 *   - status: 'success' or 'failed'
 *
 * Flow:
 * 1. Decode and validate state
 * 2. Verify integration exists in pending state
 * 3. Update integration with connectedAccountId
 * 4. Redirect user back to dashboard/onboarding
 */

interface DecodedState {
  userId: string;
  app: string;
  timestamp: number;
}

function decodeState(state: string): DecodedState | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const connectedAccountId = searchParams.get('connectedAccountId');
  const state = searchParams.get('state');
  const status = searchParams.get('status');

  console.log('[Composio Callback] Received:', {
    connectedAccountId,
    state,
    status,
  });

  // Validate state
  if (!state) {
    console.error('[Composio Callback] Missing state parameter');
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?error=invalid_state`
    );
  }

  const decodedState = decodeState(state);
  if (!decodedState) {
    console.error('[Composio Callback] Failed to decode state');
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?error=invalid_state`
    );
  }

  const { userId, app } = decodedState;

  // Validate state age (30 minutes max)
  const stateAge = Date.now() - decodedState.timestamp;
  const MAX_STATE_AGE = 30 * 60 * 1000; // 30 minutes
  if (stateAge > MAX_STATE_AGE) {
    console.error('[Composio Callback] State expired');
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?error=state_expired`
    );
  }

  try {
    // Find the integration record
    const integration = await db.query.integrations.findFirst({
      where: and(
        eq(integrations.userId, userId),
        eq(integrations.provider, 'composio'),
        eq(integrations.appName, app)
      ),
    });

    if (!integration) {
      console.error('[Composio Callback] Integration not found');
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?error=not_found`
      );
    }

    // Update integration status based on callback
    if (status === 'success' && connectedAccountId) {
      await db
        .update(integrations)
        .set({
          connectedAccountId,
          status: 'connected',
          connectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, integration.id));

      console.log('[Composio Callback] Successfully connected:', {
        userId,
        app,
        connectedAccountId,
      });

      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?connected=composio_${app}`
      );
    } else {
      // Connection failed or was cancelled
      await db
        .update(integrations)
        .set({
          status: 'error',
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, integration.id));

      console.error('[Composio Callback] Connection failed:', {
        userId,
        app,
        status,
      });

      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?error=connection_failed&app=${app}`
      );
    }
  } catch (error) {
    console.error('[Composio Callback] Error:', error);
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?error=server_error`
    );
  }
}
