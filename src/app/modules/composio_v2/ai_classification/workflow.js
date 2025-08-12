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
    history = []
  } = options;

  const connectedAccounts = userId
    ? await composio.connectedAccounts.list({
      userIds: [userId]
    })
    : [];
  const initialState = {
    userInput,
    userId,
    history,
    currentStage: 'initial',
    connectedAccounts: connectedAccounts.items || [],
    metadata: {
      timestamp: new Date(),
      processingStartTime: new Date()
    }
  };

  const config = conversationId
    ? { configurable: { thread_id: conversationId } }
    : { configurable: { thread_id: `ai_classification_${Date.now()}` } };

  try {
    console.log(`Starting AI classification for input: "${userInput}"`);
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
      metadata: result.metadata,
      conversationId: config.configurable.thread_id,
      error: result.error || null
    };
  } catch (error) {
    console.error("Error running AI classification agent:", error);
    return {
      success: false,
      error: error.message,
      userInput,
      conversationId: config.configurable.thread_id
    };
  }
};
