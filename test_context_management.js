// Test script for conversation context management
import {
  manageConversationContext,
  shouldTrimContext,
  summarizeConversation
} from '../src/app/modules/search/llm.js';

// Mock long conversation history
const createLongConversation = () => {
  const conversation = [];

  // Add 25 messages to exceed the limit
  for (let i = 1; i <= 25; i++) {
    conversation.push({
      role: 'user',
      content: `User message ${i}: This is a sample user message with some content to test context management. Let me ask about topic ${i}.`,
      timestamp: new Date(Date.now() - (25 - i) * 60000) // 1 minute apart
    });

    conversation.push({
      role: 'assistant',
      content: `Assistant response ${i}: Thank you for your question about topic ${i}. Here's a detailed response that explains the topic with multiple sentences to create substantial content for testing the context management system.`,
      timestamp: new Date(Date.now() - (25 - i) * 60000 + 30000) // 30 seconds after user
    });
  }

  return conversation;
};

async function testContextManagement() {
  console.log("🧪 Testing Conversation Context Management\n");

  try {
    // Test 1: Short conversation (should not be trimmed)
    console.log("📝 Test 1: Short conversation");
    const shortConversation = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am doing well, thank you!' }
    ];

    const shouldTrim1 = shouldTrimContext(shortConversation);
    console.log(`Short conversation (${shortConversation.length} messages) needs trimming: ${shouldTrim1}`);

    const result1 = await manageConversationContext(shortConversation);
    console.log(`Result: Kept ${result1.trimmedHistory.length} messages, context managed: ${result1.contextManaged}\n`);

    // Test 2: Long conversation (should be trimmed and summarized)
    console.log("📝 Test 2: Long conversation");
    const longConversation = createLongConversation();

    const shouldTrim2 = shouldTrimContext(longConversation);
    console.log(`Long conversation (${longConversation.length} messages) needs trimming: ${shouldTrim2}`);

    const result2 = await manageConversationContext(longConversation);
    console.log(`Result: Trimmed ${result2.trimmedMessageCount} messages, kept ${result2.keptMessageCount} messages`);
    console.log(`Context managed: ${result2.contextManaged}`);
    console.log(`Has summary: ${!!result2.conversationSummary}`);

    if (result2.conversationSummary) {
      console.log(`Summary preview: ${result2.conversationSummary.substring(0, 200)}...\n`);
    }

    // Test 3: Existing summary with new messages
    console.log("📝 Test 3: Managing context with existing summary");
    const existingSummary = "Previous conversation covered topics about AI, machine learning, and data science.";
    const newMessages = createLongConversation().slice(-15); // Last 15 messages

    const result3 = await manageConversationContext(newMessages, existingSummary);
    console.log(`Result with existing summary:`);
    console.log(`- Trimmed ${result3.trimmedMessageCount} messages, kept ${result3.keptMessageCount} messages`);
    console.log(`- Context managed: ${result3.contextManaged}`);
    console.log(`- Combined summary length: ${result3.conversationSummary?.length || 0} characters`);

    if (result3.conversationSummary) {
      console.log(`Combined summary preview: ${result3.conversationSummary.substring(0, 300)}...\n`);
    }

    console.log("✅ All context management tests completed successfully!");

  } catch (error) {
    console.error("❌ Error testing context management:", error);
  }
}

// Run the test if this file is executed directly
if (process.argv[1].endsWith('test_context_management.js')) {
  testContextManagement().catch(console.error);
}

export { testContextManagement };