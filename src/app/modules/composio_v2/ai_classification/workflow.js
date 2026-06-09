/**
 * @file This module defines and manages the AI classification workflow using Langchain's StateGraph.
 * It orchestrates the process of understanding user intent, identifying relevant tools,
 * extracting parameters, executing actions, and generating responses, supporting both
 * single-step and multi-step workflows. It also handles conversation history persistence.
 * @module composio_v2/ai_classification/workflow
 */

import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { aiClassificationState } from './state.js';
import {
  classifyAppNode,
  classifyActionNode,
  filterRelevantToolsNode,
  extractParametersNode,
  executeToolNode,
  generateResponseNode,
  planWorkflowNode,
  validatePlanNode,
  executeStepNode,
  checkCompletionNode,
  aggregateResultsNode,
  scheduleDetectionNode,
  saveWorkflowNode,
} from './nodes.js';
import { MongoDBSaver } from '../../code/code_assistant/MongoDBSaver.js';
import config from '../../../../../config/index.js';
import { Composio } from '@composio/core';

/**
 * Initializes the Composio SDK with the organization API key from the configuration.
 * This instance is used to interact with Composio's connected accounts API.
 * @type {Composio}
 */
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

/**
 * Creates the AI classification workflow as a StateGraph.
 * This graph defines the states and transitions for processing user requests,
 * from planning to tool execution and response generation.
 * @type {StateGraph}
 */
const workflow = new StateGraph({ channels: aiClassificationState });

// Add all nodes for the AI classification and tool execution process
/**
 * Adds a node to the workflow.
 * @param {string} name - The name of the node.
 * @param {Function} nodeFunction - The function associated with the node.
 */
workflow.addNode('plan_workflow', planWorkflowNode);
workflow.addNode('schedule_detection', scheduleDetectionNode);
workflow.addNode('save_workflow', saveWorkflowNode);
workflow.addNode('validate_plan', validatePlanNode);
workflow.addNode('execute_step', executeStepNode);
workflow.addNode('check_completion', checkCompletionNode);
workflow.addNode('aggregate_results', aggregateResultsNode);

// Legacy single-step nodes (still needed for single-step workflows)
workflow.addNode('classify_app', classifyAppNode);
workflow.addNode('classify_action', classifyActionNode);
workflow.addNode('filter_tools', filterRelevantToolsNode);
workflow.addNode('extract_parameters', extractParametersNode);
workflow.addNode('execute_tool', executeToolNode);
workflow.addNode('generate_response', generateResponseNode);

// Define the workflow edges with conditional routing
workflow.addEdge(START, 'plan_workflow');

// Route to schedule detection after planning
workflow.addEdge('plan_workflow', 'schedule_detection');

/**
 * Adds conditional edges from the 'schedule_detection' node.
 * Routes based on whether scheduling is needed, or the type of workflow (single-step/multi-step).
 * @param {string} sourceNode - The source node ('schedule_detection').
 * @param {function(object): string} condition - A function that determines the next node based on the current state.
 * @param {object} routes - An object mapping condition results to target nodes.
 */
workflow.addConditionalEdges(
  'schedule_detection',
  (state) => {
    console.log('Routing from schedule_detection, state:', state);

    if (state.error) return 'error';
    console.log('Needs scheduling:', state.needsScheduling);

    // If scheduling is needed, save workflow instead of executing
    if (state.needsScheduling) return 'save_workflow';

    // Otherwise, proceed with execution based on workflow type
    if (state.workflowType === 'single_step') return 'single_step';
    if (state.workflowType === 'multi_step') return 'multi_step';

    // Default fallback
    console.log('Defaulting to single_step workflow');
    return 'single_step';
  },
  {
    save_workflow: 'save_workflow',
    single_step: 'classify_app',
    multi_step: 'validate_plan',
    error: 'generate_response',
  }
);

// Scheduled workflow path - save and respond
workflow.addEdge('save_workflow', 'generate_response');

