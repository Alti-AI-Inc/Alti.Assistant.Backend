/**
 * Individual Test Runner for Composio Simple API
 * 
 * This script allows you to run individual tests one by one.
 * Uncomment the test you want to run and execute: node test-composio-individual.js
 */

import {
  test1_getConnectedAccounts,
  test2_initiateAuth,
  test3_waitForConnection,
  test4_simpleChatAction,
  test5_continuedConversation,
  test6_getConversations,
  test7_getSpecificConversation,
  test8_compareWithV2,
  runAllTests
} from './test-composio-simple.js';

async function main() {
  console.log('🧪 Individual Test Runner\n');

  // ========================================
  // UNCOMMENT THE TEST YOU WANT TO RUN
  // ========================================

  // Test 1: Get your connected accounts (Gmail, GitHub, etc.)
  await test1_getConnectedAccounts();

  // Test 2: Start OAuth flow for a new app (uncomment to connect new app)
  // await test2_initiateAuth('gmail');  // or 'github', 'slack', etc.

  // Test 3: Wait for OAuth completion (use after test2 and completing OAuth in browser)
  // const connectedAccountId = 'YOUR_CONNECTED_ACCOUNT_ID_FROM_TEST2';
  // await test3_waitForConnection(connectedAccountId);

  // Test 4: Send a simple chat message / action
  // await test4_simpleChatAction('Send email to test@example.com with subject "Hello"');

  // Test 5: Continue a conversation (use conversation ID from test 4)
  // const conversationId = 'YOUR_CONVERSATION_ID_FROM_TEST4';
  // await test5_continuedConversation(conversationId, 'Also send a copy to john@example.com');

  // Test 6: Get all your conversations
  // await test6_getConversations();

  // Test 7: Get a specific conversation with all messages
  // const conversationId = 'YOUR_CONVERSATION_ID';
  // await test7_getSpecificConversation(conversationId);

  // Test 8: Compare simplified vs V2 performance
  // await test8_compareWithV2('Send email to test@example.com');

  // Run ALL tests in sequence
  // await runAllTests();
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
