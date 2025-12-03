/**
 * Create the email_embeddings vector index
 * Run with: node scripts/test/create-email-index.mjs
 *
 * This creates a Mastra-managed vector table for storing email embeddings.
 * The table will store:
 * - embedding vector (1536 dimensions for text-embedding-3-small)
 * - metadata (emailId, userId, from, subject, etc.)
 */
import { PgVector } from '@mastra/pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const INDEX_NAME = 'email_embeddings';
const DIMENSION = 1536; // text-embedding-3-small output dimension

console.log('🔌 Connecting to PgVector...');
const pgVector = new PgVector({ connectionString });

try {
  // Check if index already exists
  console.log('\n📋 Checking existing indexes...');
  const indexes = await pgVector.listIndexes();

  if (indexes.includes(INDEX_NAME)) {
    console.log(`⚠️  Index "${INDEX_NAME}" already exists`);
    console.log('To recreate, drop it first in Neon console:');
    console.log(`  DROP TABLE IF EXISTS "${INDEX_NAME}";`);
  } else {
    // Create the index
    console.log(`\n🔨 Creating index "${INDEX_NAME}"...`);
    await pgVector.createIndex({
      indexName: INDEX_NAME,
      dimension: DIMENSION,
      metric: 'cosine',
    });
    console.log(`✅ Index "${INDEX_NAME}" created successfully`);
  }

  // Verify
  console.log('\n📋 Verifying indexes...');
  const updatedIndexes = await pgVector.listIndexes();
  console.log('Current indexes:', updatedIndexes);

  console.log('\n✅ Done!\n');
} catch (error) {
  console.error('\n❌ Failed:', error.message);
  process.exit(1);
} finally {
  await pgVector.disconnect();
}