// Multi-step workflow path
workflow.addEdge('validate_plan', 'execute_step');
workflow.addEdge('execute_step', 'check_completion'); // This edge was duplicated, removed one.

/**
 * Adds conditional edges from the 'check_completion' node.
 * Loops back to 'execute_step' if more steps are needed, or proceeds to 'aggregate_results' if complete.
 * @param {string} sourceNode - The source node ('check_completion').
 * @param {function(object): string} condition - A function that determines the next node based on the current state.
 * @param {object} routes - An object mapping condition results to target nodes.
 */
workflow.addConditionalEdges(
  'check_completion',
  (state) => {
    console.log('Routing from check_completion, state:', {
      workflowComplete: state.workflowComplete,
      error: state.error,
      currentStep: state.currentStep,
      totalSteps: state.executionPlan?.length,
    });

    if (state.error) return 'error';
    if (state.workflowComplete) return 'complete';
    return 'continue';
  },
  {
    continue: 'execute_step',
    complete: 'aggregate_results',
    error: 'generate_response',
  }
);

workflow.addEdge('aggregate_results', 'generate_response');

// Single-step workflow path (legacy)
workflow.addEdge('classify_app', 'classify_action');
workflow.addEdge('classify_action', 'filter_tools');
workflow.addEdge('filter_tools', 'extract_parameters');
workflow.addEdge('extract_parameters', 'execute_tool');
workflow.addEdge('execute_tool', 'generate_response');

// All paths end at response generation
workflow.addEdge('generate_response', END);

/**
 * Initializes a checkpointer for the workflow.
 * Initially uses an in-memory saver to avoid blocking startup.
 * This will be upgraded to a MongoDB saver if available.
 * @type {MemorySaver|MongoDBSaver}
 */
let checkpointer = new MemorySaver();

/**
 * The compiled AI classification application instance.
 * This is the executable version of the StateGraph, configured with a checkpointer for state persistence.
 * It is initially compiled with an in-memory checkpointer and later updated with a MongoDB checkpointer.
 * @type {import('@langchain/langgraph').CompiledStateGraph}
 */
export const aiClassificationApp = workflow.compile({
  checkpointer,
  debug: true,
});

// Deferred MongoDB checkpointer upgrade (non-blocking)
MongoDBSaver.fromUri(config.database_local, 'ai_classification_checkpoints')
  .then((mongoCheckpointer) => {
    checkpointer = mongoCheckpointer;
    // Re-compile the workflow with the MongoDB checkpointer and assign it to the existing export
    Object.assign(aiClassificationApp, workflow.compile({ checkpointer, debug: true }));
    console.log('✅ AI classification: MongoDB checkpointer connected');
  })
  .catch((err) => {
    console.warn('⚠️ AI classification: MongoDB checkpointer unavailable, using in-memory fallback:', err.message);
  });

/**
 * Invokes the AI classification agent to process a user input.
 * This function orchestrates the entire workflow, including planning, tool execution,
 * and response generation, while managing conversation history and context.
 *
 * @param {string} userInput - The user's natural language input.
 * @param {object} [options={}] - Optional parameters for the agent invocation.
 * @param {string} [options.userId=null] - The ID of the user initiating the request.
 * @param {string} [options.conversationId=null] - An optional ID for the conversation thread. If not provided, a new one is generated.
 * @param {Array<object>} [options.history=[]] - An array of previous messages in the conversation.
 * @param {boolean} [options.retrieveHistory=true] - Whether to attempt retrieving existing conversation history from the checkpointer.
 * @returns {Promise<object>} A promise that resolves to an object containing the agent's response,
 *   conversation ID, and other relevant metadata.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} message - A descriptive message about the operation's outcome.
 * @property {object} data - The main response data.
 * @property {object} data.responseMessage - The structured response message.
 * @property {string} data.responseMessage.message - The final text response from the agent.
 * @property {string} data.responseMessage.type - The type of workflow executed (e.g., 'single_step', 'multi_step').
 * @property {any} data.responseMessage.executionResult - The raw result of the tool execution.
 * @property {Array<object>} data.responseMessage.toolResults - Results from individual tool steps.
 * @property {object} data.responseMessage.metadata - Additional metadata about the execution.
 * @property {string} data.conversationId - The ID of the conversation thread.
 * @property {number} data.messageCount - The total number of messages in the conversation after this turn.
 * @property {string} data.userType - The type of user ('authenticated').
 * @property {string} [error] - Error message if the operation failed.
 */
