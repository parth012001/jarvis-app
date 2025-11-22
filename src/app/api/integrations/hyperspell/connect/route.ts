import { auth } from '@clerk/nextjs/server';
import { getConnectUrl } from '@/lib/hyperspell/client';
import { db } from '@/lib/db';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Hyperspell OAuth connect endpoint
 * Generates OAuth URL and redirects user to Hyperspell
 */
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if integration already exists
    const existing = await db.query.integrations.findFirst({
      where: and(
        eq(integrations.userId, userId),
        eq(integrations.provider, 'hyperspell')
      ),
    });

    // Create or update to pending status
    if (existing) {
      await db
        .update(integrations)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(integrations.id, existing.id));
    } else {
      await db.insert(integrations).values({
        userId,
        provider: 'hyperspell',
        status: 'pending',
      });
    }

    // Generate Hyperspell OAuth URL
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/hyperspell/callback`;
    const connectUrl = await getConnectUrl(userId, callbackUrl);

    // Redirect to Hyperspell OAuth
    return Response.redirect(connectUrl);
  } catch (error) {
    console.error('[Hyperspell Connect] Error:', error);
    return Response.json(
      { error: 'Failed to generate connection URL' },
      { status: 500 }
    );
  }
}
