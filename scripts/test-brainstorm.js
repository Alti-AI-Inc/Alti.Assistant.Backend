/**
 * Quick test script for Brainstorm API
 * Run this to verify the module is working correctly
 * 
 * Usage:
 * node scripts/test-brainstorm.js
 */

const BASE_URL = 'http://localhost:5000';

async function testBrainstormAPI() {
  console.log('🧪 Testing Brainstorm API...\n');

  // Test 1: Simple conversational brainstorm
  console.log('Test 1: Simple Conversational Brainstorm');
  console.log('=========================================');

  try {
    const response = await fetch(`${BASE_URL}/api/v1/brainstorm/assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Help me brainstorm ideas for a productivity app for remote workers'
      }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('✅ Success!');
      console.log('Conversation ID:', data.data.conversationId);
      console.log('Total Ideas Generated:', data.data.metadata?.totalIdeasGenerated || 'N/A');
      console.log('Technique Used:', data.data.metadata?.techniqueUsed || 'N/A');
      console.log('\nFirst 500 characters of response:');
      console.log(data.data.response.substring(0, 500) + '...\n');

      // Save conversation ID for next test
      global.conversationId = data.data.conversationId;
    } else {
      console.log('❌ Failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 2: Continue conversation
  if (global.conversationId) {
    console.log('\nTest 2: Continue Conversation');
    console.log('==============================');

    try {
      const response = await fetch(`${BASE_URL}/api/v1/brainstorm/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: global.conversationId,
          message: 'Can you focus on the technical implementation?'
        }),
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Success!');
        console.log('Continued conversation:', data.data.conversationId);
        console.log('\nFirst 300 characters of response:');
        console.log(data.data.response.substring(0, 300) + '...\n');
      } else {
        console.log('❌ Failed:', data.message);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }

  // Test 3: Structured brainstorm with SWOT
  console.log('\nTest 3: Structured Brainstorm (SWOT Analysis)');
  console.log('==============================================');

  try {
    const response = await fetch(`${BASE_URL}/api/v1/brainstorm/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idea: 'AI-powered resume builder for job seekers',
        brainstormType: 'product_idea',
        technique: 'swot',
        perspective: ['business', 'user_centric'],
        depth: 'standard'
      }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('✅ Success!');
      console.log('Conversation ID:', data.data.conversationId);
      console.log('Brainstorm Type:', data.data.metadata?.brainstormType || 'N/A');
      console.log('\nFirst 400 characters of response:');
      console.log(data.data.response.substring(0, 400) + '...\n');
    } else {
      console.log('❌ Failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 4: Quick brainstorm
  console.log('\nTest 4: Quick Brainstorm');
  console.log('========================');

  try {
    const response = await fetch(`${BASE_URL}/api/v1/brainstorm/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idea: 'Marketing campaign for a new coffee brand',
        depth: 'quick'
      }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('✅ Success!');
      console.log('Ideas Generated:', data.data.metadata?.totalIdeasGenerated || 'N/A');
      console.log('Depth Level:', data.data.metadata?.depthLevel || 'N/A');
      console.log('\nFirst 300 characters of response:');
      console.log(data.data.response.substring(0, 300) + '...\n');
    } else {
      console.log('❌ Failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n✨ All tests completed!');
  console.log('\nNext steps:');
  console.log('1. Import the Postman collection from postman_collections/Brainstorm_API.postman_collection.json');
  console.log('2. Try different techniques and perspectives');
  console.log('3. Test with authenticated users for export and refine features');
  console.log('\nFor full documentation, see:');
  console.log('- src/app/modules/brainstorm/README.md');
  console.log('- src/app/modules/brainstorm/QUICKSTART.md');
}

// Run tests
testBrainstormAPI().catch(console.error);
