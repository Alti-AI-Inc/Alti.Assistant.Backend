/**
 * Test script for Article Writer Module
 * Run with: node scripts/test-article-writer.js
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const BASE_URL = 'http://localhost:5000';
const API_ENDPOINT = `${BASE_URL}/article-writer/assistant`;

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function separator() {
  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Test 1: Simple article generation (guest user)
 */
async function testSimpleArticle() {
  separator();
  log('Test 1: Simple Article Generation (Guest User)', 'cyan');
  log(
    'Description: Generate a simple blog post without authentication',
    'yellow'
  );

  try {
    const response = await axios.post(API_ENDPOINT, {
      message:
        'Write a short blog post about the benefits of morning meditation',
    });

    log('✓ Success!', 'green');
    log(`Status: ${response.status}`, 'blue');
    log(`Conversation ID: ${response.data.data.conversationId}`, 'blue');
    log(
      `Article Length: ${response.data.data.article.length} characters`,
      'blue'
    );
    log('\nGenerated Article Preview:', 'yellow');
    log(response.data.data.article.substring(0, 300) + '...', 'reset');

    return response.data.data.conversationId;
  } catch (error) {
    log('✗ Failed!', 'red');
    log(error.response?.data?.message || error.message, 'red');
    return null;
  }
}

/**
 * Test 2: Article with custom parameters
 */
async function testArticleWithParameters() {
  separator();
  log('Test 2: Article with Custom Parameters', 'cyan');
  log(
    'Description: Generate a technical article with specific parameters',
    'yellow'
  );

  try {
    const response = await axios.post(API_ENDPOINT, {
      message: 'Explain how machine learning works',
      articleType: 'technical_article',
      tone: 'professional',
      length: 'medium',
    });

    log('✓ Success!', 'green');
    log(`Status: ${response.status}`, 'blue');
    log(`Article Type: ${response.data.data.metadata.articleType}`, 'blue');
    log(`Tone: ${response.data.data.metadata.tone}`, 'blue');
    log(`Length: ${response.data.data.metadata.length}`, 'blue');
    log(
      `Article Length: ${response.data.data.article.length} characters`,
      'blue'
    );
    log('\nGenerated Article Preview:', 'yellow');
    log(response.data.data.article.substring(0, 300) + '...', 'reset');

    return response.data.data.conversationId;
  } catch (error) {
    log('✗ Failed!', 'red');
    log(error.response?.data?.message || error.message, 'red');
    return null;
  }
}

/**
 * Test 3: Continue conversation
 */
async function testContinueConversation(conversationId) {
  separator();
  log('Test 3: Continue Conversation', 'cyan');
  log('Description: Refine the previously generated article', 'yellow');

  if (!conversationId) {
    log('Skipping - No conversation ID available', 'yellow');
    return;
  }

  try {
    const response = await axios.post(API_ENDPOINT, {
      message: 'Make it shorter and add bullet points',
      conversationId: conversationId,
    });

    log('✓ Success!', 'green');
    log(`Status: ${response.status}`, 'blue');
    log(
      `Same Conversation ID: ${response.data.data.conversationId === conversationId}`,
      'blue'
    );
    log(
      `Article Length: ${response.data.data.article.length} characters`,
      'blue'
    );
    log('\nRefined Article Preview:', 'yellow');
    log(response.data.data.article.substring(0, 300) + '...', 'reset');
  } catch (error) {
    log('✗ Failed!', 'red');
    log(error.response?.data?.message || error.message, 'red');
  }
}

/**
 * Test 4: Different article types
 */
async function testDifferentArticleTypes() {
  separator();
  log('Test 4: Different Article Types', 'cyan');
  log('Description: Test various article types', 'yellow');

  const articleTypes = [
    { type: 'how_to_guide', message: 'How to make perfect scrambled eggs' },
    { type: 'listicle', message: '5 tips for better productivity' },
    { type: 'opinion_piece', message: 'Why remote work is the future' },
  ];

  for (const { type, message } of articleTypes) {
    try {
      log(`\nTesting ${type}...`, 'yellow');
      const response = await axios.post(API_ENDPOINT, {
        message: message,
        articleType: type,
        length: 'short',
      });

      log(`✓ ${type} - Success!`, 'green');
      log(
        `Article Length: ${response.data.data.article.length} characters`,
        'blue'
      );
    } catch (error) {
      log(`✗ ${type} - Failed!`, 'red');
      log(error.response?.data?.message || error.message, 'red');
    }
  }
}

