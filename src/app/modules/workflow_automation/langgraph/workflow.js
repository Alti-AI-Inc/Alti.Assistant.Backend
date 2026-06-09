import { StateGraph, END, START } from '@langchain/langgraph';
import { workflowAutomationState } from './state.js';
import {
  analyzeIntentNode,
  planWorkflowNode,
  scheduleDetectionNode,
  extractParametersNode,
  validateWorkflowNode,
  generateResponseNode,
  executeWorkflowNode,
  autoHealWorkflowNode,
} from './nodes.js';
import { MongoDBSaver } from './mongodbSaver.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Represents the core workflow automation graph using LangGraph's StateGraph.
 * This graph defines the sequence of operations for processing a user's request,
 * from intent analysis to workflow execution and response generation.
 *
 * @type {StateGraph<import('./state.js').WorkflowAutomationState>}
 */
const workflow = new StateGraph({ channels: workflowAutomationState });

// Add nodes to the workflow
workflow.addNode('analyze_intent', analyzeIntentNode);
workflow.addNode('plan_workflow', planWorkflowNode);
workflow.addNode('schedule_detection', scheduleDetectionNode);
workflow.addNode('extract_parameters', extractParametersNode);
workflow.addNode('validate_workflow', validateWorkflowNode);
workflow.addNode('auto_heal', autoHealWorkflowNode);
workflow.addNode('execute_workflow', executeWorkflowNode);
workflow.addNode('generate_response', generateResponseNode);

// Define the workflow edges
workflow.addEdge(START, 'analyze_intent');

/**
 * Routes the workflow from 'analyze_intent'.
 * If an error occurred during intent analysis, it transitions to 'generate_response'.
 * Otherwise, it proceeds to 'plan_workflow'.
 */
workflow.addConditionalEdges(
  'analyze_intent',
  (state) => {
    if (state.error) return 'generate_response';
    return 'plan_workflow';
  },
  {
    generate_response: 'generate_response',
    plan_workflow: 'plan_workflow',
  }
);

/**
 * Routes the workflow from 'plan_workflow'.
 * If an error occurred during workflow planning, it transitions to 'generate_response'.
 * Otherwise, it proceeds to 'schedule_detection'.
 */
workflow.addConditionalEdges(
  'plan_workflow',
  (state) => {
    if (state.error) return 'generate_response';
    return 'schedule_detection';
  },
  {
    generate_response: 'generate_response',
    schedule_detection: 'schedule_detection',
  }
);

/**
 * Routes the workflow from 'schedule_detection'.
 * If an error occurred during schedule detection, it transitions to 'generate_response'.
 * Otherwise, it proceeds to 'extract_parameters'.
 */
workflow.addConditionalEdges(
  'schedule_detection',
  (state) => {
    if (state.error) return 'generate_response';
    return 'extract_parameters';
  },
  {
    generate_response: 'generate_response',
    extract_parameters: 'extract_parameters',
  }
);

/**
 * Routes the workflow from 'extract_parameters'.
 * If an error occurred during parameter extraction, it transitions to 'generate_response'.
 * Otherwise, it proceeds to 'validate_workflow'.
 */
workflow.addConditionalEdges(
  'extract_parameters',
  (state) => {
    if (state.error) return 'generate_response';
    return 'validate_workflow';
  },
  {
    generate_response: 'generate_response',
    validate_workflow: 'validate_workflow',
  }
);

/**
 * Routes the workflow from 'validate_workflow'.
 * - If an error occurred, it transitions to 'generate_response'.
 * - If the workflow plan is valid and all necessary connections are present, it proceeds to 'execute_workflow'.
 * - If the plan is invalid and has not been healed yet, it transitions to 'auto_heal'.
 * - Otherwise (e.g., valid plan but missing connections requiring user confirmation), it transitions to 'generate_response'.
 */
workflow.addConditionalEdges(
  'validate_workflow',
  (state) => {
    if (state.error) return 'generate_response';
    
    const isValid = state.validationResult?.isValid !== false;
    const noMissing = !state.validationResult?.missingConnections?.length;
    
    if (isValid && noMissing) {
      return 'execute_workflow';
    }
    
    // If there are validation errors (invalid plan) and we haven't already healed it, trigger self-healing
    if (!isValid && state.currentStage !== 'healed') {
      return 'auto_heal';
    }
    
    // Otherwise, generate confirmation message with connection URLs or parameters needed
    return 'generate_response';
  },
  {
    execute_workflow: 'execute_workflow',
    auto_heal: 'auto_heal',
    generate_response: 'generate_response',
  }
);

/**
 * Defines an edge from 'auto_heal' back to 'validate_workflow'.
 * After an attempt to auto-heal the workflow, it re-validates the repaired plan.
 */
workflow.addEdge('auto_heal', 'validate_workflow');

/**
 * Defines an edge from 'execute_workflow' to 'generate_response'.
 * After successful execution of the workflow, it proceeds to generate a final response.
 */
