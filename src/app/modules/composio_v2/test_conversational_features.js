/**
 * Test file for Composio V2 Conversational Features
 * This file demonstrates how to use the new conversational endpoints
 */

import axios from 'axios';

// Configuration
const BASE_URL = 'http://localhost:5000'; // Adjust based on your server configuration
const API_BASE = `${BASE_URL}/api/v1/composio-v2`;

// Test user credentials (adjust as needed)
const TEST_USER = {
  userId: 'test-user-123',
  token: 'your-auth-token-here' // Replace with actual token
};

/**
 * Test the chat endpoint with a new conversation
 */
async function testNewConversation() {
  console.log('\n🚀 Testing New Conversation...');
  
  try {
    const response = await axios.post(`${API_BASE}/chat`, {
      message: "Send an email to test@example.com with subject 'Hello from Composio'",
      userId: TEST_USER.userId
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_USER.token}`
      }
    });

    console.log('✅ New conversation created successfully');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    return response.data.data.conversationId;
  } catch (error) {
    console.error('❌ Error in new conversation:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test continuing an existing conversation
 */
async function testContinueConversation(conversationId) {
  console.log('\n🔄 Testing Continue Conversation...');
  
  if (!conversationId) {
    console.log('⚠️ No conversation ID provided, skipping test');
    return;
  }
  
  try {
    const response = await axios.post(`${API_BASE}/chat`, {
      message: "Now create a GitHub repository called 'test-repo'",
      conversationId: conversationId,
      userId: TEST_USER.userId
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_USER.token}`
      }
    });

    console.log('✅ Conversation continued successfully');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error continuing conversation:', error.response?.data || error.message);
  }
}

/**
 * Test retrieving conversation history
 */
async function testGetConversation(conversationId) {
  console.log('\n📖 Testing Get Conversation...');
  
  if (!conversationId) {
    console.log('⚠️ No conversation ID provided, skipping test');
    return;
  }
  
  try {
    const response = await axios.get(`${API_BASE}/conversation/${conversationId}`, {
      headers: {
        'Authorization': `Bearer ${TEST_USER.token}`
      }
    });

    console.log('✅ Conversation retrieved successfully');
    console.log('Messages count:', response.data.data.messages?.length || 0);
    console.log('Conversation:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error retrieving conversation:', error.response?.data || error.message);
  }
}

/**
 * Test listing user conversations
 */
async function testListConversations() {
  console.log('\n📋 Testing List Conversations...');
  
  try {
    const response = await axios.get(`${API_BASE}/conversations`, {
      headers: {
        'Authorization': `Bearer ${TEST_USER.token}`
      },
      params: {
        page: 1,
        limit: 10
      }
    });

    console.log('✅ Conversations listed successfully');
    console.log('Total conversations:', response.data.data.totalCount || 0);
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error listing conversations:', error.response?.data || error.message);
  }
}

/**
 * Test guest user functionality
 */
async function testGuestUser() {
  console.log('\n👤 Testing Guest User...');
  
  try {
    const response = await axios.post(`${API_BASE}/chat`, {
      message: "Help me schedule a meeting for tomorrow",
      userId: `guest-${Date.now()}`
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Guest user conversation created successfully');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error in guest user conversation:', error.response?.data || error.message);
  }
}

/**
 * Test the classify and execute endpoint (existing functionality)
 */
async function testClassifyAndExecute() {
  console.log('\n🔍 Testing Classify and Execute...');
  
  try {
    const response = await axios.post(`${API_BASE}/classify-and-execute`, {
      userInput: "Send a tweet saying 'Hello from AI automation!'",
      userId: TEST_USER.userId
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_USER.token}`
      }
    });

    console.log('✅ Classify and execute completed successfully');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error in classify and execute:', error.response?.data || error.message);
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🧪 Starting Composio V2 Conversational Features Tests');
  console.log('================================================');
  
  // Test 1: New conversation
  const conversationId = await testNewConversation();
  
  // Test 2: Continue conversation
  await testContinueConversation(conversationId);
  
  // Test 3: Get conversation
  await testGetConversation(conversationId);
  
  // Test 4: List conversations
  await testListConversations();
  
  // Test 5: Guest user
  await testGuestUser();
  
  // Test 6: Classify and execute
  await testClassifyAndExecute();
  
  console.log('\n🏁 Tests completed!');
}

/**
 * Example usage patterns
 */
function showUsageExamples() {
  console.log('\n📚 Usage Examples:');
  console.log('==================');
  
  console.log('\n1. Start a new conversation:');
  console.log(`
    curl -X POST ${API_BASE}/chat \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Bearer YOUR_TOKEN" \\
      -d '{
        "message": "Send an email to john@example.com",
        "userId": "your-user-id"
      }'
  `);
  
  console.log('\n2. Continue a conversation:');
  console.log(`
    curl -X POST ${API_BASE}/chat \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Bearer YOUR_TOKEN" \\
      -d '{
        "message": "Now create a calendar event for tomorrow",
        "conversationId": "composio-1642636800000-abc123def",
        "userId": "your-user-id"
      }'
  `);
  
  console.log('\n3. Get conversation history:');
  console.log(`
    curl -X GET ${API_BASE}/conversation/composio-1642636800000-abc123def \\
      -H "Authorization: Bearer YOUR_TOKEN"
  `);
  
  console.log('\n4. List all conversations:');
  console.log(`
    curl -X GET "${API_BASE}/conversations?page=1&limit=10" \\
      -H "Authorization: Bearer YOUR_TOKEN"
  `);
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
  showUsageExamples();
}

export {
  testNewConversation,
  testContinueConversation,
  testGetConversation,
  testListConversations,
  testGuestUser,
  testClassifyAndExecute,
  runTests
};
