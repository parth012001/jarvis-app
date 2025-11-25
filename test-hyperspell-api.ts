import { getConnectedProviders } from './src/lib/hyperspell/client';

async function testHyperspellAPI() {
  const userId = 'user_35xvFw3JyN8JOjpJIuZDW24CEnZ';

  console.log('🧪 Testing Hyperspell auth.me() for user:', userId);

  try {
    const result = await getConnectedProviders(userId);
    console.log('\n✅ Success!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('\n❌ Error:', error);
  }
}

testHyperspellAPI().then(() => process.exit(0));
