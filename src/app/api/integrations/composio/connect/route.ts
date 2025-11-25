import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { initiateComposioConnection } from '@/lib/composio/client';

/**
 * Composio OAuth Connect Endpoint
 *
 * Initiates OAuth flow for connecting a Composio app (Gmail, Calendar, Slack, etc.)
 * Query params:
 *   - app: The app to connect (gmail, googlecalendar, slack, etc.)
 *
 * Flow:
 * 1. Validate user authentication
 * 2. Validate app parameter
 * 3. Create/update pending integration record in database
 * 4. Generate Composio OAuth URL with redirect
 * 5. Redirect user to Composio OAuth page
 */

const SUPPORTED_APPS = ['gmail', 'googlecalendar', 'slack', 'notion', 'github'] as const;
type SupportedApp = typeof SUPPORTED_APPS[number];

function isSupportedApp(app: string): app is SupportedApp {
  return SUPPORTED_APPS.includes(app as SupportedApp);
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get app from query params
  const searchParams = request.nextUrl.searchParams;
  const app = searchParams.get('app');

  if (!app) {
    return Response.json(
      { error: 'Missing required parameter: app' },
      { status: 400 }
    );
  }

  if (!isSupportedApp(app)) {
    return Response.json(
      {
        error: 'Unsupported app',
        supportedApps: SUPPORTED_APPS,
      },
      { status: 400 }
    );
  }

  try {
    // Check if integration already exists for this user+app
    const existing = await db.query.integrations.findFirst({
      where: and(
        eq(integrations.userId, userId),
        eq(integrations.provider, 'composio'),
        eq(integrations.appName, app)
      ),
    });

    // Create or update to pending status
    if (existing) {
      await db
        .update(integrations)
        .set({
          status: 'pending',
          connectedAccountId: null, // Clear old connection
          connectedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, existing.id));

      console.log(`[Composio Connect] Updated existing integration for user ${userId}, app ${app}`);
    } else {
      await db.insert(integrations).values({
        userId,
        provider: 'composio',
        appName: app,
        status: 'pending',
      });

      console.log(`[Composio Connect] Created new integration for user ${userId}, app ${app}`);
    }

    // Generate Composio OAuth URL using SDK
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/composio/callback`;

    // Encode state to pass through OAuth flow
    const state = Buffer.from(
      JSON.stringify({
        userId,
        app,
        timestamp: Date.now(),
      })
    ).toString('base64url');

    // Include state in callback URL so we can identify the user after OAuth
    const callbackUrlWithState = `${callbackUrl}?state=${state}`;

    // Use Composio SDK to initiate connection
    // This handles entity creation and proper OAuth URL generation
    const { redirectUrl } = await initiateComposioConnection(
      userId,  // Entity ID = your Clerk user ID
      app,
      callbackUrlWithState
    );

    if (!redirectUrl) {
      throw new Error('Failed to get redirect URL from Composio');
    }

    console.log(`[Composio Connect] Redirecting to Composio OAuth: ${redirectUrl}`);

    // Redirect to Composio's OAuth URL
    return Response.redirect(redirectUrl);
  } catch (error) {
    console.error('[Composio Connect] Error:', error);
    return Response.json(
      {
        error: 'Failed to initiate connection',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
