import axios from 'axios';

// Configuration
const BASE_URL = 'http://localhost:5100/api/v1';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTAzMjc4MzU2ZWEyZTNmY2VmOTIwMTgiLCJyb2xlIjoidXNlciIsImlhdCI6MTc2MjI5MjQ4NiwiZXhwIjoxNzYyODk3Mjg2fQ.2c2R2cYbkqPWsVAq0BWtCl3Lqi_VA9uH0b5Gvevr_Po';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Helper function to log with colors
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Helper function to log test results
function logResult(testName, success, data, duration) {
  console.log('\n' + '='.repeat(80));
  if (success) {
    log(`✅ ${testName} - PASSED (${duration}ms)`, 'green');
  } else {
    log(`❌ ${testName} - FAILED (${duration}ms)`, 'red');
  }
  console.log('='.repeat(80));
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(80) + '\n');
}

// Test functions
async function test1_getConnectedAccounts() {
  log('\n🔍 TEST 1: Get Connected Accounts', 'cyan');
  log('Endpoint: GET /composio-simple/connected-accounts', 'blue');

  const startTime = Date.now();
  try {
    const response = await axios.get(
      `${BASE_URL}/composio-simple/connected-accounts`,
      {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
      }
    );

    const duration = Date.now() - startTime;
    logResult('Get Connected Accounts', true, response.data, duration);
    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logResult('Get Connected Accounts', false, {
      error: error.response?.data || error.message
    }, duration);
    return null;
  }
}

async function test2_initiateAuth(appName = 'gmail') {
  log(`\n🔐 TEST 2: Initiate Authentication for ${appName}`, 'cyan');
  log('Endpoint: POST /composio-simple/initiate', 'blue');

  const startTime = Date.now();
  try {
    const response = await axios.post(
      `${BASE_URL}/composio-simple/initiate`,
      { app_name: appName },
      {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
      }
    );

    const duration = Date.now() - startTime;
    logResult('Initiate Auth', true, response.data, duration);

    if (response.data.data?.redirectUrl) {
      log('\n📋 NEXT STEP: Open this URL in browser to complete OAuth:', 'yellow');
      log(response.data.data.redirectUrl, 'bright');
      log('\n📋 Connected Account ID (save this for next test):', 'yellow');
      log(response.data.data.id, 'bright');
    }

    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logResult('Initiate Auth', false, {
      error: error.response?.data || error.message
    }, duration);
    return null;
  }
}

async function test3_waitForConnection(connectedAccountId) {
  log('\n⏳ TEST 3: Wait for Connection', 'cyan');
  log('Endpoint: POST /composio-simple/wait-for-connection', 'blue');

  if (!connectedAccountId) {
    log('⚠️  Skipping: No connected account ID provided', 'yellow');
    log('Run test2_initiateAuth first and complete OAuth flow', 'yellow');
    return null;
  }

  const startTime = Date.now();
  try {
    const response = await axios.post(
      `${BASE_URL}/composio-simple/wait-for-connection`,
      { connected_account_id: connectedAccountId },
      {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
      }
    );

    const duration = Date.now() - startTime;
    logResult('Wait for Connection', true, response.data, duration);
    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logResult('Wait for Connection', false, {
      error: error.response?.data || error.message
    }, duration);
    return null;
  }
}

async function test4_simpleChatAction(message = 'Send email to test@example.com with subject "Test Email" and body "Hello, this is a test"') {
  log('\n💬 TEST 4: Simple Chat Action', 'cyan');
  log('Endpoint: POST /composio-simple/chat', 'blue');
  log(`Message: ${message}`, 'blue');

  const startTime = Date.now();
  try {
    const response = await axios.post(
      `${BASE_URL}/composio-simple/chat`,
      { message },
      {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
      }
    );

    const duration = Date.now() - startTime;
    logResult('Simple Chat Action', true, response.data, duration);

    if (response.data.data?.conversationId) {
      log('\n📋 Conversation ID (save this for conversation tests):', 'yellow');
      log(response.data.data.conversationId, 'bright');
    }

    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logResult('Simple Chat Action', false, {
      error: error.response?.data || error.message
    }, duration);
    return null;
  }
}

async function test5_continuedConversation(conversationId, message = 'Great! Can you also send a follow-up email?') {
  log('\n💬 TEST 5: Continued Conversation (with memory)', 'cyan');
  log('Endpoint: POST /composio-simple/chat', 'blue');
  log(`Message: ${message}`, 'blue');

  if (!conversationId) {
    log('⚠️  Skipping: No conversation ID provided', 'yellow');
    log('Run test4_simpleChatAction first', 'yellow');
    return null;
  }

  const startTime = Date.now();
  try {
    const response = await axios.post(
      `${BASE_URL}/composio-simple/chat`,
      {
        message,
        conversationId
      },
      {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
      }
    );

    const duration = Date.now() - startTime;
    logResult('Continued Conversation', true, response.data, duration);
    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logResult('Continued Conversation', false, {
      error: error.response?.data || error.message
    }, duration);
    return null;
  }
}

