import { StateGraph, END, START } from '@langchain/langgraph';
import { workflowAutomationState } from './state.js';
import {
  analyzeIntentNode,
  planWorkflowNode,
  scheduleDetectionNode,
  extractParametersNode,
  validateWorkflowNode,
  generateResponseNode,
} from './nodes.js';
import { MemorySaver } from '@langchain/langgraph';
import { logger } from '../../../../shared/logger.js';

// Create the workflow automation graph
const workflow = new StateGraph({ channels: workflowAutomationState });

// Add nodes to the workflow
workflow.addNode('analyze_intent', analyzeIntentNode);
workflow.addNode('plan_workflow', planWorkflowNode);
workflow.addNode('schedule_detection', scheduleDetectionNode);
workflow.addNode('extract_parameters', extractParametersNode);
workflow.addNode('validate_workflow', validateWorkflowNode);
workflow.addNode('generate_response', generateResponseNode);

// Define the workflow edges
workflow.addEdge(START, 'analyze_intent');

// Route from intent analysis
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

// Route from workflow planning
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

// Route from schedule detection
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

// Route from parameter extraction
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

// Route from validation to response
workflow.addEdge('validate_workflow', 'generate_response');

// End the workflow
workflow.addEdge('generate_response', END);

// Compile the workflow with memory
const checkpointer = new MemorySaver();
export const workflowAutomationGraph = workflow.compile({ checkpointer });

/**
 * Process a user prompt through the workflow automation pipeline
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
 * Continue a conversation in an existing workflow thread
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
 * Get the current state of a workflow conversation
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
