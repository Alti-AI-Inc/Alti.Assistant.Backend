/**
 * Test script for writing classification
 * Tests the new writing detection and Claude routing without search
 */

import { classifyWritingRequest } from './src/app/modules/search/services/queryClassifier.js';

console.log('='.repeat(80));
console.log('TESTING WRITING CLASSIFICATION');
console.log('='.repeat(80));

// Test queries
const testQueries = [
  // Writing requests - should be detected
  { query: 'Write me a blog post about AI', expected: true, description: 'Blog post request' },
  { query: 'Write an essay on climate change', expected: true, description: 'Essay request' },
  { query: 'Compose a professional email to my boss', expected: true, description: 'Email request' },
  { query: 'Draft a letter of recommendation', expected: true, description: 'Letter request' },
  { query: 'Create an article about healthy eating', expected: true, description: 'Article request' },
  { query: 'Write me a story about a dragon', expected: true, description: 'Story request' },
  { query: 'Generate a product description for my new app', expected: true, description: 'Product description' },
  { query: 'Help me write a cover letter for this job', expected: true, description: 'Cover letter' },

  // Code requests - should NOT be detected as writing
  { query: 'Write me a node js script for authentication', expected: false, description: 'Code script request' },
  { query: 'Write a Python function to sort an array', expected: false, description: 'Code function request' },
  { query: 'Create a JavaScript code for API integration', expected: false, description: 'Code API request' },
  { query: 'Write me a script to automate deployment', expected: false, description: 'Automation script' },

  // General queries - should NOT be detected
  { query: 'What is the weather today?', expected: false, description: 'Weather query' },
  { query: 'Who won the game last night?', expected: false, description: 'Sports query' },
  { query: 'Tell me about quantum computing', expected: false, description: 'Information query' },
  { query: 'How to cook pasta', expected: false, description: 'How-to query' },
];

console.log('\nRunning classification tests...\n');

let passed = 0;
let failed = 0;

testQueries.forEach((test, index) => {
  console.log(`\n${index + 1}. ${test.description}`);
  console.log(`   Query: "${test.query}"`);

  const result = classifyWritingRequest(test.query);

  console.log(`   Result: ${result.isWritingRequest ? '✍️ WRITING' : '❌ NOT WRITING'}`);
  console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`   Reason: ${result.reason}`);

  const isCorrect = result.isWritingRequest === test.expected;

  if (isCorrect) {
    console.log(`   ✅ PASS - Correctly classified`);
    passed++;
  } else {
    console.log(`   ❌ FAIL - Expected ${test.expected ? 'WRITING' : 'NOT WRITING'}, got ${result.isWritingRequest ? 'WRITING' : 'NOT WRITING'}`);
    failed++;
  }
});

console.log('\n' + '='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log(`Total tests: ${testQueries.length}`);
console.log(`✅ Passed: ${passed} (${((passed / testQueries.length) * 100).toFixed(1)}%)`);
console.log(`❌ Failed: ${failed} (${((failed / testQueries.length) * 100).toFixed(1)}%)`);
console.log('='.repeat(80));

if (failed === 0) {
  console.log('\n🎉 All tests passed! Writing classification is working correctly.\n');
} else {
  console.log(`\n⚠️  ${failed} test(s) failed. Review the classification logic.\n`);
}
