/**
 * Test script for Legal Contract Generation Module
 * Run with: node scripts/test-legal-contract.js
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api/v1';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';

// Test 1: Create Employment Contract (Conversational)
async function testEmploymentContract() {
  console.log('\n=== Test 1: Employment Contract (Conversational) ===\n');

  try {
    // Step 1: Initial request
    const formData1 = new FormData();
    formData1.append('message', 'I need to create an employment contract for a software developer position');

    const response1 = await axios.post(
      `${BASE_URL}/legal-contract/assistant`,
      formData1,
      {
        headers: formData1.getHeaders(),
      }
    );

    console.log('Step 1 - AI Questions:');
    console.log('Conversation ID:', response1.data.data.conversationId);
    console.log('Contract Type:', response1.data.data.contractType);
    console.log('Questions:');
    response1.data.data.questions?.forEach((q, i) => {
      console.log(`${i + 1}. ${q.question}`);
      console.log(`   Reason: ${q.reason}\n`);
    });

    // Step 2: Provide answers
    const conversationId = response1.data.data.conversationId;
    const formData2 = new FormData();
    formData2.append('message',
      'The employer is TechCorp Inc. located at 123 Tech Street, San Francisco, CA 94105. ' +
      'The position is Senior Software Developer. ' +
      'The salary is $120,000 per year with benefits including health insurance, 401k, and 20 days PTO. ' +
      'The start date is January 1, 2024. ' +
      'The employment is at-will with a 2-week notice period.'
    );
    formData2.append('conversationId', conversationId);

    const response2 = await axios.post(
      `${BASE_URL}/legal-contract/assistant`,
      formData2,
      {
        headers: formData2.getHeaders(),
      }
    );

    console.log('\nStep 2 - Contract Generated:');
    console.log('Success:', response2.data.data.contractGenerated);
    console.log('\nContract Preview (first 500 chars):');
    console.log(response2.data.data.contract?.substring(0, 500) + '...\n');

    return conversationId;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    return null;
  }
}

// Test 2: NDA Contract (Direct Generation)
async function testNDADirect() {
  console.log('\n=== Test 2: NDA Contract (Direct Generation) ===\n');

  try {
    const response = await axios.post(
      `${BASE_URL}/legal-contract/generate`,
      {
        contractType: 'nda',
        complexity: 'standard',
        jurisdiction: 'us_federal',
        parties: [
          {
            name: 'Acme Corporation',
            role: 'disclosing_party',
            address: '456 Business Ave, New York, NY 10001',
          },
          {
            name: 'TechStart Inc.',
            role: 'receiving_party',
            address: '789 Startup Blvd, Austin, TX 78701',
          },
        ],
        terms: {
          type: 'mutual',
          duration: '2 years',
          purpose: 'Exploring potential business partnership',
          confidentialInformation: 'Business plans, financial data, technical specifications',
        },
        additionalInstructions: 'Include standard remedies for breach',
      }
    );

    console.log('Contract Generated:');
    console.log('Conversation ID:', response.data.data.conversationId);
    console.log('Contract Type:', response.data.data.contractType);
    console.log('\nContract Preview (first 500 chars):');
    console.log(response.data.data.contract?.substring(0, 500) + '...\n');

    return response.data.data.conversationId;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    return null;
  }
}

// Test 3: Service Agreement with File Upload
async function testServiceAgreementWithFile() {
  console.log('\n=== Test 3: Service Agreement with File Upload ===\n');

  try {
    const formData = new FormData();
    formData.append('message', 'Create a service agreement for web development services');

    // If you have a test file, uncomment and update path:
    // const testFilePath = './test-files/sample-agreement.pdf';
    // if (fs.existsSync(testFilePath)) {
    //   formData.append('file', fs.createReadStream(testFilePath));
    // }

    const response = await axios.post(
      `${BASE_URL}/legal-contract/assistant`,
      formData,
      {
        headers: formData.getHeaders(),
      }
    );

    console.log('AI Response:');
    console.log('Conversation ID:', response.data.data.conversationId);
    console.log('Contract Type:', response.data.data.contractType);
    console.log('\nQuestions Generated:');
    response.data.data.questions?.forEach((q, i) => {
      console.log(`${i + 1}. ${q.question}`);
    });

    return response.data.data.conversationId;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    return null;
  }
}

// Test 4: Get Conversation History (requires auth)
async function testGetHistory(conversationId) {
  if (!conversationId || !ACCESS_TOKEN) {
    console.log('\n=== Test 4: Skipped (No conversation ID or auth token) ===\n');
    return;
  }

  console.log('\n=== Test 4: Get Conversation History ===\n');

  try {
    const response = await axios.get(
      `${BASE_URL}/legal-contract/conversation/${conversationId}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );

    console.log('Conversation History:');
    console.log('Title:', response.data.data.title);
    console.log('Messages:', response.data.data.messages?.length);
    console.log('Contract Generated:', response.data.data.metadata?.contractGenerated);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Legal Contract Module - Test Suite');
  console.log('=====================================');

  const conversationId1 = await testEmploymentContract();
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s

  const conversationId2 = await testNDADirect();
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s

  const conversationId3 = await testServiceAgreementWithFile();
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s

  await testGetHistory(conversationId1);

  console.log('\n✅ All tests completed!');
  console.log('\nNOTE: This is a draft testing script. Generated contracts should be reviewed by legal professionals.');
}

// Execute tests
runAllTests().catch(console.error);
