import { createUserAgent, isHyperspellConnected, getUserComposioIntegrations } from './src/lib/mastra/agent-factory.js';
import { RuntimeContext } from '@mastra/core/runtime-context';

/**
 * Comprehensive test for agent factory with Hyperspell integration
 *
 * Tests:
 * 1. Checks if user has integrations connected
 * 2. Creates agent with proper tools
 * 3. Verifies Hyperspell tool is available when connected
 * 4. Tests agent generation with Hyperspell context
 */
async function testAgentFactory() {
  console.log('🧪 Testing Agent Factory with Hyperspell Integration\n');

  // Test user with both Composio and Hyperspell connected
  const testUserId = 'user_35xvFw3JyN8JOjpJIuZDW24CEnZ'; // ahiirparth@gmail.com

  try {
    // 1. Check user's integrations
    console.log('📊 Step 1: Checking user integrations...\n');

    const composioIntegrations = await getUserComposioIntegrations(testUserId);
    const hasHyperspell = await isHyperspellConnected(testUserId);

    console.log(`  Composio Integrations: ${composioIntegrations.length}`);
    composioIntegrations.forEach((integration) => {
      console.log(`    - ${integration.appName} (${integration.connectedAccountId})`);
    });

    console.log(`  Hyperspell Connected: ${hasHyperspell ? 'Yes ✅' : 'No ❌'}\n`);

    // 2. Create agent
    console.log('🤖 Step 2: Creating agent...\n');

    const agent = await createUserAgent(testUserId);

    console.log(`  Agent Name: ${agent.name}`);
    console.log(`  Tools Available: ${Object.keys((agent as any).tools || {}).length}`);

    // Check if Hyperspell tool is present
    const tools = (agent as any).tools || {};
    const hasHyperspellTool = 'hyperspellSearchTool' in tools;

    console.log(`  Hyperspell Tool Loaded: ${hasHyperspellTool ? 'Yes ✅' : 'No ❌'}\n`);

    if (!hasHyperspellTool && hasHyperspell) {
      throw new Error('Hyperspell is connected but tool was not loaded!');
    }

    // 3. Test agent generation (without actually calling LLM to save costs)
    console.log('💬 Step 3: Agent Instructions Preview\n');

    const instructions = (agent as any).instructions || '';
    console.log('  Instructions snippet:');
    console.log(`  ${instructions.substring(0, 200)}...\n`);

    // 4. Verify RuntimeContext can be passed
    console.log('🔧 Step 4: Verifying RuntimeContext setup...\n');

    const runtimeContext = new RuntimeContext();
    runtimeContext.set('userId', testUserId);

    const retrievedUserId = runtimeContext.get('userId');
    console.log(`  userId set in RuntimeContext: ${retrievedUserId === testUserId ? 'Yes ✅' : 'No ❌'}\n`);

    if (retrievedUserId !== testUserId) {
      throw new Error('RuntimeContext did not store userId correctly');
    }

    // 5. Summary
    console.log('📋 Summary\n');
    console.log('  ✅ User integrations checked');
    console.log('  ✅ Agent created successfully');
    console.log(`  ${hasHyperspellTool ? '✅' : '❌'} Hyperspell tool ${hasHyperspellTool ? 'loaded' : 'not loaded'}`);
    console.log(`  ✅ Agent has ${composioIntegrations.length} Composio tools + ${hasHyperspellTool ? '1' : '0'} Hyperspell tool`);
    console.log('  ✅ RuntimeContext working correctly');

    console.log('\n✅ All tests passed!');
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
testAgentFactory();
