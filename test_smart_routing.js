import { runIntelligentSearch } from './src/app/modules/search/llm.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Test smart routing functionality
 * This tests whether code-related queries are routed to Claude
 * and general queries are routed to Gemini
 */
async function testSmartRouting() {
  console.log('🧪 Testing Smart Routing Integration\n');
  console.log('='.repeat(60));

  // Test cases: code-related and general queries
  const testCases = [
    {
      name: 'Code Query - Python Function',
      query: 'Write a Python function to calculate Fibonacci numbers',
      expectedModel: 'claude-sonnet-4.5',
      conversationId: 'test-001'
    },
    {
      name: 'Code Query - JavaScript Async',
      query: 'How do I handle async/await errors in JavaScript?',
      expectedModel: 'claude-sonnet-4.5',
      conversationId: 'test-002'
    },
    {
      name: 'General Query - Weather',
      query: 'What is the weather like today?',
      expectedModel: 'gemini',
      conversationId: 'test-003'
    },
    {
      name: 'General Query - Sports',
      query: 'When is the next NBA game?',
      expectedModel: 'gemini',
      conversationId: 'test-004'
    },
    {
      name: 'Code Query - Algorithm',
      query: 'Implement binary search in Java with comments',
      expectedModel: 'claude-sonnet-4.5',
      conversationId: 'test-005'
    }
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`   Query: "${testCase.query}"`);
    console.log(`   Expected Model: ${testCase.expectedModel}`);

    try {
      const state = {
        query: testCase.query,
        currentQuery: testCase.query,
        conversationId: testCase.conversationId,
        conversationContext: []
      };

      const startTime = Date.now();
      const result = await runIntelligentSearch(state, false);
      const duration = Date.now() - startTime;

      console.log(`   ✅ Response received in ${duration}ms`);
      console.log(`   Model Used: ${result.modelUsed || 'gemini (default)'}`);

      // Check if routing was correct
      const actualModel = result.modelUsed || 'gemini';
      const routingCorrect = actualModel.includes(testCase.expectedModel) ||
        testCase.expectedModel.includes(actualModel);

      if (routingCorrect) {
        console.log(`   ✅ PASSED: Routed to correct model`);
        passedTests++;
      } else {
        console.log(`   ❌ FAILED: Expected ${testCase.expectedModel}, got ${actualModel}`);
        failedTests++;
      }

      // Show classification if available
      if (result.classification) {
        console.log(`   📊 Classification:`, {
          isCodeRelated: result.classification.isCodeRelated,
          confidence: result.classification.confidence,
          category: result.classification.primaryCategory
        });
      }

      // Show snippet of answer
      const answerSnippet = result.answer?.substring(0, 150) || 'No answer';
      console.log(`   💬 Answer snippet: ${answerSnippet}...`);

    } catch (error) {
      console.error(`   ❌ ERROR: ${error.message}`);
      failedTests++;
    }

    // Add delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary:');
  console.log(`   Total Tests: ${testCases.length}`);
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log(`   Success Rate: ${((passedTests / testCases.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  return {
    total: testCases.length,
    passed: passedTests,
    failed: failedTests,
    successRate: (passedTests / testCases.length) * 100
  };
}

/**
 * Test configuration
 */
async function testConfiguration() {
  console.log('\n🔧 Testing Configuration\n');
  console.log('='.repeat(60));

  const config = await import('./config/index.js').then(m => m.default);

  console.log('Claude Configuration:');
  console.log(`   Model Name: ${config.claude.modelName}`);
  console.log(`   Max Tokens: ${config.claude.maxTokens}`);
  console.log(`   Temperature: ${config.claude.temperature}`);
  console.log(`   API Key: ${config.anthropic_api_key ? '✅ Set' : '❌ Not set'}`);

  console.log('\nRouting Configuration:');
  console.log(`   Smart Routing Enabled: ${config.routing.enableSmartRouting}`);
  console.log(`   Confidence Threshold: ${config.routing.codeQueryThreshold}`);

  console.log('\n' + '='.repeat(60));
}

// Run tests
(async () => {
  try {
    console.log('\n🚀 Smart Routing Integration Test Suite\n');

    // Test configuration first
    await testConfiguration();

    // Run routing tests
    const results = await testSmartRouting();

    // Exit with appropriate code
    process.exit(results.failed === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
})();
