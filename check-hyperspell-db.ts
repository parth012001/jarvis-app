import { db } from './src/lib/db';
import { users, integrations } from './src/lib/db/schema';
import { eq } from 'drizzle-orm';

async function checkHyperspellData() {
  // Find user
  const user = await db.query.users.findFirst({
    where: eq(users.email, 'ahiirparth@gmail.com'),
  });

  if (!user) {
    console.log('❌ User not found: ahiirparth@gmail.com');
    return;
  }

  console.log('✅ User found:', { id: user.id, email: user.email });

  // Find Hyperspell integration
  const hyperspellIntegration = await db.query.integrations.findFirst({
    where: eq(integrations.userId, user.id),
  });

  if (!hyperspellIntegration) {
    console.log('❌ No Hyperspell integration found');
    return;
  }

  console.log('\n📊 Hyperspell Integration:');
  console.log(JSON.stringify(hyperspellIntegration, null, 2));

  if (hyperspellIntegration.connectedAccountId) {
    console.log('\n🔗 Connected Account Data:');
    try {
      const parsed = JSON.parse(hyperspellIntegration.connectedAccountId);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('❌ Failed to parse:', hyperspellIntegration.connectedAccountId);
    }
  }
}

checkHyperspellData().then(() => process.exit(0));
