/**
 * Test file for Claude Service Configuration
 * Tests Claude Sonnet 4.5 access via direct Anthropic API
 * 
 * Run with: node test_claude_config.js
 */

import claudeService from './src/app/modules/search/services/claudeService.js'; // Will be renamed to claudeService.js
import config from './config/index.js';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testConfiguration() {
  log('\n========================================', colors.cyan);
  log('Claude Service Configuration Test', colors.cyan);
  log('========================================\n', colors.cyan);

  try {
    // Test 1: Check Configuration
    log('Test 1: Checking Configuration...', colors.blue);
    log('-----------------------------------', colors.blue);

    const serviceInfo = claudeService.getServiceInfo();
    log(`✓ Model Name: ${serviceInfo.modelName}`, colors.green);
    log(`✓ Provider: ${serviceInfo.provider}`, colors.green);
    log(`✓ API Key Configured: ${config.anthropic.anthropic_api_key ? 'Yes' : 'No'}`, colors.green);

    // Test 2: Validate Configuration
    log('\nTest 2: Validating Configuration...', colors.blue);
    log('-----------------------------------', colors.blue);

    const configStatus = await claudeService.checkConfiguration();

    if (configStatus.configured) {
      log('✓ Configuration is valid', colors.green);
      log('✓ API key found', colors.green);
      log('✓ Service initialized', colors.green);
    } else {
      log('✗ Configuration validation failed:', colors.red);
      configStatus.errors.forEach(err => log(`  - ${err}`, colors.red));
      process.exit(1);
    }

    // Test 3: Initialize Service
    log('\nTest 3: Initializing Claude Service...', colors.blue);
    log('-----------------------------------', colors.blue);

    await claudeService.initialize();
    log('✓ Service initialized successfully', colors.green);

    // Test 4: Simple API Call
    log('\nTest 4: Testing Claude API Call...', colors.blue);
    log('-----------------------------------', colors.blue);

    const messages = [
      {
        role: 'user',
        content: 'Say hello in one word.'
      }
    ];

    log('Sending test message to Claude...', colors.yellow);
    const response = await claudeService.callClaude(messages, {
      maxTokens: 100,
    });

    log('✓ API call successful', colors.green);
    log(`✓ Response: ${response.content[0].text}`, colors.green);
    log(`✓ Model: ${response.model}`, colors.green);
    log(`✓ Tokens - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`, colors.green);

    // Test 5: Code-Related Query
    log('\nTest 5: Testing Code-Related Query...', colors.blue);
    log('-----------------------------------', colors.blue);

    const codeMessages = [
      {
        role: 'user',
        content: 'Write a simple Python function to calculate factorial. Just the code, no explanation.'
      }
    ];

    log('Sending code query to Claude...', colors.yellow);
    const codeResponse = await claudeService.callClaude(codeMessages, {
      maxTokens: 500,
      temperature: 0.5,
    });

    log('✓ Code query successful', colors.green);
    log(`✓ Generated code snippet (first 100 chars): ${codeResponse.content[0].text.substring(0, 100)}...`, colors.green);

    // Test 6: Retry Logic
    log('\nTest 6: Testing Retry Logic...', colors.blue);
    log('-----------------------------------', colors.blue);

    const retryTest = await claudeService.callWithRetry(async () => {
      return await claudeService.callClaude([
        { role: 'user', content: 'Reply with just the word "success"' }
      ], { maxTokens: 50 });
    });

    log('✓ Retry logic works correctly', colors.green);
    log(`✓ Response: ${retryTest.content[0].text}`, colors.green);

    // All tests passed
    log('\n========================================', colors.cyan);
    log('✅ All Tests Passed!', colors.green);
    log('========================================\n', colors.cyan);

    log('Claude Service is ready to use:', colors.cyan);
    log(`  - Model: ${serviceInfo.modelName}`, colors.cyan);
    log(`  - Provider: Direct Anthropic API`, colors.cyan);
    log(`  - Status: Operational`, colors.cyan);

    process.exit(0);

  } catch (error) {
    log('\n========================================', colors.red);
    log('❌ Test Failed', colors.red);
    log('========================================\n', colors.red);
    log(`Error: ${error.message}`, colors.red);
    if (error.stack) {
      log(`\nStack trace:\n${error.stack}`, colors.yellow);
    }
    process.exit(1);
  }
}

// Run the test
testConfiguration();
