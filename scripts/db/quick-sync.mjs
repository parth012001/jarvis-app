import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Quick sync for current user
const userId = 'user_35txXrDN2QSfUiVyUwBR5MIslo5';
const email = 'parthahir012001@gmail.com';

console.log('🔄 Syncing user...');

await sql`
  INSERT INTO users (id, email, created_at, updated_at)
  VALUES (${userId}, ${email}, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING
`;

const users = await sql`SELECT * FROM users`;
console.log('\n✅ Database now has:', users.length, 'user(s)');
console.table(users);
