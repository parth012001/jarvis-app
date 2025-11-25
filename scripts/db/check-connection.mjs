import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

const users = await sql`SELECT * FROM users`;

console.log('\n📊 Users in database:');
console.table(users);
console.log(`\n✅ Total users: ${users.length}\n`);
