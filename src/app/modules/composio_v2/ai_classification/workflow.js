import { StateGraph, END, START } from "@langchain/langgraph";
import { aiClassificationState } from "./state.js";
import {
  classifyAppNode,
  classifyActionNode,
  filterRelevantToolsNode,
  extractParametersNode,
  executeToolNode,
  generateResponseNode
} from "./nodes.js";
import { MongoDBSaver } from "../../code/code_assistant/MongoDBSaver.js";
import config from "../../../../../config/index.js";
import { Composio } from "@composio/core";
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});
// Create the AI classification workflow
const workflow = new StateGraph({ channels: aiClassificationState });

// Add all nodes for the AI classification and tool execution process
workflow.addNode("classify_app", classifyAppNode);
workflow.addNode("classify_action", classifyActionNode);
workflow.addNode("filter_tools", filterRelevantToolsNode);
workflow.addNode("extract_parameters", extractParametersNode);
workflow.addNode("execute_tool", executeToolNode);
workflow.addNode("generate_response", generateResponseNode);

// Define the workflow edges - Sequential flow for classification and execution
workflow.addEdge(START, "classify_app");
workflow.addEdge("classify_app", "classify_action");
workflow.addEdge("classify_action", "filter_tools");
workflow.addEdge("filter_tools", "extract_parameters");
workflow.addEdge("extract_parameters", "execute_tool");
workflow.addEdge("execute_tool", "generate_response");
workflow.addEdge("generate_response", END);

// Initialize MongoDB checkpointer for conversation persistence
const checkpointer = await MongoDBSaver.fromUri(
  config.database_local,
  "ai_classification_checkpoints"
);

// Compile the workflow with checkpointer
export const aiClassificationApp = workflow.compile({
  checkpointer,
  debug: true // Enable debug mode for development
});

// Export utility function to invoke the AI classification agent
export const runAIClassificationAgent = async (userInput, options = {}) => {
  const {
    userId = null,
    conversationId = null,
    history = [],
    retrieveHistory = true
  } = options;

  const connectedAccounts = userId
    ? await composio.connectedAccounts.list({
      userIds: [userId]
    })
    : [];

  // Generate or use provided conversation ID
  const threadId = conversationId || `ai_classification_${userId}_${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  // Retrieve conversation history if requested and conversation exists
  let conversationHistory = history;
  let conversationContext = {
    lastApp: null,
    lastAction: null,
    lastParameters: null,
    recentTools: [],
    userPreferences: {},
    conversationSummary: "",
    turnCount: 0
  };

  if (retrieveHistory && conversationId) {
    try {
      const existingState = await aiClassificationApp.getState(config);
      if (existingState && existingState.values) {
        conversationHistory = existingState.values.history || history;
        conversationContext = existingState.values.conversationContext || conversationContext;
        console.log(`Retrieved conversation history with ${conversationHistory.length} messages`);
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
      timestamp: new Date().toISOString()
    }
  ];

  const initialState = {
    userInput,
    userId,
    threadId,
    history: conversationHistory,
    messages: currentMessages,
    conversationContext: {
      ...conversationContext,
      turnCount: conversationContext.turnCount + 1
    },
    currentStage: 'initial',
    connectedAccounts: connectedAccounts.items || [],
    metadata: {
      timestamp: new Date(),
      processingStartTime: new Date(),
      conversationId: threadId,
      turnNumber: conversationContext.turnCount + 1
    }
  };

  try {
    console.log(`Starting AI classification for input: "${userInput}" (Conversation: ${threadId})`);
    const result = await aiClassificationApp.invoke(initialState, config);

    return {
      success: true,
      userInput: result.userInput,
      availableApps: result.availableApps,
      availableActions: result.availableActions,
      identifiedApp: result.identifiedApp,
      identifiedAction: result.identifiedAction,
      confidence: result.confidence,
      executionResult: result.executionResult,
      response: result.response,
      finalResponse: result.finalResponse,
      metadata: result.metadata,
      conversationId: threadId,
      conversationContext: result.conversationContext,
      history: result.history,
      messages: result.messages,
      error: result.error || null
    };
  } catch (error) {
    console.error("Error running AI classification agent:", error);
    return {
      success: false,
      error: error.message,
      userInput,
      conversationId: threadId
    };
  }
};

// Utility function to get conversation history
export const getConversationHistory = async (conversationId) => {
  try {
    const config = { configurable: { thread_id: conversationId } };
    const state = await aiClassificationApp.getState(config);
    
    if (state && state.values) {
      return {
        success: true,
        history: state.values.history || [],
        conversationContext: state.values.conversationContext || {},
        metadata: state.values.metadata || {}
      };
    }
    
    return {
      success: false,
      message: 'Conversation not found'
    };
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Utility function to clear conversation history
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
          conversationSummary: "",
          turnCount: 0
        }
      };
      
      await aiClassificationApp.updateState(config, resetState);
      return { success: true, message: 'Conversation history cleared' };
    }
    
    return { success: false, message: 'Conversation not found' };
  } catch (error) {
    console.error('Error clearing conversation history:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
