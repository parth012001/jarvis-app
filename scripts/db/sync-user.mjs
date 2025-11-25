import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Manually sync the current user
const userId = 'user_35txXrDN2QSfUiVyUwBR5MIslo5';
const email = 'parthahir012001@gmail.com';

console.log('\n🔄 Syncing user to database...');

try {
  await sql`
    INSERT INTO users (id, email, first_name, last_name, image_url, created_at, updated_at)
    VALUES (${userId}, ${email}, 'Parth', NULL, NULL, NOW(), NOW())
    ON CONFLICT (id)
    DO UPDATE SET
      email = ${email},
      updated_at = NOW()
  `;

  console.log('✅ User synced successfully!');

  // Verify
  const users = await sql`SELECT * FROM users WHERE id = ${userId}`;
  console.log('\n📊 User data:');
  console.table(users);
} catch (error) {
  console.error('❌ Error syncing user:', error);
}
