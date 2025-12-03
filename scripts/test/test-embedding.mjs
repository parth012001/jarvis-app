/**
 * Test the embedding generation and storage flow
 * Run with: node scripts/test/test-embedding.mjs
 */
import { PgVector } from '@mastra/pg';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL;
const INDEX_NAME = 'email_embeddings';

if (!connectionString) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not set');
  process.exit(1);
}

console.log('🧪 Testing embedding flow...\n');

const pgVector = new PgVector({ connectionString });

try {
  // Step 1: Generate a test embedding
  console.log('1️⃣  Generating test embedding...');
  const testContent = `From: john@example.com
Subject: Project Update

Hi team, here's the weekly update on the project. We've made good progress on the frontend and the API is almost complete.`;

  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: testContent,
  });

  console.log(`   ✅ Generated embedding with ${embedding.length} dimensions`);

  // Step 2: Store in vector DB
  console.log('\n2️⃣  Storing embedding in vector DB...');
  const testId = `test-${Date.now()}`;

  await pgVector.upsert({
    indexName: INDEX_NAME,
    vectors: [embedding],
    metadata: [
      {
        emailId: testId,
        userId: 'test-user',
        messageId: 'test-message-id',
        from: 'john@example.com',
        subject: 'Project Update',
        snippet: testContent.substring(0, 200),
      },
    ],
  });

  console.log(`   ✅ Stored embedding with ID: ${testId}`);

  // Step 3: Query to verify
  console.log('\n3️⃣  Testing semantic search...');
  const queryText = 'project progress update';

  const { embedding: queryEmbedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: queryText,
  });

  const results = await pgVector.query({
    indexName: INDEX_NAME,
    queryVector: queryEmbedding,
    topK: 5,
    filter: { userId: 'test-user' },
    includeVector: false,
  });

  console.log(`   ✅ Query returned ${results.length} result(s)`);

  if (results.length > 0) {
    console.log('\n📋 Top result:');
    console.log(`   Score: ${results[0].score?.toFixed(4)}`);
    console.log(`   Subject: ${results[0].metadata?.subject}`);
    console.log(`   From: ${results[0].metadata?.from}`);
  }

  // Step 4: Clean up test data
  console.log('\n4️⃣  Cleaning up test data...');
  await pgVector.deleteVector({
    indexName: INDEX_NAME,
    id: testId,
  });
  console.log('   ✅ Test data cleaned up');

  console.log('\n✅ All tests passed! Embedding flow is working.\n');
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error);
  process.exit(1);
} finally {
  await pgVector.disconnect();
}
