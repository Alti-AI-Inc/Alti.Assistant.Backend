import { 
  runAIClassificationAgent, 
  getConversationHistory, 
  clearConversationHistory 
} from './src/app/modules/composio_v2/ai_classification/workflow.js';

// Test the new two-node workflow with conversation memory
async function testConversationalWorkflow() {
  try {
    console.log('=== Testing Conversational Workflow with Memory ===\n');
    
    const userId = "6891adec96841647d3bc8047";
    const conversationId = "test_conversation_memory_4ww25622222222";
    
    console.log('--- First Turn: Initial Request ---');
    const firstInput = "I want to send an email to john@example.com";
    console.log(`Input: "${firstInput}"`);
    
    const firstResult = await runAIClassificationAgent(firstInput, {
      userId,
      conversationId,
      history: []
    });
    
    console.log('Result:', {
      success: firstResult.success,
      identifiedApp: firstResult.identifiedApp,
      identifiedAction: firstResult.identifiedAction,
      confidence: firstResult.confidence,
      conversationId: firstResult.conversationId,
      error: firstResult.error
    });
    
    console.log('\n--- Second Turn: Follow-up Request ---');
    const secondInput = "Now do the same thing but for mary@example.com";
    console.log(`Input: "${secondInput}"`);
    
    // const secondResult = await runAIClassificationAgent(secondInput, {
    //   userId,
    //   conversationId, // Same conversation
    //   retrieveHistory: true
    // });
    
    // console.log('Result:', {
    //   success: secondResult.success,
    //   identifiedApp: secondResult.identifiedApp,
    //   identifiedAction: secondResult.identifiedAction,
    //   confidence: secondResult.confidence,
    //   usedContext: secondResult.conversationContext,
    //   error: secondResult.error
    // });
    
    // console.log('\n--- Third Turn: Reference to Previous Action ---');
    // const thirdInput = "Actually, let me create a GitHub issue instead";
    // console.log(`Input: "${thirdInput}"`);
    
    // const thirdResult = await runAIClassificationAgent(thirdInput, {
    //   userId,
    //   conversationId, // Same conversation
    //   retrieveHistory: true
    // });
    
    // console.log('Result:', {
    //   success: thirdResult.success,
    //   identifiedApp: thirdResult.identifiedApp,
    //   identifiedAction: thirdResult.identifiedAction,
    //   confidence: thirdResult.confidence,
    //   error: thirdResult.error
    // });
    
    // console.log('\n--- Retrieving Conversation History ---');
    // const historyResult = await getConversationHistory(conversationId);
    // console.log('History retrieved:', historyResult.success);
    // if (historyResult.success) {
    //   console.log('Conversation turns:', historyResult.history.length);
    //   console.log('Context:', historyResult.conversationContext);
    // }
    
    // console.log('\n--- Fourth Turn: Reference to "Again" ---');
    // const fourthInput = "Send the same email again";
    // console.log(`Input: "${fourthInput}"`);
    
    // const fourthResult = await runAIClassificationAgent(fourthInput, {
    //   userId,
    //   conversationId, // Same conversation
    //   retrieveHistory: true
    // });
    
    // console.log('Result:', {
    //   success: fourthResult.success,
    //   identifiedApp: fourthResult.identifiedApp,
    //   identifiedAction: fourthResult.identifiedAction,
    //   confidence: fourthResult.confidence,
    //   reasoning: fourthResult.metadata?.actionClassificationReasoning,
    //   error: fourthResult.error
    // });
    
    // console.log('\n--- Testing Clear History ---');
    // const clearResult = await clearConversationHistory(conversationId);
    // console.log('History cleared:', clearResult.success);
    
  } catch (error) {
    console.error('Error testing conversational workflow:', error);
  }
}

// Test conversation memory utilities
async function testConversationUtilities() {
  console.log('\n=== Testing Conversation Utilities ===\n');
  
  try {
    const testConversationId = "utility_test_789";
    
    // Test with non-existent conversation
    console.log('--- Testing non-existent conversation ---');
    const nonExistentHistory = await getConversationHistory("non_existent_conv");
    console.log('Non-existent conversation result:', nonExistentHistory);
    
    // Create a conversation
    console.log('\n--- Creating new conversation ---');
    const newConvResult = await runAIClassificationAgent("Hello, I want to send a tweet", {
      userId: "test_user_456",
      conversationId: testConversationId
    });
    console.log('New conversation created:', newConvResult.success);
    
    // Retrieve the conversation
    console.log('\n--- Retrieving created conversation ---');
    const retrievedHistory = await getConversationHistory(testConversationId);
    console.log('Retrieved conversation:', retrievedHistory.success);
    
    if (retrievedHistory.success) {
      console.log('Messages in conversation:', retrievedHistory.history.length);
    }
    
  } catch (error) {
    console.error('Error testing conversation utilities:', error);
  }
}

// Run all tests
async function runAllTests() {
  await testConversationalWorkflow();
  // await testConversationUtilities();
  
  console.log('\n=== All Tests Completed ===');
}

// Run the tests
runAllTests();