/**
 * Test 5: Different tones
 */
async function testDifferentTones() {
  separator();
  log('Test 5: Different Writing Tones', 'cyan');
  log('Description: Test various writing tones', 'yellow');

  const tones = ['casual', 'formal', 'conversational'];

  for (const tone of tones) {
    try {
      log(`\nTesting ${tone} tone...`, 'yellow');
      const response = await axios.post(API_ENDPOINT, {
        message: 'Write about the importance of sleep',
        tone: tone,
        length: 'short',
      });

      log(`✓ ${tone} tone - Success!`, 'green');
      log(
        `Article Length: ${response.data.data.article.length} characters`,
        'blue'
      );
    } catch (error) {
      log(`✗ ${tone} tone - Failed!`, 'red');
      log(error.response?.data?.message || error.message, 'red');
    }
  }
}

/**
 * Test 6: Different lengths
 */
async function testDifferentLengths() {
  separator();
  log('Test 6: Different Article Lengths', 'cyan');
  log('Description: Test various article lengths', 'yellow');

  const lengths = ['short', 'medium', 'long'];

  for (const length of lengths) {
    try {
      log(`\nTesting ${length} length...`, 'yellow');
      const response = await axios.post(API_ENDPOINT, {
        message: 'Write about healthy eating',
        length: length,
      });

      log(`✓ ${length} length - Success!`, 'green');
      log(
        `Article Length: ${response.data.data.article.length} characters`,
        'blue'
      );
      log(
        `Word Count: ~${Math.round(response.data.data.article.split(/\s+/).length)} words`,
        'blue'
      );
    } catch (error) {
      log(`✗ ${length} length - Failed!`, 'red');
      log(error.response?.data?.message || error.message, 'red');
    }
  }
}

/**
 * Test 7: Error handling
 */
async function testErrorHandling() {
  separator();
  log('Test 7: Error Handling', 'cyan');
  log('Description: Test error scenarios', 'yellow');

  // Test 1: Missing message
  try {
    log('\nTesting missing message...', 'yellow');
    await axios.post(API_ENDPOINT, {});
    log('✗ Should have failed!', 'red');
  } catch (error) {
    if (error.response?.status === 400) {
      log('✓ Correctly rejected missing message', 'green');
      log(`Error: ${error.response.data.message}`, 'blue');
    } else {
      log('✗ Unexpected error', 'red');
    }
  }

  // Test 2: Invalid article type (should still work with validation)
  try {
    log('\nTesting invalid article type...', 'yellow');
    await axios.post(API_ENDPOINT, {
      message: 'Test message',
      articleType: 'invalid_type',
    });
    log('✗ Should have failed validation!', 'red');
  } catch (error) {
    if (error.response?.status === 400) {
      log('✓ Correctly rejected invalid article type', 'green');
      log(`Error: ${error.response.data.message}`, 'blue');
    } else {
      log('✗ Unexpected error', 'red');
    }
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  log(
    '\n╔════════════════════════════════════════════════════════════════════════════╗',
    'cyan'
  );
  log(
    '║                   Article Writer Module - Test Suite                      ║',
    'cyan'
  );
  log(
    '╚════════════════════════════════════════════════════════════════════════════╝',
    'cyan'
  );

  log('\nStarting tests...', 'yellow');
  log(`Target: ${BASE_URL}`, 'blue');
  log(`Endpoint: ${API_ENDPOINT}`, 'blue');

  let conversationId = null;

  try {
    // Run tests sequentially
    conversationId = await testSimpleArticle();
    await testArticleWithParameters();
    await testContinueConversation(conversationId);
    await testDifferentArticleTypes();
    await testDifferentTones();
    await testDifferentLengths();
    await testErrorHandling();

    separator();
    log('✓ All tests completed!', 'green');
    log('Check the output above for individual test results.', 'yellow');
  } catch (error) {
    separator();
    log('✗ Test suite failed!', 'red');
    log(error.message, 'red');
  }
}

// Run the tests
runAllTests();
