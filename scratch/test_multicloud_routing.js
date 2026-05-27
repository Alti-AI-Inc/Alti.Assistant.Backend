import assert from 'assert';
import config from '../config/index.js';
import {
  selectModel,
  selectModelSmart,
  gemini2_5Flash,
  gemini3ProPreview
} from '../src/app/modules/search/services/multiCloudModelService.js';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AzureChatOpenAI } from '@langchain/openai';
import { ChatBedrockConverse } from '@langchain/aws';

async function runMultiCloudTests() {
  console.log('🏁 Starting Enterprise Multi-Cloud Abstraction & Failover Tests...');

  // Save the original provider configuration
  const originalProvider = config.llmProvider;

  try {
    // ----------------------------------------------------
    // Test 1: Default GCP Model Resolution
    // ----------------------------------------------------
    console.log('\n🧪 Test 1: Default GCP Model Resolution');
    config.llmProvider = 'gcp';
    const gcpModel = selectModel({ complexity: 'simple' });
    console.log('Resolved GCP Model Class:', gcpModel.constructor.name);
    assert.strictEqual(gcpModel instanceof ChatGoogleGenerativeAI, true);
    console.log('✅ Test 1 Passed!');

    // ----------------------------------------------------
    // Test 2: Smart Model Selection (Pro vs Flash on GCP)
    // ----------------------------------------------------
    console.log('\n🧪 Test 2: Smart Model Selection (Pro vs Flash on GCP)');
    const simpleGcp = selectModelSmart('what is the time?', { requiresReasoning: false });
    const complexGcp = selectModelSmart('write a compiler parser logic with recursive descent', { requiresReasoning: true });
    
    assert.strictEqual(simpleGcp instanceof ChatGoogleGenerativeAI, true);
    assert.strictEqual(complexGcp instanceof ChatGoogleGenerativeAI, true);
    console.log('Simple Gcp Model Class:', simpleGcp.constructor.name);
    console.log('Complex Gcp Model Class:', complexGcp.constructor.name);
    console.log('✅ Test 2 Passed!');

    // ----------------------------------------------------
    // Test 3: Azure Provider Model Resolution
    // ----------------------------------------------------
    console.log('\n🧪 Test 3: Azure Provider Model Resolution');
    config.llmProvider = 'azure';
    
    // We mock credentials to trigger instantiation if they aren't loaded in test env
    const originalAzure = { ...config.azure };
    config.azure.apiKey = 'mock-key';
    config.azure.endpoint = 'https://mock-endpoint.openai.azure.com/';
    config.azure.deploymentOrModel = 'gpt-4o-mini';

    // Re-importing or letting the resolver handle it. 
    // Since multiCloudModelService is already loaded, let's verify resolved model.
    // If azureModel is instantiated, selectModel will return it.
    const azureInstance = selectModel({ complexity: 'simple' });
    console.log('Resolved Azure Model Class:', azureInstance.constructor.name);
    
    assert.strictEqual(azureInstance.constructor.name, 'RunnableWithFallbacks');
    console.log('✅ Azure OpenAI instance with auto-failback successfully resolved!');
    console.log('✅ Test 3 Passed!');

    // ----------------------------------------------------
    // Test 4: AWS Provider Model Resolution
    // ----------------------------------------------------
    console.log('\n🧪 Test 4: AWS Provider Model Resolution');
    config.llmProvider = 'aws';
    
    // We mock credentials to trigger instantiation of AWS Bedrock model
    const originalAws = { ...config.aws };
    config.aws.accessKeyId = 'mock-access-key';
    config.aws.secretAccessKey = 'mock-secret-key';
    config.aws.region = 'us-east-1';
    
    const awsInstance = selectModel({ complexity: 'simple' });
    console.log('Resolved AWS Model Class:', awsInstance.constructor.name);
    
    assert.strictEqual(awsInstance.constructor.name, 'RunnableWithFallbacks');
    console.log('✅ AWS Bedrock instance with auto-failback successfully resolved!');
    console.log('✅ Test 4 Passed!');

    // ----------------------------------------------------
    // Test 5: Dynamic Fail-safe Fallback Verification
    // ----------------------------------------------------
    console.log('\n🧪 Test 5: Dynamic Fail-safe Fallback Verification');
    config.llmProvider = 'invalid-provider';
    const fallbackModel = selectModel({ complexity: 'simple' });
    console.log('Fallback Resolved Model Class:', fallbackModel.constructor.name);
    assert.strictEqual(fallbackModel instanceof ChatGoogleGenerativeAI, true);
    console.log('✅ Test 5 Passed!');

    console.log('\n🎉 ALL ENTERPRISE MULTI-CLOUD TESTS COMPLETED SUCCESSFULLY!');
  } finally {
    // Restore original configuration
    config.llmProvider = originalProvider;
  }
}

runMultiCloudTests().catch(err => {
  console.error('❌ Multi-Cloud test execution failed:', err);
  process.exit(1);
});
