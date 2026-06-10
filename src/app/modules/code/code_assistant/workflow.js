import { StateGraph, END, MemorySaver, START } from '@langchain/langgraph';
import { codeAssistantState } from './state.js';
import {
  detectIntentNode,
  routeOnIntent,
  generateCodeNode,
  explainCodeNode,
  debugCodeNode,
  bestPracticesNode,
  generalConversationNode,
} from './nodes.js';
import { MongoDBSaver } from './MongoDBSaver.js';
import config from '../../../../../config/index.js';

/**
 * @module workflow
 * @description Defines the LangGraph workflow for the Code Assistant.
 * This module sets up a state machine that orchestrates different AI nodes
 * based on user intent, allowing for code generation, explanation, debugging,
 * best practices advice, and general conversation.
 */

/**
 * Initializes the LangGraph StateGraph for the code assistant.
 * The graph uses `codeAssistantState` to manage the conversation state across turns.
 * @type {StateGraph}
 */
const workflow = new StateGraph({
  channels: codeAssistantState,
});

// Add nodes to the graph
/**
 * Adds the 'detect_intent' node to the workflow. This node is responsible for
 * identifying the user's primary goal from their input.
 */
workflow.addNode('detect_intent', detectIntentNode);
/**
 * Adds the 'generate_code' node to the workflow. This node handles requests
 * for generating code snippets based on user specifications.
 */
workflow.addNode('generate_code', generateCodeNode);
/**
 * Adds the 'explain_code' node to the workflow. This node provides explanations
 * for given code snippets.
 */
workflow.addNode('explain_code', explainCodeNode);
/**
 * Adds the 'debug_code' node to the workflow. This node assists in identifying
 * and suggesting fixes for issues in provided code.
 */
workflow.addNode('debug_code', debugCodeNode);
/**
 * Adds the 'best_practices' node to the workflow. This node offers advice
 * on coding best practices for given code or scenarios.
 */
workflow.addNode('best_practices', bestPracticesNode);
/**
 * Adds the 'general_conversation' node to the workflow. This node handles
 * conversational turns that do not fall into the specific code-related tasks.
 */
workflow.addNode('general_conversation', generalConversationNode);

// Define the workflow edges

/**
 * Defines the entry point of the workflow.
 * All interactions start by routing to the 'detect_intent' node.
 */
workflow.addEdge(START, 'detect_intent');

/**
 * Defines conditional edges from the 'detect_intent' node.
 * Based on the intent detected by `routeOnIntent`, the workflow transitions
 * to the appropriate task-specific node (e.g., 'generate_code', 'explain_code').
 * @param {'detect_intent'} source - The source node for conditional routing.
 * @param {function} condition - The function (`routeOnIntent`) that determines the next node.
 * @param {Object.<string, string>} mapping - A map from intent names to target node names.
 */
workflow.addConditionalEdges('detect_intent', routeOnIntent, {
  generate_code: 'generate_code',
  explain_code: 'explain_code',
  debug_code: 'debug_code',
  best_practices: 'best_practices',
  general_conversation: 'general_conversation',
});

/**
 * Defines the termination points for the workflow.
 * After any task node completes its operation, the conversation turn ends.
 */
workflow.addEdge('generate_code', END);
workflow.addEdge('explain_code', END);
workflow.addEdge('debug_code', END);
workflow.addEdge('best_practices', END);
workflow.addEdge('general_conversation', END);

/**
 * Initializes the checkpointer for the LangGraph application.
 * Initially, an in-memory checkpointer is used to allow the application to
 * compile and start immediately without blocking on database connection.
 * This `checkpointer` variable will be updated later with a persistent MongoDB saver.
 * @type {MemorySaver | MongoDBSaver}
 */
let checkpointer = new MemorySaver();

/**
 * The compiled LangGraph application for the code assistant.
 * This is the main executable instance of the workflow.
 * It is initially compiled with an in-memory checkpointer and later
 * re-compiled with a MongoDB checkpointer once the connection is established.
 * @type {import('@langchain/langgraph').CompiledStateGraph}
 */
export let codeAssistantApp = workflow.compile({ checkpointer });

/**
 * Asynchronously upgrades the checkpointer to use MongoDB for persistent state saving.
 * This process is deferred to avoid blocking application startup.
 * If the MongoDB connection is successful, the `checkpointer` is updated,
 * and the `codeAssistantApp` is re-compiled with the new persistent checkpointer.
 * In case of an error, a warning is logged, and the in-memory fallback remains active.
 */

// GCP Resiliency: Define MongoDB connection options for production environments.
// These settings are optimized for robust and efficient operation within GCP's network,
// handling connection pooling, timeouts, and keep-alives gracefully.
const mongoDbOptions = {
  // maxPoolSize: Controls the maximum number of connections in the connection pool.
  // A value of 50 is a sensible default for a moderately busy application.
  maxPoolSize: 50,
  // minPoolSize: Ensures a minimum number of connections are kept open, reducing
  // latency for new requests by avoiding the need to establish a new connection.
  minPoolSize: 5,
  // maxIdleTimeMS: Specifies the maximum time a connection can remain idle in the pool.
  // Set to 60s to work well with GCP network components (e.g., firewalls, proxies)
  // that may close idle connections.
  maxIdleTimeMS: 60000,
  // connectTimeoutMS: The time in milliseconds to wait for a connection to be established
  // before timing out. Prevents the application from hanging during initial connection.
  connectTimeoutMS: 30000,
  // socketTimeoutMS: The time in milliseconds to wait for a server reply before timing out.
  // Crucial for preventing operations from hanging indefinitely due to network partitions or
  // slow database operations.
  socketTimeoutMS: 30000,
  // The MongoDB Node.js driver enables TCP KeepAlive by default, which is critical for
  // maintaining long-lived connections across GCP's network infrastructure.
  // Automatic reconnect logic is also built-in and enabled by default.
};

MongoDBSaver.fromUri(config.database_uri, mongoDbOptions) // Use production URI and resiliency options
  .then((mongoCheckpointer) => {
    checkpointer = mongoCheckpointer;
    // Re-compile with persistent checkpointer and re-assign the exported variable.
    // This ensures the entire graph instance is updated with the new checkpointer,
    // as directly modifying a compiled graph's checkpointer via Object.assign is not supported.
    codeAssistantApp = workflow.compile({ checkpointer });
    console.log('✅ Code assistant: MongoDB checkpointer connected');
  })
  .catch((err) => {
    console.warn('⚠️ Code assistant: MongoDB checkpointer unavailable, using in-memory fallback:', err.message);
  });