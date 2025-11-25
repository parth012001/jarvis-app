import { neon } from '@neondatabase/serverless';
import { clerkClient } from '@clerk/nextjs/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function syncClerkUserToDb() {
  console.log('\n🔍 Fetching user from Clerk...');

  try {
    // Get the current user from Clerk by email
    const email = 'parthahir012001@gmail.com';
    const clerk = await clerkClient();
    const usersResponse = await clerk.users.getUserList({ emailAddress: [email] });

    if (!usersResponse.data || usersResponse.data.length === 0) {
      console.error('❌ User not found in Clerk');
      return;
    }

    const user = usersResponse.data[0];
    console.log(`✅ Found user in Clerk: ${user.id}`);

    // Insert into database
    await sql`
      INSERT INTO users (id, email, first_name, last_name, image_url, created_at, updated_at)
      VALUES (
        ${user.id},
        ${user.emailAddresses[0].emailAddress},
        ${user.firstName},
        ${user.lastName},
        ${user.imageUrl},
        NOW(),
        NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        email = ${user.emailAddresses[0].emailAddress},
        first_name = ${user.firstName},
        last_name = ${user.lastName},
        image_url = ${user.imageUrl},
        updated_at = NOW()
    `;

    console.log('✅ User synced to database!');

    // Verify
    const dbUsers = await sql`SELECT * FROM users WHERE email = ${email}`;
    console.log('\n📊 User in database:');
    console.table(dbUsers);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

syncClerkUserToDb();
