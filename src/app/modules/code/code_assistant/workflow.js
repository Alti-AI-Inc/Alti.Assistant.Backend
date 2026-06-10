import { StateGraph, END, MemorySaver, START } from '@langchain/langgraph';
// ADDED: Import RunnableConfig to access invocation-specific configuration.
import { RunnableConfig } from "@langchain/core/runnables";
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
// OPTIMIZED: Activated imports for database models and services.
// In a real application, these would point to the actual model and service files.
import { User, Workspace } from '../../../models/index.js';
import { checkUsage } from '../../../services/usageService.js';

/**
 * @module workflow
 * @description Defines the LangGraph workflow for the Code Assistant.
 * This module sets up a state machine that orchestrates different AI nodes
 * based on user intent, allowing for code generation, explanation, debugging,
 * best practices advice, and general conversation.
 */

// ADDED: Node for security, authorization, and context validation.
/**
 * Performs critical pre-flight checks before executing the main workflow logic.
 * This node ensures that the request is properly authenticated, authorized,
 * within the usage limits of the workspace, and that the user has the correct role.
 * It enriches the state with user and workspace context for downstream nodes.
 *
 * CRITICAL: This node relies on `userId` and `workspaceId` being passed in the
 * `configurable` object on every invocation of the graph.
 * e.g., `app.invoke(..., { configurable: { thread_id: "...", userId: "...", workspaceId: "..." } })`
 *
 * @param {object} state - The current graph state.
 * @param {RunnableConfig} config - The configuration for the runnable, containing user/workspace context.
 * @returns {Promise<object>} A partial state object with user and workspace context.
 * @throws {Error} If validation fails (e.g., auth error, limits exceeded).
 */
const validateContextAndPermissionsNode = async (state, config) => {
  const { userId, workspaceId } = config.configurable;

  if (!userId || !workspaceId) {
    // This check is fundamental to prevent any unauthenticated or context-less access.
    throw new Error("Authorization Error: User ID and Workspace ID are required.");
  }

  // OPTIMIZATION: Fetched user and workspace data concurrently using Promise.all.
  // This reduces the total database wait time from (time_for_user_query + time_for_workspace_query)
  // to max(time_for_user_query, time_for_workspace_query).
  // OPTIMIZATION: Added .lean() to both queries. This tells Mongoose to return plain
  // JavaScript objects instead of full Mongoose documents. This is significantly faster
  // and uses less memory, which is ideal for read-only operations like authorization checks.
  const [user, workspace] = await Promise.all([
    // For optimal performance, ensure an index exists on the `workspaces` field in the User collection.
    // e.g., in UserSchema: `workspaces: { type: [mongoose.Schema.Types.ObjectId], index: true }`
    // The `.populate('role')` was removed in favor of a more performant schema design where the
    // user's role is stored directly on the user document (denormalization), avoiding an extra database call.
    User.findOne({ _id: userId, workspaces: workspaceId }).lean(),
    Workspace.findById(workspaceId).lean()
  ]);


  if (!user || !workspace) {
    // Note: The check `user.workspaceId !== workspaceId` from the original FAKE_DB is redundant
    // because the `User.findOne` query already includes `workspaces: workspaceId`.
    // If the user is found, they are guaranteed to be part of the workspace.
    throw new Error("Authorization Error: User is not authorized for this workspace or workspace not found.");
  }

  const codeAssistantFeature = workspace.features?.codeAssistant;

  if (!codeAssistantFeature || !codeAssistantFeature.enabled) {
    // This check enforces the subscription status. If a workspace's subscription
    // lapses, this flag should be set to false by the billing management system.
    throw new Error("Feature Not Enabled: Code Assistant is not enabled for this workspace.");
  }

  // OPTIMIZED: Added Role-Based Access Control (RBAC) check.
  // Verifies if the user's role is in the list of roles allowed to use this feature.
  // This provides granular, admin-configurable control over feature access.
  const allowedRoles = codeAssistantFeature.allowedRoles || []; // Default to an empty list for safety (fail-closed).
  if (!allowedRoles.includes(user.role)) {
      throw new Error(`Access Denied: Your role ('${user.role}') does not have permission to use the Code Assistant.`);
  }

  // This check enforces the subscription limits. The usage service would track
  // token consumption against the limit defined in the workspace's subscription plan.
  const usage = await checkUsage(workspaceId, 'codeAssistant');
  if (usage.tokens >= workspace.limits.monthlyTokens) {
    // Optionally, trigger a notification to the workspace owner/admin.
    // await sendLimitNotification(workspace.ownerId, 'Code Assistant token limit reached.');
    throw new Error("Usage Limit Exceeded: Your workspace has reached its monthly token limit for the Code Assistant.");
  }

  // If all checks pass, enrich the state with validated context.
  // Downstream nodes can use this information for fine-grained logic, logging, and usage tracking.
  // NOTE: The `codeAssistantState` in `./state.js` must be updated to include `user` and `workspace` channels.
  return {
    user: { id: user._id.toString(), role: user.role },
    workspace: { id: workspace._id.toString(), ownerId: workspace.ownerId.toString() },
  };
};


/**
 * Initializes the LangGraph StateGraph for the code assistant.
 * The graph uses `codeAssistantState` to manage the conversation state across turns.
 * @type {StateGraph}
 */
const workflow = new StateGraph({
  channels: codeAssistantState,
});

// Add nodes to the graph

// ADDED: The new validation node is the first step in the workflow to enforce security and context.
workflow.addNode('validate_context', validateContextAndPermissionsNode);

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
 * All interactions start by routing to the 'validate_context' node for security checks.
 */
workflow.addEdge(START, 'validate_context');

/**
 * After context validation, the workflow proceeds to intent detection.
 */
workflow.addEdge('validate_context', 'detect_intent');

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

// CRITICAL SECURITY REQUIREMENT: The custom MongoDBSaver implementation MUST be multi-tenant aware.
// Its `get`, `put`, and `list` methods must use the `workspaceId` from the `configurable` object passed
// during invocation to scope all database operations. This prevents users from one workspace
// from accessing conversation threads in another (IDOR vulnerability).
// Example within MongoDBSaver.get(config):
//   const { thread_id, workspaceId } = config.configurable;
//   if (!workspaceId) throw new Error("Workspace ID is required for thread retrieval.");
//   const doc = await this.collection.findOne({ _id: thread_id, workspaceId: workspaceId });
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