export const runAIClassificationAgent = async (userInput, options = {}) => {
  const {
    userId = null,
    conversationId = null,
    history = [],
    retrieveHistory = true,
  } = options;

  const connectedAccounts = userId
    ? await composio.connectedAccounts.list({
        userIds: [userId],
      })
    : [];

  // Generate or use provided conversation ID
  const threadId =
    conversationId || `ai_classification_${userId}_${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  // Retrieve conversation history if requested and conversation exists
  let conversationHistory = history;
  let conversationContext = {
    lastApp: null,
    lastAction: null,
    lastParameters: null,
    recentTools: [],
    userPreferences: {},
    conversationSummary: '',
    turnCount: 0,
  };

  if (retrieveHistory && conversationId) {
    try {
      const existingState = await aiClassificationApp.getState(config);
      if (existingState && existingState.values) {
        conversationHistory = existingState.values.history || history;
        conversationContext =
          existingState.values.conversationContext || conversationContext;
        console.log(
          `Retrieved conversation history with ${conversationHistory.length} messages`
        );
      }
    } catch (error) {
      console.log('No existing conversation found, starting fresh');
    }
  }

  // Add current user input to messages
  const currentMessages = [
    {
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString(),
    },
  ];

  const initialState = {
    userInput,
    userId,
    threadId,
    history: conversationHistory,
    messages: currentMessages,
    conversationContext: {
      ...conversationContext,
      turnCount: conversationContext.turnCount + 1,
    },
    currentStage: 'initial',
    connectedAccounts: connectedAccounts.items || [],

    // Multi-step workflow fields
    workflowType: null,
    requiredApps: null,
    executionPlan: null,
    currentStep: 0,
    stepResults: [],
    stepSummaries: [],
    dependencyGraph: null,
    planningMetadata: null,
    crossStepParameters: {},
    workflowComplete: false,

    metadata: {
      timestamp: new Date(),
      processingStartTime: new Date(),
      conversationId: threadId,
      turnNumber: conversationContext.turnCount + 1,
    },
  };

  try {
    console.log(
      `Starting AI classification for input: "${userInput}" (Conversation: ${threadId})`
    );
    const result = await aiClassificationApp.invoke(initialState, config);
    console.log(`AI classification result for conversation ${threadId}:`);

    // Format response to match search and image modules
    return {
      success: true,
      message: 'Tool execution completed successfully',
      data: {
        responseMessage: {
          message:
            result.finalResponse ||
            result.response ||
            'Action completed successfully',
          type: result.workflowType || 'single_step',
          executionResult: result.executionResult,
          toolResults: result.stepResults || [],
          metadata: {
            identifiedApp: result.identifiedApp,
            identifiedAction: result.identifiedAction,
            confidence: result.confidence,
            workflowType: result.workflowType,
            totalSteps: result.totalSteps || 1,
            executionPlan: result.executionPlan,
            aggregatedResults: result.aggregatedResults,
          },
        },
        conversationId: threadId,
        messageCount: (result.history?.length || 0) + 2, // User message + assistant response
        userType: 'authenticated', // Composio typically requires authentication

        // Additional metadata for debugging/monitoring
        // workflow: {
        //   availableApps: result.availableApps,
        //   availableActions: result.availableActions,
        //   requiredApps: result.requiredApps,
        //   currentStep: result.currentStep,
        //   stepSummaries: result.stepSummaries,
        //   workflowSummary: result.workflowSummary,
        //   planningMetadata: result.planningMetadata,
        //   conversationContext: result.conversationContext,
        //   crossStepParameters: result.crossStepParameters
        // }
      },
    };
  } catch (error) {
    console.error('Error running AI classification agent:', error);
    return {
      success: false,
      message: 'Tool execution failed',
      error: error.message,
      data: {
        responseMessage: {
          text: `Sorry, I encountered an error while processing your request: ${error.message}`,
          type: 'error',
        },
        conversationId: threadId,
        messageCount: 1,
        userType: 'authenticated',
      },
    };
  }
};

/**
 * Retrieves the conversation history for a given conversation ID.
 *
 * @param {string} conversationId - The ID of the conversation to retrieve history for.
 * @returns {Promise<object>} A promise that resolves to an object containing the conversation history
 *   and context, or an error message if retrieval fails.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} message - A descriptive message about the operation's outcome.
 * @property {object} data - The retrieved conversation data.
 * @property {Array<object>} data.history - An array of message objects from the conversation.
 * @property {object} data.conversationContext - The context object for the conversation.
 * @property {object} data.metadata - Additional metadata associated with the conversation state.
 * @property {string} data.conversationId - The ID of the conversation.
 * @property {number} data.messageCount - The number of messages in the history.
 * @property {string} [error] - Error message if the operation failed.
 */
export const getConversationHistory = async (conversationId) => {
  try {
    const config = { configurable: { thread_id: conversationId } };
    const state = await aiClassificationApp.getState(config);

    if (state && state.values) {
      return {
        success: true,
        message: 'Conversation history retrieved successfully',
        data: {
          history: state.values.history || [],
          conversationContext: state.values.conversationContext || {},
          metadata: state.values.metadata || {},
          conversationId,
          messageCount: state.values.history?.length || 0,
        },
      };
    }

    return {
      success: false,
      message: 'Conversation not found',
      data: {
        conversationId,
        messageCount: 0,
      },
    };
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    return {
      success: false,
      message: 'Failed to retrieve conversation history',
      error: error.message,
      data: {
        conversationId,
        messageCount: 0,
      },
    };
  }
};

/**
 * Clears the conversation history and resets the conversation context for a given conversation ID.
 *
 * @param {string} conversationId - The ID of the conversation to clear.
 * @returns {Promise<object>} A promise that resolves to an object indicating the success
 *   or failure of the operation.
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} message - A descriptive message about the operation's outcome.
 * @property {object} data - Data related to the cleared conversation.
 * @property {string} data.conversationId - The ID of the conversation.
 * @property {number} data.messageCount - Always 0 after clearing.
 * @property {string} [error] - Error message if the operation failed.
 */
export const clearConversationHistory = async (conversationId) => {
  try {
    const config = { configurable: { thread_id: conversationId } };
    // Get current state and reset conversation-specific fields
    const currentState = await aiClassificationApp.getState(config);

    if (currentState && currentState.values) {
      const resetState = {
        ...currentState.values,
        history: [],
        messages: [],
        conversationContext: {
          lastApp: null,
          lastAction: null,
          lastParameters: null,
          recentTools: [],
          userPreferences: {},
          conversationSummary: '',
          turnCount: 0,
        },
      };

      await aiClassificationApp.updateState(config, resetState);
      return {
        success: true,
        message: 'Conversation history cleared successfully',
        data: {
          conversationId,
          messageCount: 0,
        },
      };
    }

    return {
      success: false,
      message: 'Conversation not found',
      data: {
        conversationId,
        messageCount: 0,
      },
    };
  } catch (error) {
    console.error('Error clearing conversation history:', error);
    return {
      success: false,
      message: 'Failed to clear conversation history',
      error: error.message,
      data: {
        conversationId,
        messageCount: 0,
      },
    };
  }
};