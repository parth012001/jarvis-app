import { db } from './src/lib/db/index.js';
import { integrations } from './src/lib/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getHyperspellClient } from './src/lib/hyperspell/client.js';

const userId = 'user_35yL92VUpIwu11ZeqpPrjrkRFrH'; // parthahir01062001@gmail.com

async function updateHyperspellStatus() {
  try {
    console.log(`🔍 Fetching connected integrations from Hyperspell for user: ${userId}`);

    // Get connected integrations from Hyperspell API
    const hyperspell = getHyperspellClient(userId);
    const connectedIntegrations = await hyperspell.integrations.list();

    console.log('📋 Connected Hyperspell integrations:', connectedIntegrations.integrations);

    // Extract provider names
    const connectedProviders = connectedIntegrations.integrations.map(i => i.provider);

    console.log(`✅ Found ${connectedProviders.length} connected providers:`, connectedProviders);

    // Find existing integration record
    const existingIntegration = await db.query.integrations.findFirst({
      where: and(
        eq(integrations.userId, userId),
        eq(integrations.provider, 'hyperspell')
      ),
    });

    if (!existingIntegration) {
      console.error('❌ No Hyperspell integration found in database');
      process.exit(1);
    }

    console.log('📝 Current status:', existingIntegration.status);

    // Update to connected status
    await db
      .update(integrations)
      .set({
        status: 'connected',
        connectedAccountId: JSON.stringify(connectedProviders),
        connectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, existingIntegration.id));

    console.log('✅ Successfully updated Hyperspell integration to connected!');
    console.log('📦 Connected providers stored:', connectedProviders);

  } catch (error) {
    console.error('❌ Error updating Hyperspell status:', error);
    process.exit(1);
  }
}

updateHyperspellStatus();
