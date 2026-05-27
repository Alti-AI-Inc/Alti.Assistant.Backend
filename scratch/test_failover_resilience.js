import config from '../config/index.js';

// 1. Pre-configure config.azure with malformed keys before importing the service
// to force a faulty AzureOpenAI instantiation.
config.llmProvider = 'azure';
config.azure.apiKey = 'totally-invalid-api-key-12345';
config.azure.endpoint = 'https://non-existent-enterprise-azure-endpoint-999.openai.azure.com/';
config.azure.deploymentOrModel = 'gpt-4o-mini';

// 2. Import the service after configuring malformed config parameters
import { selectModel } from '../src/app/modules/search/services/multiCloudModelService.js';
import assert from 'assert';

async function runResilienceTest() {
  console.log('🏁 Starting Cross-Cloud Resilient Failover & High-Availability Test...');
  console.log('📍 Current configured provider:', config.llmProvider);
  console.log('📍 Current configured Azure endpoint:', config.azure.endpoint);

  const model = selectModel({ complexity: 'simple' });
  console.log('Resolved Model instance details:', model.constructor.name);

  // We invoke the model. Because the Azure credentials are completely malformed,
  // the Azure OpenAI call will immediately fail. 
  // Under the hood, withFallbacks should catch the error and execute the GCP/Gemini model successfully.
  try {
    console.log('\n💬 Sending test request (expecting Azure failure -> GCP fallback)...');
    
    const startTime = Date.now();
    const result = await model.invoke('Say hello in exactly one word.');
    const duration = Date.now() - startTime;

    console.log(`\n✅ Response received in ${duration}ms!`);
    console.log('Response content:', result.content);
    
    // Assert that we got a successful answer
    assert.strictEqual(typeof result.content, 'string');
    assert.strictEqual(result.content.length > 0, true);
    
    console.log('\n🎉 CROSS-CLOUD RESILIENT FAILOVER VERIFIED SUCCESSFULLY!');
    console.log('Alti successfully failed over to Google Cloud without throwing any unhandled exception to the user.');
  } catch (error) {
    console.error('❌ Failover test failed: An unhandled exception reached the caller:', error);
    process.exit(1);
  }
}

runResilienceTest().catch(err => {
  console.error('❌ Resilience test runner failed:', err);
  process.exit(1);
});
