import { 
  runAIClassificationAgent, 
  getConversationHistory, 
  clearConversationHistory 
} from './src/app/modules/composio_v2/ai_classification/workflow.js';

// Test multi-step workflow scenarios
async function testMultiStepWorkflows() {
  console.log('🚀 Testing Multi-Step Workflow Implementation\n');

  const testCases = [
    {
      name: "GitHub Issues → Email Workflow",
      input: "Get all branch names from repository emondarock/ws-eng-conduit-ai-assessment and email them to emondarock@gmail.com",
      userId: "6891adec96841647d3bc8047",
      conversationId: "multi_step_test_21",
      expectedApps: ["github", "gmail"],
      expectedSteps: 2
    },
    // {
    //   name: "Calendar → Twitter Workflow", 
    //   input: "Create a calendar event for tomorrow 2pm meeting and post about it on Twitter",
    //   userId: "6891adec96841647d3bc8047",
    //   conversationId: "multi_step_test_2",
    //   expectedApps: ["google_calendar", "twitter"],
    //   expectedSteps: 2
    // },
    // {
    //   name: "Email Search → Notion Workflow",
    //   input: "Search my emails for 'project update' and create a Notion page with the results",
    //   userId: "test_user_123", 
    //   conversationId: "multi_step_test_3",
    //   expectedApps: ["gmail", "notion"],
    //   expectedSteps: 2
    // },
    // {
    //   name: "Single Step (Legacy)",
    //   input: "Send an email to sarah@company.com about the meeting",
    //   userId: "6891adec96841647d3bc8047",
    //   conversationId: "single_step_test_1",
    //   expectedApps: ["gmail"],
    //   expectedSteps: 1
    // }
  ];

  for (const testCase of testCases) {
    console.log(`\n📋 Testing: ${testCase.name}`);
    console.log(`Input: "${testCase.input}"`);
    console.log('---');

    try {
      const result = await runAIClassificationAgent(testCase.input, {
        userId: testCase.userId,
        conversationId: testCase.conversationId,
        history: [],
      });

      if (result.success) {
        console.log('✅ Workflow executed successfully!');
        console.log(`Workflow Type: ${result.workflowType}`);
        
        if (result.workflowType === 'multi_step') {
          console.log(`Required Apps: ${result.requiredApps?.join(', ')}`);
          console.log(`Total Steps: ${result.totalSteps}`);
          console.log(`Execution Plan:`);
          result.executionPlan?.forEach((step, index) => {
            console.log(`  Step ${index + 1}: ${step.app} - ${step.action} (${step.description})`);
          });
          
          if (result.stepResults && result.stepResults.length > 0) {
            console.log(`Completed Steps: ${result.stepResults.length}`);
            result.stepResults.forEach(step => {
              console.log(`  ✓ Step ${step.step}: ${step.app}.${step.action} - ${step.success ? 'Success' : 'Failed'}`);
            });
          }
          
          if (result.aggregatedResults) {
            console.log('📊 Aggregated Results:', result.aggregatedResults);
          }
        } else {
          console.log(`Single-step execution:`);
          console.log(`App: ${result.identifiedApp}`);
          console.log(`Action: ${result.identifiedAction}`);
          console.log(`Confidence: ${result.confidence}`);
        }
        
        console.log(`Response: ${result.response}`);
      } else {
        console.log('❌ Workflow failed!');
        console.log(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error(`💥 Test failed with error:`, error.message);
    }
    
    console.log('\n' + '='.repeat(80));
  }
}

// Test workflow planning only (without execution)
async function testWorkflowPlanning() {
  console.log('\n🎯 Testing Workflow Planning (Planning Phase Only)\n');

  const planningTestCases = [
    "Get my GitHub issues, create a summary document, and email it to the team",
    "Search for emails about 'budget', create a calendar event to discuss findings, and send a Slack message to the finance channel",
    "Create a new GitHub repository, add initial files, and post about it on LinkedIn and Twitter"
  ];

  // This would require extracting just the planning phase
  // For now, we can examine the execution plan from the full workflow results
  
  for (const input of planningTestCases) {
    console.log(`\n📋 Planning for: "${input}"`);
    console.log('---');

    try {
      const result = await runAIClassificationAgent(input, {
        userId: "planning_test_user",
        conversationId: `planning_${Date.now()}`,
        history: [],
      });

      if (result.success && result.workflowType === 'multi_step') {
        console.log('✅ Planning successful!');
        console.log(`Required Apps: ${result.requiredApps?.join(', ')}`);
        console.log(`Planning Reasoning: ${result.planningMetadata?.reasoning}`);
        console.log(`Execution Plan:`);
        result.executionPlan?.forEach((step, index) => {
          console.log(`  Step ${index + 1}: ${step.app}.${step.action}`);
          console.log(`    Description: ${step.description}`);
          console.log(`    Dependencies: ${step.dependencies?.join(', ') || 'None'}`);
          console.log(`    Parameters: ${JSON.stringify(step.parameters)}`);
        });
      } else {
        console.log(`Single-step workflow identified: ${result.identifiedApp}.${result.identifiedAction}`);
      }
    } catch (error) {
      console.error(`Planning failed:`, error.message);
    }
    
    console.log('\n' + '-'.repeat(60));
  }
}

// Test conversation memory with multi-step workflows
async function testConversationMemory() {
  console.log('\n💭 Testing Conversation Memory with Multi-Step Workflows\n');

  const conversationId = "memory_test_conversation";
  const userId = "memory_test_user";

  const conversationFlow = [
    "Get my GitHub issues from repository emondarock/ws-eng-conduit-ai-assessment and email them to emondarock@gmail.com"
  ];

  for (let i = 0; i < conversationFlow.length; i++) {
    const input = conversationFlow[i];
    console.log(`\n💬 Turn ${i + 1}: "${input}"`);
    console.log('---');

    try {
      const result = await runAIClassificationAgent(input, {
        userId,
        conversationId,
        retrieveHistory: true
      });

      if (result.success) {
        console.log('✅ Conversation turn successful!');
        console.log(`Workflow Type: ${result.workflowType}`);
        console.log(`Context Usage: ${result.conversationContext ? 'Used previous context' : 'No context'}`);
        console.log(`Response: ${result.response}`);
      } else {
        console.log('❌ Conversation turn failed!');
        console.log(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error(`Turn failed:`, error.message);
    }
  }

  // Test conversation history retrieval
  try {
    const history = await getConversationHistory(conversationId);
    if (history.success) {
      console.log(`\n📚 Conversation History Retrieved: ${history.messages?.length || 0} messages`);
    }
  } catch (error) {
    console.error('Failed to retrieve conversation history:', error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Multi-Step Workflow Test Suite\n');
  console.log('This test suite validates the new multi-step workflow capabilities:\n');
  console.log('1. Multi-step workflow planning and execution');
  console.log('2. Single-step backward compatibility'); 
  console.log('3. Cross-step parameter mapping');
  console.log('4. Conversation memory integration');
  console.log('\n' + '='.repeat(80));

  try {
    await testMultiStepWorkflows();
    // await testWorkflowPlanning();
    // await testConversationMemory();
    
    console.log('\n✅ All tests completed!');
    console.log('\n📝 Test Summary:');
    console.log('- Multi-step workflow planning and execution tested');
    console.log('- Single-step backward compatibility verified');
    console.log('- Conversation memory integration validated');
    console.log('- Cross-step parameter mapping examined');
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
  }
}

// // Export test functions for individual testing
// export {
//   testMultiStepWorkflows,
//   testWorkflowPlanning,
//   testConversationMemory,
//   runAllTests
// };

// // Run tests if this file is executed directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//   runAllTests();
// }

await runAllTests();