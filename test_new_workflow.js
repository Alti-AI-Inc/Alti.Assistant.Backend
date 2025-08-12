import { runAIClassificationAgent } from './src/app/modules/composio_v2/ai_classification/workflow.js';

// Test the new two-node workflow
async function testNewWorkflow() {
  try {
    console.log('Testing new two-node workflow...');
    
    const testInput = "I want to send an email to john@example.com";
    const options = {
      userId: "test_user_123",
      conversationId: "test_conversation_456",
      history: []
    };
    
    console.log(`\nTesting with input: "${testInput}"`);
    
    const result = await runAIClassificationAgent(testInput, options);
    
    console.log('\n=== WORKFLOW RESULT ===');
    console.log('Success:', result.success);
    console.log('Available Apps:', result.availableApps);
    console.log('Available Actions:', result.availableActions);
    console.log('Identified App:', result.identifiedApp);
    console.log('Identified Action:', result.identifiedAction);
    console.log('Confidence:', result.confidence);
    console.log('Error:', result.error);
    console.log('Metadata:', result.metadata);
    
  } catch (error) {
    console.error('Error testing workflow:', error);
  }
}

// Run the test
testNewWorkflow();
