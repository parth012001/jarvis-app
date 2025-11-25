import { hyperspellSearchTool } from './src/lib/mastra/tools/hyperspell.js';
import { RuntimeContext } from '@mastra/core/runtime-context';

/**
 * Test script for Hyperspell search tool
 *
 * This tests the tool's execute function with mock runtime context
 */
async function testHyperspellTool() {
  console.log('🧪 Testing Hyperspell Search Tool\n');

  // Test user ID (using one of the existing users from database)
  const testUserId = 'user_35xvFw3JyN8JOjpJIuZDW24CEnZ'; // ahiirparth@gmail.com

  try {
    // Create runtime context with userId
    const runtimeContext = new RuntimeContext();
    runtimeContext.set('userId', testUserId);

    console.log('📋 Test Parameters:');
    console.log(`  User ID: ${testUserId}`);
    console.log(`  Query: "emails about budget"`);
    console.log(`  Limit: 5\n`);

    // Execute the tool
    console.log('⚙️  Executing tool...\n');

    const result = await hyperspellSearchTool.execute!(
      {
        context: {
          query: 'emails about budget',
          limit: 5,
        },
        runtimeContext,
      },
      {}
    );

    console.log('✅ Tool execution successful!\n');
    console.log('📊 Results:');
    console.log(`  Document Count: ${result.documentCount}`);
    console.log(`  Has Answer: ${!!result.answer}`);

    if (result.answer) {
      console.log(`\n💬 AI Answer:\n${result.answer}\n`);
    }

    if (result.documents.length > 0) {
      console.log(`📄 Documents Found: ${result.documents.length}`);
      result.documents.forEach((doc, idx) => {
        console.log(`\n  Document ${idx + 1}:`);
        console.log(`    Content Preview: ${doc.content.substring(0, 100)}...`);
        console.log(`    Metadata Keys: ${Object.keys(doc.metadata).join(', ')}`);
      });
    }

    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);

    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack:', error.stack);
    }

    process.exit(1);
  }
}

// Run the test
testHyperspellTool();
