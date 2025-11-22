import { db } from './index';
import { users, integrations } from './schema';
import { sql } from 'drizzle-orm';

async function testConnection() {
  try {
    console.log('🔍 Testing database connection...\n');

    // Test 1: Simple query
    const result = await db.execute(sql`SELECT current_database(), current_user`);
    console.log('✅ Database connection successful!');
    console.log('Database:', result.rows[0]);

    // Test 2: Check if tables exist
    console.log('\n🔍 Checking tables...');

    const tableCheck = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'integrations')
      ORDER BY table_name
    `);

    console.log('✅ Tables found:', tableCheck.rows.map((r: any) => r.table_name));

    // Test 3: Check table structures
    console.log('\n🔍 Checking table columns...');

    const usersColumns = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Users table columns:');
    usersColumns.rows.forEach((col: any) => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    const integrationsColumns = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'integrations'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Integrations table columns:');
    integrationsColumns.rows.forEach((col: any) => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    console.log('\n✅ All checks passed! Database is ready.\n');
  } catch (error) {
    console.error('❌ Database test failed:', error);
    process.exit(1);
  }
}

testConnection();
