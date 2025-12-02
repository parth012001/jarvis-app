/**
 * Debug script to test Composio Gmail integration directly
 * Uses NEW @composio/core SDK with MastraProvider
 * Run with: node scripts/debug/test-composio-gmail.mjs
 */

import 'dotenv/config';
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';

const CONNECTED_ACCOUNT_ID = 'ca_fJC6eU7R6tnm';
const ENTITY_ID = 'user_35yL92VUpIwu11ZeqpPrjrkRFrH';

async function testGmailConnection() {
  console.log('🧪 Testing Composio Gmail Connection (NEW SDK)\n');

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.error('❌ COMPOSIO_API_KEY not set');
    process.exit(1);
  }

  // Create Composio client with MastraProvider
  const composio = new Composio({
    apiKey,
    provider: new MastraProvider(),
  });

  try {
    // 1. Check connected account status
    console.log('📊 Step 1: Checking connected account status...\n');

    const accounts = await composio.connectedAccounts.list({
      userIds: [ENTITY_ID],
    });

    const account = accounts?.items?.find(a => a.id === CONNECTED_ACCOUNT_ID);

    if (!account) {
      console.error(`\n❌ Could not find account ${CONNECTED_ACCOUNT_ID}`);
      console.log('Available accounts:', accounts?.items?.map(a => ({ id: a.id, app: a.toolkit?.slug, status: a.status })));
      process.exit(1);
    }

    console.log('Connected Account:', {
      id: account.id,
      status: account.status,
      toolkit: account.toolkit?.slug,
      createdAt: account.createdAt,
    });

    if (account.status !== 'ACTIVE') {
      console.error(`\n❌ Account is not ACTIVE! Status: ${account.status}`);
      console.log('Possible fix: Reconnect Gmail in the onboarding page');
      process.exit(1);
    }

    console.log('\n✅ Account is ACTIVE\n');

    // 2. Get tools for Gmail using the new SDK
    console.log('🔧 Step 2: Getting Gmail tools via composio.tools.get...\n');

    // First arg is userId (entityId), NOT 'mastra'
    // The provider is already configured in the Composio constructor
    const tools = await composio.tools.get(ENTITY_ID, {
      toolkits: ['gmail'],
      connectedAccountId: CONNECTED_ACCOUNT_ID,
    });

    console.log(`✅ Got ${Object.keys(tools).length} tools for GMAIL`);
    console.log('Tool names:', Object.keys(tools).slice(0, 5).join(', '), '...');

    // 3. Execute a Gmail tool
    console.log('\n📧 Step 3: Executing GMAIL_FETCH_EMAILS tool...\n');

    const fetchEmailsTool = tools['GMAIL_FETCH_EMAILS'];
    if (!fetchEmailsTool) {
      console.error('❌ GMAIL_FETCH_EMAILS tool not found');
      console.log('Available tools:', Object.keys(tools).join(', '));
      process.exit(1);
    }

    // Execute the tool
    const result = await fetchEmailsTool.execute({
      max_results: 1,
      include_payload: true,
      user_id: 'me',
    });

    console.log('\n✅ Success! Result:', JSON.stringify(result, null, 2).slice(0, 500) + '...');

  } catch (error) {
    console.error('\n❌ Error occurred:');
    console.error('  Type:', error?.constructor?.name);
    console.error('  Message:', error?.message);
    console.error('  Code:', error?.code);
    console.error('  Status:', error?.statusCode || error?.status);

    if (error?.cause) {
      console.error('  Cause:', error.cause);
    }
    if (error?.response) {
      console.error('  Response:', error.response?.data || error.response);
    }
    if (error?.body) {
      console.error('  Body:', error.body);
    }

    // Log the full error
    console.error('\nFull error object:');
    console.error(JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    process.exit(1);
  }
}

testGmailConnection();
