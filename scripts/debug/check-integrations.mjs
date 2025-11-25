import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function checkIntegrations() {
  try {
    const integrations = await sql`SELECT * FROM integrations ORDER BY created_at DESC`;

    console.log('\n📊 Integrations in database:');
    console.table(integrations.map(i => ({
      id: i.id.substring(0, 8) + '...',
      user_id: i.user_id.substring(0, 20) + '...',
      provider: i.provider,
      app_name: i.app_name,
      status: i.status,
      connected_account_id: i.connected_account_id,
      created_at: i.created_at
    })));

    console.log(`\n✅ Total integrations: ${integrations.length}\n`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkIntegrations();
