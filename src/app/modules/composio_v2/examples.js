/**
 * Example usage of the AI Classification Module
 * This shows how to integrate the module into your application
 */

import { aiClassificationService } from './aiClassification.service.js';
// Assuming classifyUserIntent is a method of aiClassificationService,
// the direct import from './services/aiClassificationService.js' is redundant
// and potentially confusing if aiClassificationService is meant to be the
// primary interface for all classification functionalities.
// The example will be updated to use aiClassificationService.classifyUserIntent.
// import { classifyUserIntent } from './services/aiClassificationService.js'; // Removed

/**
 * Example 1: Simple classification
 * Demonstrates how to use the `classifyUserIntent` function to identify the
 * intended application, action, and parameters from a given user input.
 *
 * @returns {Promise<object|undefined>} A promise that resolves to the classification result object
 *   containing `app`, `action`, `confidence`, and `parameters`, or `undefined` if an error occurs.
 * @example
 * const classification = await example1_Classification();
 * // Expected output in console:
 * // Classification Result:
 * // - App: gmail
 * // - Action: send_email
 * // - Confidence: 0.95 (or similar)
 * // - Parameters: { ... }
 */
export const example1_Classification = async () => {
  const userInput =
    'Send an email to the marketing team about the campaign results';

  try {
    // Using aiClassificationService.classifyUserIntent for consistency
    // with the overall aiClassificationService module.
    const classification = await aiClassificationService.classifyUserIntent(userInput);

    console.log('Classification Result:');
    console.log('- App:', classification.app); // "gmail"
    console.log('- Action:', classification.action); // "send_email"
    console.log('- Confidence:', classification.confidence); // 0.95
    console.log('- Parameters:', classification.parameters);

    return classification;
  } catch (error) {
    console.error('Classification failed:', error);
  }
};

/**
 * Example 2: Full processing with execution
 * Demonstrates the end-to-end processing of user input, including classification
 * and potential execution of the identified action using `aiClassificationService.processUserInputService`.
 *
 * @returns {Promise<object|undefined>} A promise that resolves to the processing result object
 *   containing `success`, `data` (with `identifiedApp`, `identifiedAction`, `executionResult`, `response`),
 *   or `error`, or `undefined` if an unhandled error occurs.
 * @example
 * const result = await example2_FullProcessing();
 * // Expected output in console:
 * // Processing Result:
 * // - App: github
 * // - Action: create_issue
 * // - Execution Result: { ... } (if successful)
 * // - User Response: "I've created a GitHub issue..."
 */
export const example2_FullProcessing = async () => {
  const userInput =
    'Create a GitHub issue for the login bug with high priority';
  const userId = 'user-123';

  try {
    const result = await aiClassificationService.processUserInputService(
      userInput,
      {
        userId,
        conversationId: `chat-${Date.now()}`,
      }
    );

    if (result.success) {
      console.log('Processing Result:');
      console.log('- App:', result.data.identifiedApp); // "github"
      console.log('- Action:', result.data.identifiedAction); // "create_issue"
      console.log('- Execution Result:', result.data.executionResult);
      console.log('- User Response:', result.data.response);
    } else {
      console.log('Processing failed:', result.error);
    }

    return result;
  } catch (error) {
    console.error('Processing failed:', error);
  }
};

/**
 * Example 3: Check user connections before processing
 * Illustrates how to retrieve a user's connected accounts using
 * `aiClassificationService.getUserConnectedAccountsService` and then
 * conditionally process user input based on available connections.
 *
 * @returns {Promise<object|undefined>} A promise that resolves to the connections result object
 *   containing `success` and `data` (an object mapping app names to connection details),
 *   or `undefined` if an error occurs.
 * @example
 * const connections = await example3_CheckConnections();
 * // Expected output in console:
 * // User Connected Apps: [ 'gmail', 'github' ] (or similar)
 * // Has Gmail: true
 * // Has GitHub: true
 * // Email processing: ✅
 * // GitHub processing: ✅
 */
export const example3_CheckConnections = async () => {
  const userId = 'user-123';

  try {
    // Check what apps the user has connected
    const connections =
      await aiClassificationService.getUserConnectedAccountsService(userId);

    if (connections.success) {
      console.log('User Connected Apps:', Object.keys(connections.data));

      // Check specific app
      const hasGmail =
        connections.data.gmail && connections.data.gmail.length > 0;
      const hasGithub =
        connections.data.github && connections.data.github.length > 0;

      console.log('Has Gmail:', hasGmail);
      console.log('Has GitHub:', hasGithub);

      if (hasGmail) {
        // User can send emails
        const emailResult =
          await aiClassificationService.processUserInputService(
            'Send a test email to test@example.com',
            { userId }
          );
        console.log('Email processing:', emailResult.success ? '✅' : '❌');
      }

      if (hasGithub) {
        // User can create GitHub issues
        const githubResult =
          await aiClassificationService.processUserInputService(
            'Create an issue for the database connection bug',
            { userId }
          );
        console.log('GitHub processing:', githubResult.success ? '✅' : '❌');
      }
    }

    return connections;
  } catch (error) {
    console.error('Connection check failed:', error);
  }
};

