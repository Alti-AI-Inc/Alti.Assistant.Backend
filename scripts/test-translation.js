/**
 * Test script for Translation Module
 * Run with: node scripts/test-translation.js
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api/v1';
const API_TOKEN = process.env.API_TOKEN || ''; // Optional for testing with auth

// Helper function to make requests
async function makeRequest(endpoint, method = 'GET', data = null, isFormData = false) {
  const headers = {
    ...(API_TOKEN && { 'Authorization': `Bearer ${API_TOKEN}` }),
    ...(data && !isFormData && { 'Content-Type': 'application/json' })
  };

  const config = {
    method,
    url: `${BASE_URL}${endpoint}`,
    headers
  };

  if (data) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Error in ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
}

// Test 1: Get supported languages
async function testGetSupportedLanguages() {
  console.log('\n=== Test 1: Get Supported Languages ===');

  try {
    const result = await makeRequest('/translation/languages', 'GET');
    console.log('✓ Success!');
    console.log(`Found ${result.data.count} supported languages`);
    console.log('Sample languages:', result.data.languages.slice(0, 5));
  } catch (error) {
    console.log('✗ Failed');
  }
}

// Test 2: Direct text translation
async function testDirectTranslation() {
  console.log('\n=== Test 2: Direct Text Translation ===');

  const data = {
    text: 'Hello, how are you today? I hope you are doing well.',
    targetLanguage: 'es'
  };

  try {
    const result = await makeRequest('/translation/translate', 'POST', data);
    console.log('✓ Success!');
    console.log('Original:', result.data.originalText);
    console.log('Translated:', result.data.translatedText);
    console.log(`Source: ${result.data.sourceLanguageName} → Target: ${result.data.targetLanguageName}`);
  } catch (error) {
    console.log('✗ Failed');
  }
}

// Test 3: Language detection
async function testLanguageDetection() {
  console.log('\n=== Test 3: Language Detection ===');

  const testTexts = [
    'Bonjour, comment allez-vous?',
    'Guten Morgen, wie geht es Ihnen?',
    'こんにちは、お元気ですか？',
    'Hola, ¿cómo estás?'
  ];

  for (const text of testTexts) {
    try {
      const result = await makeRequest('/translation/detect', 'POST', { text });
      console.log(`✓ "${text.substring(0, 30)}..."`);
      console.log(`  Detected: ${result.data.languageName} (${result.data.languageCode})`);
      console.log(`  Confidence: ${(result.data.confidence * 100).toFixed(1)}%`);
    } catch (error) {
      console.log(`✗ Failed for "${text}"`);
    }
  }
}

// Test 4: Conversational assistant - Simple text
async function testConversationalSimple() {
  console.log('\n=== Test 4: Conversational Assistant (Simple) ===');

  const formData = new FormData();
  formData.append('message', 'Translate "Good morning, have a great day!" to French');

  try {
    const result = await makeRequest('/translation/assistant', 'POST', formData, true);
    console.log('✓ Success!');
    console.log('Assistant Response:', result.data.message);
    if (result.data.translation) {
      console.log('Translation:', result.data.translation.translatedText);
    }
    console.log('Conversation ID:', result.data.conversationId);
  } catch (error) {
    console.log('✗ Failed');
  }
}

// Test 5: Conversational assistant - Multi-turn
async function testConversationalMultiTurn() {
  console.log('\n=== Test 5: Conversational Assistant (Multi-turn) ===');

  let conversationId = null;

  // Turn 1
  try {
    console.log('\nTurn 1: Initial request');
    const formData1 = new FormData();
    formData1.append('message', 'I need to translate something');

    const result1 = await makeRequest('/translation/assistant', 'POST', formData1, true);
    conversationId = result1.data.conversationId;
    console.log('Assistant:', result1.data.message);
  } catch (error) {
    console.log('✗ Turn 1 failed');
    return;
  }

  // Turn 2
  try {
    console.log('\nTurn 2: Specify language');
    const formData2 = new FormData();
    formData2.append('message', 'Spanish');
    formData2.append('conversationId', conversationId);

    const result2 = await makeRequest('/translation/assistant', 'POST', formData2, true);
    console.log('Assistant:', result2.data.message);
  } catch (error) {
    console.log('✗ Turn 2 failed');
    return;
  }

  // Turn 3
  try {
    console.log('\nTurn 3: Provide text');
    const formData3 = new FormData();
    formData3.append('message', 'Thank you for your help!');
    formData3.append('conversationId', conversationId);

    const result3 = await makeRequest('/translation/assistant', 'POST', formData3, true);
    console.log('✓ Multi-turn conversation complete!');
    console.log('Assistant:', result3.data.message);
    if (result3.data.translation) {
      console.log('Final Translation:', result3.data.translation.translatedText);
    }
  } catch (error) {
    console.log('✗ Turn 3 failed');
  }
}

// Test 6: File translation (requires a test file)
async function testFileTranslation() {
  console.log('\n=== Test 6: File Translation ===');

  // Create a simple test file
  const testFilePath = path.join(process.cwd(), 'test-translation-doc.txt');
  const testContent = 'This is a test document.\nIt has multiple lines.\nWe will translate it to French.';

  try {
    // Create test file
    fs.writeFileSync(testFilePath, testContent);
    console.log('Created test file:', testFilePath);

    const formData = new FormData();
    formData.append('message', 'Translate this document to French');
    formData.append('file', fs.createReadStream(testFilePath));

    const result = await makeRequest('/translation/assistant', 'POST', formData, true);
    console.log('✓ Success!');
    console.log('Assistant:', result.data.message);
    if (result.data.translation) {
      console.log('Original text length:', result.data.translation.originalText.length);
      console.log('Translated text:', result.data.translation.translatedText.substring(0, 100) + '...');
    }

    // Cleanup
    fs.unlinkSync(testFilePath);
    console.log('Cleaned up test file');
  } catch (error) {
    console.log('✗ Failed');
    // Cleanup on error
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

// Test 7: Multiple languages batch test
async function testMultipleLanguages() {
  console.log('\n=== Test 7: Multiple Languages Batch ===');

  const text = 'Hello, world!';
  const languages = [
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
    { code: 'zh-CN', name: 'Chinese' }
  ];

  console.log(`Original text: "${text}"\n`);

  for (const lang of languages) {
    try {
      const result = await makeRequest('/translation/translate', 'POST', {
        text,
        targetLanguage: lang.code
      });
      console.log(`✓ ${lang.name}: ${result.data.translatedText}`);
    } catch (error) {
      console.log(`✗ ${lang.name}: Failed`);
    }
  }
}

// Main test runner
async function runTests() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   Translation Module Test Suite           ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Auth: ${API_TOKEN ? 'Enabled' : 'Disabled (Guest mode)'}`);

  try {
    await testGetSupportedLanguages();
    await testDirectTranslation();
    await testLanguageDetection();
    await testConversationalSimple();
    await testConversationalMultiTurn();
    await testFileTranslation();
    await testMultipleLanguages();

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   All Tests Complete!                      ║');
    console.log('╚════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n❌ Test suite encountered an error:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
