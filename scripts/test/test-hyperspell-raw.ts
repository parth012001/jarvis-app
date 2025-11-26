import { getHyperspellClient } from './src/lib/hyperspell/client';

async function testRawAPI() {
  const userId = 'user_35xvFw3JyN8JOjpJIuZDW24CEnZ';
  const hyperspell = getHyperspellClient(userId);

  console.log('🧪 Testing RAW auth.me() response\n');

  const userData = await hyperspell.auth.me();

  console.log('Full response:');
  console.log(JSON.stringify(userData, null, 2));

  console.log('\n📋 Fields present:');
  console.log('- connections:', userData.connections ? `YES (${userData.connections.length} items)` : 'NO');
  console.log('- installed_integrations:', userData.installed_integrations ? `YES (${userData.installed_integrations.length} items)` : 'NO');
  console.log('- available_integrations:', userData.available_integrations ? `YES (${userData.available_integrations.length} items)` : 'NO');
}

testRawAPI().then(() => process.exit(0));