workflow.addEdge('execute_workflow', 'generate_response');

/**
 * Defines the final edge from 'generate_response' to END.
 * This marks the completion of the workflow automation process.
 */
workflow.addEdge('generate_response', END);

/**
 * An instance of MongoDBSaver used as a checkpointer for persisting workflow states.
 * This allows for resuming conversations and tracking workflow progress.
 * @type {MongoDBSaver}
 */
const checkpointer = new MongoDBSaver();

/**
 * The compiled workflow automation graph.
 * This is the executable instance of the workflow, configured with a MongoDB checkpointer
 * for state persistence across invocations.
 *
 * @type {import('@langchain/langgraph').CompiledStateGraph<import('./state.js').WorkflowAutomationState>}
 */
export const workflowAutomationGraph = workflow.compile({ checkpointer });

/**
 * Processes a user prompt through the workflow automation pipeline.
 * This function initiates a new workflow thread or links to an existing one,
 * guiding the request through intent analysis, planning, validation, and execution.
 *
 * @param {string} userPrompt - The initial prompt or request from the user.
 * @param {string} userId - The ID of the user initiating the request.
 * @param {string} [conversationId=null] - Optional. An existing conversation ID to link this request to.
 *                                         If null, a new unique conversation ID will be generated.
 * @returns {Promise<{
 *   success: boolean,
 *   result?: object,
 *   conversationId: string,
 *   error?: string
 * }>} An object containing the success status, the final workflow result,
 *     the conversation ID, and an error message if applicable.
 */
export const processWorkflowRequest = async (
  userPrompt,
  userId,
  conversationId = null
) => {
  try {
    logger.info(`Processing workflow request for user ${userId}`);

    const config = {
      configurable: {
        thread_id: conversationId || `workflow_${userId}_${Date.now()}`,
      },
    };

    const initialState = {
      userPrompt,
      userId,
      conversationId: config.configurable.thread_id,
      currentStage: 'init',
    };

    // Run the workflow
    const result = await workflowAutomationGraph.invoke(initialState, config);

    logger.info(`Workflow processing completed for user ${userId}`);
    return {
      success: true,
      result,
      conversationId: config.configurable.thread_id,
    };
  } catch (error) {
    logger.error('Error processing workflow request:', error);
    return {
      success: false,
      error: error.message,
      result: {
        response:
          'I apologize, but I encountered an error processing your request. Please try again or contact support.',
        responseType: 'error',
      },
    };
  }
};

/**
 * Continues an existing conversation within a workflow thread.
 * This function retrieves the current state of a specified conversation and
 * updates it with new user input, then re-invokes the workflow.
 *
 * @param {string} userInput - The new input from the user to continue the conversation.
 * @param {string} conversationId - The ID of the existing conversation thread to continue.
 * @param {string} userId - The ID of the user continuing the conversation.
 * @returns {Promise<{
 *   success: boolean,
 *   result?: object,
 *   conversationId: string,
 *   error?: string
 * }>} An object containing the success status, the final workflow result,
 *     the conversation ID, and an error message if applicable.
 */
export const continueWorkflowConversation = async (
  userInput,
  conversationId,
  userId
) => {
  try {
    logger.info(
      `Continuing workflow conversation ${conversationId} for user ${userId}`
    );

    const config = {
      configurable: {
        thread_id: conversationId,
      },
    };

    // Get current state
    const currentState = await workflowAutomationGraph.getState(config);

    if (!currentState) {
      throw new Error('Conversation not found');
    }

    // Update state with new user input
    const updatedState = {
      ...currentState.values,
      userPrompt: userInput,
      currentStage: 'continued',
    };

    // Continue the workflow
    const result = await workflowAutomationGraph.invoke(updatedState, config);

    logger.info(`Workflow conversation continued for ${conversationId}`);
    return {
      success: true,
      result,
      conversationId,
    };
  } catch (error) {
    logger.error('Error continuing workflow conversation:', error);
    return {
      success: false,
      error: error.message,
      result: {
        response:
          'I apologize, but I encountered an error continuing our conversation. Please try starting a new workflow request.',
        responseType: 'error',
      },
    };
  }
};

/**
 * Retrieves the current state of a specific workflow conversation.
 * This allows for inspecting the progress and data within an ongoing workflow.
 *
 * @param {string} conversationId - The ID of the conversation thread whose state is to be retrieved.
 * @returns {Promise<{
 *   success: boolean,
 *   state: object | null,
 *   error?: string
 * }>} An object containing the success status and the current state values of the conversation,
 *     or null if the conversation is not found or an error occurs.
 */
export const getWorkflowConversationState = async (conversationId) => {
  try {
    const config = {
      configurable: {
        thread_id: conversationId,
      },
    };

    const state = await workflowAutomationGraph.getState(config);
    return {
      success: true,
      state: state?.values || null,
    };
  } catch (error) {
    logger.error('Error getting workflow conversation state:', error);
    return {
      success: false,
      error: error.message,
      state: null,
    };
  }
};