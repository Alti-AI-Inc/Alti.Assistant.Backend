/**
 * Test file for AI Classification Module
 * This file demonstrates how to use the AI classification system
 */

import { AuthConfigTypes, Composio, ToolSchema } from '@composio/core';
import { runAIClassificationAgent } from './ai_classification/workflow.js';
import { classifyUserIntent } from './services/aiClassificationService.js';
import config from '../../../../config/index.js';
import Tool from './tools.model.js';
import AuthConfig from './authConfig.model.js';

/**
 * Test AI classification without execution
 */
export const testClassification = async () => {
  const testInputs = [
    'Send an email to john@example.com about the project update',
    // "Create a GitHub issue for the login bug",
    // "Schedule a meeting for tomorrow at 2 PM",
    // "Post a tweet about our new product launch",
    // "Search for React tutorials on YouTube"
  ];

  console.log('=== Testing AI Classification ===\n');

  for (const input of testInputs) {
    try {
      console.log(`Input: "${input}"`);
      const classification = await classifyUserIntent(input, []);
      console.log(`App: ${classification.app}`);
      console.log(`Action: ${classification.action}`);
      console.log(`Confidence: ${classification.confidence}`);
      console.log(`Parameters:`, classification.parameters);
      console.log('---\n');
    } catch (error) {
      console.error(`Error classifying "${input}":`, error.message);
      console.log('---\n');
    }
  }
};

/**
 * Test full workflow (classification + execution)
 * Note: This requires proper Composio setup and user connections
 */
export const testFullWorkflow = async () => {
  const testCases = [
    {
      input: 'Send a test email to test@example.com',
      userId: 'test-user-123',
      conversationId: 'test-conv-456',
    },
  ];

  console.log('=== Testing Full Workflow ===\n');

  for (const testCase of testCases) {
    try {
      console.log(`Input: "${testCase.input}"`);
      console.log(`User ID: ${testCase.userId}`);

      const result = await runAIClassificationAgent(testCase.input, {
        userId: testCase.userId,
        conversationId: testCase.conversationId,
        history: [],
      });

      if (result.success) {
        console.log('✅ Success!');
        console.log(`App: ${result.identifiedApp}`);
        console.log(`Action: ${result.identifiedAction}`);
        console.log(`Response: ${result.response}`);
      } else {
        console.log('❌ Failed!');
        console.log(`Error: ${result.error}`);
      }
      console.log('---\n');
    } catch (error) {
      console.error(`Error in full workflow:`, error.message);
      console.log('---\n');
    }
  }
};

const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});


const getAllConnectedUser = async () => {
  console.log('Getting all connected users for Gmail...');

  const connectedUsers = await composio.connectedAccounts.list({
    appNames: 'gmail',
    status: 'ACTIVE',
    toolkitSlugs: ['gmail']
  });
  for (const user of connectedUsers.items) {
    console.log(`Connected user: ${user.id} toolkit is ${JSON.stringify(user.toolkit)}`);
  }
  console.log('Connected users:', connectedUsers);

}

const createAuthConfig = async () => {
  const apps = await Tool.find({}).distinct('slug');

  const appsAuthConfigs = []
  for (const app of apps) {
    console.log(`Creating Auth Config for app: ${app}`);

    try {
      const authConfig = await composio.authConfigs.create(app, {
        type: AuthConfigTypes.COMPOSIO_MANAGED,
      });
      appsAuthConfigs.push({
        app: authConfig.toolkit,
        authConfigId: authConfig.id,
        authSchema: authConfig.schema,
        isComposioManaged: authConfig.isComposioManaged
      });
    } catch (error) {
      console.error(`Failed to create Auth Config for app ${app}:`, error.message);
    }
  }
  await AuthConfig.insertMany(appsAuthConfigs);
};


/**
 * Interactive test function
 */
export const testInteractive = async (userInput, userId = 'test-user') => {
  try {
    console.log(`\n=== Testing Input: "${userInput}" ===`);

    // Step 1: Test classification
    console.log('Step 1: Classification');
    // const classification = await classifyUserIntent(userInput, []);
    // console.log(`Classified as: ${classification.app} -> ${classification.action}`);
    // console.log(`Confidence: ${classification.confidence}`);

    // // Step 2: Test full workflow
    // console.log("\nStep 2: Full Workflow");
    const result = await runAIClassificationAgent(userInput, {
      userId,
      conversationId: `test-1234567890`,
      history: [],
    });

    if (result.success) {
      console.log('✅ Workflow completed successfully');
      console.log(`Final response: ${result.response}`);
    } else {
      console.log('❌ Workflow failed');
      console.log(`Error: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
};

// Example usage:
// To run tests, you can use:
//
// import { testClassification, testInteractive } from './test.js';
//
// // Test classification only
// await testClassification();
//
// // Test specific input
// await testInteractive("Create a calendar event for the team meeting");
//
// // Test with specific user
// await testInteractive(
//   'Can you get all the branches of the repository emondarock/ws-eng-conduit-ai-assessment',
//   '6891adec96841647d3bc8047'
// );
// await testInteractive(
//   "Can you create a pull request from master to rwa/defect-resolution-v3 with a title 'Testing with composio' the repository",
//   '6891adec96841647d3bc8047'
// );

await getAllConnectedUser();