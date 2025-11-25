import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function checkUsers() {
  try {
    const users = await sql`SELECT id, email, first_name, last_name FROM users`;

    console.log('\n📊 Users in database:');
    users.forEach(u => {
      console.log(`  - ${u.id} (${u.email})`);
    });

    console.log('\n🔍 User from error log:');
    console.log('  - user_35oxtja3RoxgYQKrOK0zBXNw7im (NOT IN DATABASE)');

    console.log('\n❌ PROBLEM: You are logged in as a different Clerk user than the one in the database!');
    console.log('\nSOLUTION: The Clerk webhook needs to run to sync the current user to the database.');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkUsers();
