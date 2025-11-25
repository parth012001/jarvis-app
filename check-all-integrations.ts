import { db } from './src/lib/db';
import { users, integrations } from './src/lib/db/schema';
import { eq } from 'drizzle-orm';

async function checkAllIntegrations() {
  const user = await db.query.users.findFirst({
    where: eq(users.email, 'ahiirparth@gmail.com'),
  });

  if (!user) {
    console.log('❌ User not found');
    return;
  }

  console.log('✅ User:', user.email, '(', user.id, ')');

  const allIntegrations = await db.query.integrations.findMany({
    where: eq(integrations.userId, user.id),
  });

  console.log('\n📊 ALL Integrations:', allIntegrations.length);
  allIntegrations.forEach((int, idx) => {
    console.log(`\n[${idx + 1}] ${int.provider}${int.appName ? ' - ' + int.appName : ''}`);
    console.log('   Status:', int.status);
    console.log('   Connected:', int.connectedAt || 'N/A');
    console.log('   Account ID:', int.connectedAccountId || 'N/A');
  });
}

checkAllIntegrations().then(() => process.exit(0));
