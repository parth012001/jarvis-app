import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function addCurrentUser() {
  const userId = 'user_35oxtja3RoxgYQKrOK0zBXNw7im';
  const email = 'parthahir012001@gmail.com'; // Update if different
  const firstName = 'Parth';
  const lastName = 'Ahir';

  try {
    // Check if user exists
    const existing = await sql`SELECT * FROM users WHERE id = ${userId}`;

    if (existing.length > 0) {
      console.log('✅ User already exists in database');
      return;
    }

    // Insert user
    await sql`
      INSERT INTO users (id, email, first_name, last_name, image_url, created_at, updated_at)
      VALUES (
        ${userId},
        ${email},
        ${firstName},
        ${lastName},
        NULL,
        NOW(),
        NOW()
      )
    `;

    console.log('✅ Successfully added user to database:');
    console.log(`   User ID: ${userId}`);
    console.log(`   Email: ${email}`);
    console.log('\n✅ You can now connect integrations!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

addCurrentUser();
