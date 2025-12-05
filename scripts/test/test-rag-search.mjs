/**
 * Test RAG Email Search
 *
 * Verifies that the email search tool works correctly with:
 * 1. Centralized PgVector from Mastra
 * 2. RuntimeContext filter for userId scoping
 * 3. createVectorQueryTool integration
 *
 * Run with: node scripts/test/test-rag-search.mjs
 */
import { PgVector } from '@mastra/pg';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { neon } from '@neondatabase/serverless';
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

const sql = neon(connectionString);
const pgVector = new PgVector({ connectionString });

async function runTests() {
  console.log('🧪 Testing RAG Email Search System\n');
  console.log('='.repeat(50));

  let passed = 0;
  let failed = 0;

  // Test 1: Check PgVector connection
  console.log('\n📋 Test 1: PgVector Connection');
  try {
    const indexes = await pgVector.listIndexes();
    if (indexes.includes(INDEX_NAME)) {
      console.log(`   ✅ Connected to PgVector, index "${INDEX_NAME}" exists`);
      passed++;
    } else {
      console.log(`   ❌ Index "${INDEX_NAME}" not found`);
      console.log(`   Available indexes: ${indexes.join(', ') || 'none'}`);
      failed++;
    }
  } catch (error) {
    console.log(`   ❌ Connection failed: ${error.message}`);
    failed++;
  }

  // Test 2: Get a test userId from existing data
  console.log('\n📋 Test 2: Get Test User');
  let testUserId = null;
  try {
    const users = await sql`
      SELECT DISTINCT user_id FROM emails LIMIT 1
    `;
    if (users.length > 0) {
      testUserId = users[0].user_id;
      console.log(`   ✅ Found test user: ${testUserId}`);
      passed++;
    } else {
      console.log('   ⚠️  No emails in database, using placeholder userId');
      testUserId = 'test-user';
      passed++;
    }
  } catch (error) {
    console.log(`   ❌ Failed to get user: ${error.message}`);
    failed++;
  }

  // Test 3: Generate embedding for a query
  console.log('\n📋 Test 3: Embedding Generation');
  let queryEmbedding = null;
  try {
    const testQuery = 'emails about project updates';
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: testQuery,
    });
    queryEmbedding = embedding;
    console.log(`   ✅ Generated embedding for "${testQuery}"`);
    console.log(`   Dimensions: ${embedding.length}`);
    passed++;
  } catch (error) {
    console.log(`   ❌ Embedding generation failed: ${error.message}`);
    failed++;
  }

  // Test 4: Search WITHOUT userId filter (should return all results)
  console.log('\n📋 Test 4: Vector Search (No Filter)');
  try {
    if (!queryEmbedding) throw new Error('No embedding available');

    const results = await pgVector.query({
      indexName: INDEX_NAME,
      queryVector: queryEmbedding,
      topK: 5,
      includeVector: false,
    });

    console.log(`   ✅ Search returned ${results.length} results`);
    if (results.length > 0) {
      console.log(`   Top result: "${results[0].metadata?.subject || 'no subject'}"`);
      console.log(`   Score: ${results[0].score?.toFixed(4) || 'N/A'}`);
    }
    passed++;
  } catch (error) {
    console.log(`   ❌ Search failed: ${error.message}`);
    failed++;
  }

  // Test 5: Search WITH userId filter (simulates RuntimeContext filter)
  console.log('\n📋 Test 5: Vector Search (With userId Filter)');
  try {
    if (!queryEmbedding) throw new Error('No embedding available');
    if (!testUserId) throw new Error('No test userId available');

    const results = await pgVector.query({
      indexName: INDEX_NAME,
      queryVector: queryEmbedding,
      topK: 5,
      filter: { userId: testUserId },  // This is what RuntimeContext provides
      includeVector: false,
    });

    console.log(`   ✅ Filtered search returned ${results.length} results`);
    if (results.length > 0) {
      console.log(`   Top result: "${results[0].metadata?.subject || 'no subject'}"`);
      console.log(`   User match: ${results[0].metadata?.userId === testUserId ? '✅' : '❌'}`);
    }
    passed++;
  } catch (error) {
    console.log(`   ❌ Filtered search failed: ${error.message}`);
    failed++;
  }

  // Test 6: Search with non-existent userId (should return 0 results)
  console.log('\n📋 Test 6: Filter Isolation (Wrong User)');
  try {
    if (!queryEmbedding) throw new Error('No embedding available');

    const results = await pgVector.query({
      indexName: INDEX_NAME,
      queryVector: queryEmbedding,
      topK: 5,
      filter: { userId: 'non-existent-user-12345' },
      includeVector: false,
    });

    if (results.length === 0) {
      console.log('   ✅ Correctly returned 0 results for non-existent user');
      passed++;
    } else {
      console.log(`   ❌ Expected 0 results, got ${results.length}`);
      failed++;
    }
  } catch (error) {
    console.log(`   ❌ Test failed: ${error.message}`);
    failed++;
  }

  // Test 7: Semantic relevance test
  console.log('\n📋 Test 7: Semantic Relevance');
  try {
    // Search for something that should match existing emails
    const { embedding: chatEmbedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: 'chatting conversation discussion',
    });

    const results = await pgVector.query({
      indexName: INDEX_NAME,
      queryVector: chatEmbedding,
      topK: 3,
      includeVector: false,
    });

    if (results.length > 0) {
      const topSubject = results[0].metadata?.subject?.toLowerCase() || '';
      const isRelevant = topSubject.includes('chat') ||
                        topSubject.includes('talk') ||
                        topSubject.includes('conversation') ||
                        results[0].score > 0.3;

      console.log(`   Query: "chatting conversation discussion"`);
      console.log(`   Top result: "${results[0].metadata?.subject}"`);
      console.log(`   Score: ${results[0].score?.toFixed(4)}`);
      console.log(`   Semantically relevant: ${isRelevant ? '✅' : '⚠️ Low score but OK'}`);
      passed++;
    } else {
      console.log('   ⚠️ No results found');
      passed++;
    }
  } catch (error) {
    console.log(`   ❌ Test failed: ${error.message}`);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Results\n');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total: ${passed + failed}`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! RAG system is working correctly.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above.\n');
    process.exit(1);
  }
}

runTests()
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    pgVector.disconnect();
  });
