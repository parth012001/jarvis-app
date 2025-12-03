/**
 * Test script to verify PgVector connection and basic operations
 * Run with: node scripts/test/test-pgvector.mjs
 */
import { PgVector } from '@mastra/pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

console.log('🔌 Connecting to PgVector...');

const pgVector = new PgVector({ connectionString });

try {
  // Test 1: Check if we can list indexes (verifies connection)
  console.log('\n📋 Listing existing vector indexes...');
  const indexes = await pgVector.listIndexes();
  console.log('Existing indexes:', indexes.length > 0 ? indexes : '(none)');

  // Test 2: Check pgvector extension is enabled
  console.log('\n🔍 Checking pgvector extension...');
  const result = await pgVector.pool.query(
    "SELECT extname FROM pg_extension WHERE extname = 'vector'"
  );
  if (result.rows.length > 0) {
    console.log('✅ pgvector extension is enabled');
  } else {
    console.log('❌ pgvector extension NOT found - run: CREATE EXTENSION vector;');
  }

  console.log('\n✅ PgVector connection successful!\n');
} catch (error) {
  console.error('\n❌ PgVector test failed:', error.message);
  process.exit(1);
} finally {
  await pgVector.disconnect();
}
