import { db } from '@/lib/db';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Hyperspell OAuth callback endpoint
 * Receives callback from Hyperspell after user connects accounts
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const status = searchParams.get('status');

  console.log('[Hyperspell Callback] Received:', { userId, status });

  if (!userId) {
    console.error('[Hyperspell Callback] Missing userId');
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?error=missing_user`
    );
  }

  try {
    // Find the integration record
    const integration = await db.query.integrations.findFirst({
      where: and(
        eq(integrations.userId, userId),
        eq(integrations.provider, 'hyperspell')
      ),
    });

    if (!integration) {
      console.error('[Hyperspell Callback] Integration not found');
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?error=not_found`
      );
    }

    // Update integration status based on callback
    if (status === 'success') {
      await db
        .update(integrations)
        .set({
          status: 'connected',
          connectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, integration.id));

      console.log('[Hyperspell Callback] Successfully connected');

      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?connected=hyperspell`
      );
    } else {
      await db
        .update(integrations)
        .set({
          status: 'error',
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, integration.id));

      console.error('[Hyperspell Callback] Connection failed');

      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?error=connection_failed`
      );
    }
  } catch (error) {
    console.error('[Hyperspell Callback] Error:', error);
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/onboarding?error=server_error`
    );
  }
}