/**
 * Example 4: Conversation context
 * Demonstrates how to maintain and pass conversation history to the
 * `aiClassificationService.processUserInputService` to enable context-aware
 * processing across multiple user messages.
 *
 * @returns {Promise<void>} A promise that resolves when the conversation simulation is complete.
 * @example
 * await example4_ConversationContext();
 * // Expected output in console:
 * // User: I need to email the team
 * // Bot: Who should I send it to?
 * // User: Send it to marketing@company.com
 * // Bot: What should the subject be?
 * // User: The subject should be 'Weekly Update'
 * // Bot: What should the email content be?
 * // User: Add a summary of this week's progress
 * // Bot: I've drafted an email to marketing@company.com with the subject 'Weekly Update' and a summary of this week's progress. Would you like me to send it?
 * // ✅ Action completed!
 */
export const example4_ConversationContext = async () => {
  const userId = 'user-123';
  const conversationId = `conv-${Date.now()}`;

  // Simulate a conversation
  const messages = [
    'I need to email the team',
    'Send it to marketing@company.com',
    "The subject should be 'Weekly Update'",
    "Add a summary of this week's progress",
  ];

  let history = [];

  for (const message of messages) {
    try {
      console.log(`\nUser: ${message}`);

      const result = await aiClassificationService.processUserInputService(
        message,
        {
          userId,
          conversationId,
          history,
        }
      );

      if (result.success) {
        console.log(`Bot: ${result.data.response}`);

        // Add to conversation history
        history.push(
          { role: 'user', content: message },
          { role: 'assistant', content: result.data.response }
        );

        // If action was executed successfully, break
        if (result.data.executionResult) {
          console.log('✅ Action completed!');
          break;
        }
      } else {
        console.log(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Message processing failed:', error);
    }
  }
};

/**
 * Example 5: Batch processing
 * Demonstrates how to process multiple user inputs concurrently using
 * `Promise.allSettled` and `aiClassificationService.processUserInputService`,
 * useful for handling a queue of requests.
 *
 * @returns {Promise<PromiseSettledResult<object>[]>} A promise that resolves to an array of
 *   `PromiseSettledResult` objects, each containing the outcome of a batch request.
 * @example
 * const results = await example5_BatchProcessing();
 * // Expected output in console:
 * // Processing batch requests...
 * //
 * // Batch Results:
 * // 1. Create a calendar event for tomorrow 2pm team meeting
 * //    User: user-1
 * //    Status: ✅
 * //    App/Action: calendar/create_event
 * //    Response: I've created a calendar event...
 * //
 * // 2. Post a tweet about our product launch
 * //    User: user-2
 * //    Status: ✅
 * //    App/Action: twitter/post_tweet
 * //    Response: I've posted a tweet...
 * // ...and so on for other requests.
 */
export const example5_BatchProcessing = async () => {
  const requests = [
    {
      input: 'Create a calendar event for tomorrow 2pm team meeting',
      userId: 'user-1',
    },
    { input: 'Post a tweet about our product launch', userId: 'user-2' },
    { input: 'Search for Node.js tutorials on YouTube', userId: 'user-3' },
    {
      input: 'Create a new Notion page for project documentation',
      userId: 'user-4',
    },
  ];

  console.log('Processing batch requests...');

  const results = await Promise.allSettled(
    requests.map(async (req) => {
      try {
        const result = await aiClassificationService.processUserInputService(
          req.input,
          {
            userId: req.userId,
          }
        );

        return {
          input: req.input,
          userId: req.userId,
          success: result.success,
          app: result.success ? result.data.identifiedApp : null,
          action: result.success ? result.data.identifiedAction : null,
          response: result.success ? result.data.response : result.error,
        };
      } catch (error) {
        return {
          input: req.input,
          userId: req.userId,
          success: false,
          error: error.message,
        };
      }
    })
  );

  console.log('\nBatch Results:');
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const data = result.value;
      console.log(`${index + 1}. ${data.input}`);
      console.log(`   User: ${data.userId}`);
      console.log(`   Status: ${data.success ? '✅' : '❌'}`);
      if (data.success) {
        console.log(`   App/Action: ${data.app}/${data.action}`);
        console.log(`   Response: ${data.response}`);
      } else {
        console.log(`   Error: ${data.error}`);
      }
      console.log();
    }
  });

  return results;
};

// Usage Examples:
//
// import * as examples from './examples.js';
//
// // Run individual examples
// await examples.example1_Classification();
// await examples.example2_FullProcessing();
// await examples.example3_CheckConnections();
// await examples.example4_ConversationContext();
// await examples.example5_BatchProcessing();

/**
 * Runs all available AI Classification Module examples sequentially.
 * This function orchestrates the execution of each example to demonstrate
 * various functionalities of the module.
 *
 * @returns {Promise<void>} A promise that resolves when all examples have been run.
 * @example
 * await runAllExamples();
 * // This will print the output of all five examples to the console.
 */
export const runAllExamples = async () => {
  console.log('=== AI Classification Module Examples ===\n');

  try {
    console.log('1. Simple Classification');
    await example1_Classification();

    console.log('\n2. Full Processing');
    await example2_FullProcessing();

    console.log('\n3. Check Connections');
    await example3_CheckConnections();

    console.log('\n4. Conversation Context');
    await example4_ConversationContext();

    console.log('\n5. Batch Processing');
    await example5_BatchProcessing();
  } catch (error) {
    console.error('Example execution failed:', error);
  }
};