async function test6_getConversations() {
  log('\n📜 TEST 6: Get All Conversations', 'cyan');
  log('Endpoint: GET /composio-simple/conversations', 'blue');

  const startTime = Date.now();
  try {
    const response = await axios.get(
      `${BASE_URL}/composio-simple/conversations?page=1&limit=10`,
      {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
      }
    );

    const duration = Date.now() - startTime;
    logResult('Get All Conversations', true, response.data, duration);
    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logResult('Get All Conversations', false, {
      error: error.response?.data || error.message
    }, duration);
    return null;
  }
}

async function test7_getSpecificConversation(conversationId) {
  log('\n📝 TEST 7: Get Specific Conversation', 'cyan');
  log('Endpoint: GET /composio-simple/conversation/:id', 'blue');

  if (!conversationId) {
    log('⚠️  Skipping: No conversation ID provided', 'yellow');
    log('Run test4_simpleChatAction first', 'yellow');
    return null;
  }

  const startTime = Date.now();
  try {
    const response = await axios.get(
      `${BASE_URL}/composio-simple/conversation/${conversationId}`,
      {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
      }
    );

    const duration = Date.now() - startTime;
    logResult('Get Specific Conversation', true, response.data, duration);
    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logResult('Get Specific Conversation', false, {
      error: error.response?.data || error.message
    }, duration);
    return null;
  }
}

async function test8_compareWithV2(message = 'Send email to test@example.com with subject "Compare Test"') {
  log('\n⚖️  TEST 8: Compare Simplified vs V2', 'cyan');
  log('Endpoint: POST /composio-simple/compare', 'blue');
  log(`Message: ${message}`, 'blue');

  const startTime = Date.now();
  try {
    const response = await axios.post(
      `${BASE_URL}/composio-simple/compare`,
      { message },
      {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
      }
    );

    const duration = Date.now() - startTime;
    logResult('Compare Systems', true, response.data, duration);

    if (response.data.data?.comparison) {
      log('\n📊 PERFORMANCE COMPARISON:', 'yellow');
      const comp = response.data.data.comparison;
      log(`Time Saved: ${comp.timeSaved}`, 'bright');
      log(`Performance: ${comp.percentageFaster}`, 'bright');
      log(`Winner: ${comp.simplifiedWon ? 'Simplified' : 'V2'}`, 'bright');
      log(`Summary: ${comp.improvement}`, 'bright');
    }

    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logResult('Compare Systems', false, {
      error: error.response?.data || error.message
    }, duration);
    return null;
  }
}

// Main test runner
async function runAllTests() {
  log('\n' + '='.repeat(80), 'bright');
  log('🚀 COMPOSIO SIMPLE API TEST SUITE', 'bright');
  log('='.repeat(80) + '\n', 'bright');

  log(`Base URL: ${BASE_URL}`, 'blue');
  log(`Auth Token: ${AUTH_TOKEN.substring(0, 20)}...`, 'blue');
  log('\n');

  let conversationId = null;
  let connectedAccountId = null;

  // Test 1: Get connected accounts
  await test1_getConnectedAccounts();
  await sleep(1000);

  // Test 2: Initiate auth (optional - uncomment if you need to connect new app)
  // const authResult = await test2_initiateAuth('gmail');
  // if (authResult?.data?.id) {
  //   connectedAccountId = authResult.data.id;
  //   log('\n⚠️  PAUSE: Complete OAuth flow in browser, then uncomment test3', 'yellow');
  // }
  // await sleep(1000);

  // Test 3: Wait for connection (uncomment after completing OAuth)
  // await test3_waitForConnection(connectedAccountId);
  // await sleep(1000);

  // Test 4: Simple chat action
  const chatResult = await test4_simpleChatAction();
  if (chatResult?.data?.conversationId) {
    conversationId = chatResult.data.conversationId;
  }
  await sleep(2000);

  // Test 5: Continued conversation
  if (conversationId) {
    await test5_continuedConversation(conversationId);
    await sleep(2000);
  }

  // Test 6: Get all conversations
  await test6_getConversations();
  await sleep(1000);

  // Test 7: Get specific conversation
  if (conversationId) {
    await test7_getSpecificConversation(conversationId);
    await sleep(1000);
  }

  // Test 8: Compare with V2
  await test8_compareWithV2();

  log('\n' + '='.repeat(80), 'bright');
  log('✅ TEST SUITE COMPLETED', 'bright');
  log('='.repeat(80) + '\n', 'bright');
}

// Individual test functions (can be run separately)
async function runTest1() {
  await test1_getConnectedAccounts();
}

async function runTest4() {
  await test4_simpleChatAction();
}

async function runTest8() {
  await test8_compareWithV2();
}

// Helper to sleep between tests
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export functions for manual use
export {
  test1_getConnectedAccounts,
  test2_initiateAuth,
  test3_waitForConnection,
  test4_simpleChatAction,
  test5_continuedConversation,
  test6_getConversations,
  test7_getSpecificConversation,
  test8_compareWithV2,
  runAllTests,
  runTest1,
  runTest4,
  runTest8
};

// Run all tests if executed directly
runAllTests().catch(error => {
  log(`\n❌ Fatal Error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
