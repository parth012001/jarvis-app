import { getHyperspellClient } from './src/lib/hyperspell/client';

async function testForUser() {
  const userId = 'user_35xvFw3JyN8JOjpJIuZDW24CEnZ'; // ahiirparth@gmail.com

  console.log('🧪 Testing Hyperspell for ahiirparth@gmail.com');
  console.log('User ID:', userId);
  console.log();

  const hyperspell = getHyperspellClient(userId);
  const userData = await hyperspell.auth.me();

  console.log('✅ Response from Hyperspell:');
  console.log('   User ID:', userData.id);
  console.log('   App:', userData.app.name);
  console.log();
  console.log('📋 Available integrations (what CAN be connected):');
  userData.available_integrations.forEach(int => console.log('   -', int));
  console.log();
  console.log('✅ Installed integrations (what IS connected):');
  if (userData.installed_integrations.length > 0) {
    userData.installed_integrations.forEach(int => console.log('   ✓', int));
  } else {
    console.log('   (none)');
  }
}

testForUser().then(() => process.exit(0));
