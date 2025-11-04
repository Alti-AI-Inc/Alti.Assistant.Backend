/**
 * Test script for dedicated code generation endpoint
 */

import dotenv from 'dotenv';
dotenv.config();

// Test the code generation function directly
async function testCodeGeneration() {
  try {
    console.log("🧪 Testing dedicated code generation endpoint...\n");

    const { runCodeGeneration } = await import('./src/app/modules/search/llm.js');

    // Test case: Simple Node.js authentication script
    const testQuery = "Write me a Node.js script for JWT authentication with Express.js";

    console.log(`📝 Test Query: "${testQuery}"`);
    console.log("⏳ Generating code with Claude Sonnet 4.5...\n");

    const result = await runCodeGeneration({
      query: testQuery,
      currentQuery: testQuery,
      conversationContext: [],
      conversationId: null
    });

    console.log("✅ Code Generation Result:");
    console.log("=".repeat(80));
    console.log(result.responseMessage.answer);
    console.log("=".repeat(80));
    console.log("\n📊 Metadata:");
    console.log(JSON.stringify(result.responseMessage.citationMetadata, null, 2));

    console.log("\n✅ Test completed successfully!");
    process.exit(0);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

testCodeGeneration();
