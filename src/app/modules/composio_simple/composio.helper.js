import { GoogleGenAI } from '@google/genai';
import Tool from '../composio_v2/tools.model.js';
import { generateContent } from './utils/gemini.js';
import config from '../../../../config/index.js';
import { sanitizeToolForGemini } from './utils/toolSanitizer.js';
import { Composio } from '@composio/core';
import { GoogleProvider } from '@composio/google';
import fs from 'fs/promises'; // Use fs.promises for asynchronous file operations

/**
 * The Gemini API client instance initialized with the configured API key.
 * @type {GoogleGenAI}
 */
const gemini = new GoogleGenAI({ apiKey: config.gemini_secret_key });

/**
 * Identifies the most appropriate application(s) from a list of available apps
 * based on the user's query, chat history, and summarized context. This function
 * uses an LLM to determine which applications are relevant to the user's request.
 *
 * @param {string} query - The current user query or request.
 * @param {Array<{role: string, parts: Array<{text: string}>}>} [chatHistory=[]] - The history of the conversation for context.
 * @param {string} [summarizedContext=''] - A summary of the conversation context.
 * @returns {Promise<{toolKitVersions: Object<string, string>, appList: string[]}>} An object containing a map of app names to their toolkit versions and the list of identified app names. Returns empty lists on file read/parse errors.
 */
export async function findAppropriateApp(
  query,
  chatHistory = [],
  summarizedContext = ''
) {
  let appsData, apps, toolKitsData, toolKits;

  // Load available apps from JSON file asynchronously with error handling
  try {
    appsData = await fs.readFile(
      './src/app/modules/composio_simple/available_apps.json',
      'utf-8'
    );
    apps = JSON.parse(appsData);
  } catch (error) {
    console.error('Error loading or parsing available_apps.json:', error);
    // Return empty lists to prevent application crash and allow graceful degradation
    return { toolKitVersions: {}, appList: [] };
  }

  // Load toolkits from JSON file asynchronously with error handling
  try {
    toolKitsData = await fs.readFile(
      './src/app/modules/composio_simple/toolkits.json',
      'utf-8'
    );
    toolKits = JSON.parse(toolKitsData);
  } catch (error) {
    console.error('Error loading or parsing toolkits.json:', error);
    // Return empty lists to prevent application crash and allow graceful degradation
    return { toolKitVersions: {}, appList: [] };
  }

  let prompt = `Given the following list of apps: ${apps.join(', ')}, identify the list of most appropriate app for the following user query: "${query}". 
  Respond with only the app name. If none are appropriate, respond with "none".
  Provide the response in a JSON array format. Prioritize apps that can best help in fulfilling the user's request. Also consider the context provided below to make a more informed decision.
  `;

  if (chatHistory.length > 0) {
    //Take content from chat history only
    prompt += `\n\nHere is the chat history for context:\n`;
    chatHistory.forEach((msg, idx) => {
      prompt += `[Message ${idx + 1}] ${msg.role.toUpperCase()}: ${msg.content}\n`;
    });
  }
  if (summarizedContext) {
    prompt += `\n\nHere is the summarized context for additional information:\n${summarizedContext}\n`;
  }

  const response = await generateContent('gemini-2.5-flash', [
    { role: 'user', parts: [{ text: prompt }] },
  ]);

  // Before parsing remove any extra text around the JSON array
  // Add defensive checks for LLM response structure and regex match
  const responseText = response?.candidates?.[0]?.content?.parts?.[0]?.text;
  let appList = [];

  if (responseText) {
    const matchResult = responseText.trim().match(/\[.*\]/s);
    if (matchResult && matchResult[0]) {
      try {
        const jsonArrayText = matchResult[0];
        appList = JSON.parse(jsonArrayText);
      } catch (parseError) {
        console.error('Error parsing app list from LLM response:', parseError);
        // Fallback to empty list if parsing fails
        appList = [];
      }
    } else {
      console.warn('No JSON array found in LLM response for app list identification.');
      // Fallback to empty list if no match
      appList = [];
    }
  } else {
    console.warn('LLM response text was empty or malformed for app list identification.');
    // Fallback to empty list if response text is missing
    appList = [];
  }

  // SECURITY PATCH: Validate the app list from the LLM against the known list of available apps.
  // This prevents potential NoSQL injection if the LLM returns malicious query objects instead of strings,
  // ensuring only valid app names are used in database queries.
  const validApps = new Set(apps);
  const validatedAppList = Array.isArray(appList)
    ? appList.filter((app) => typeof app === 'string' && validApps.has(app))
    : [];

  if (validatedAppList.length !== (appList?.length || 0)) {
    console.warn(
      'LLM returned invalid or non-existent app names. They have been filtered out.',
      { original: appList, filtered: validatedAppList }
    );
  }

  console.log('Identified and validated apps:', validatedAppList);

  const toolKitVersions = {};
  for (const app of validatedAppList) {
    toolKitVersions[app] = toolKits[app] || 'latest';
  }
  console.log('Toolkit versions to use:', toolKitVersions);

  return {
    toolKitVersions,
    appList: validatedAppList, // Return the sanitized list
  };
}

/**
 * Generates a vector embedding for a given text query using the Gemini embedding model.
 *
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]>} A promise that resolves to the embedding vector array.
 */
async function embedQuery(text) {
  const res = await gemini.embedContent({
    model: 'embedding-001',
    content: { role: 'user', parts: [{ text }] },
  });

  return res.embedding.values;
}

/**
 * Performs a vector search against the database to find relevant tools based on the query embedding.
 * Filters results by the specified applications, effectively scoping the search to tools
 * relevant to the current context.
 *
 * @param {string} query - The search query.
 * @param {number} [topK=5] - The maximum number of search results to return.
 * @param {string[]} apps - A validated array of application names to filter the search.
 * @returns {Promise<Array<Object>>} A promise that resolves to the list of matching tool documents from the database.
 */
export const getVectorSearchResults = async (query, topK = 5, apps) => {
  const vector = await embedQuery(query);
  console.log('Vector length:', vector.length);
  console.log(vector.slice(0, 5));
  console.log('Apps filter:', apps);

  // OPTIMIZATION: For this query to be performant, the 'vector_index' in Atlas Search
  // should be configured to allow filtering on the 'appName' field (e.g., as a 'token' or 'string' type).
  // This ensures the $in operator can efficiently pre-filter documents before the vector search phase.
  const result = await Tool.aggregate([
    {
      $vectorSearch: {
        index: 'vector_index', // or your index name
        path: 'embedding',
        queryVector: vector,
        numCandidates: 200,
        limit: topK,
        // The 'apps' array is now validated in findAppropriateApp, mitigating NoSQL injection risks.
        filter: { appName: { $in: apps } },
      },
    },
    {
      $project: {
        name: 1,
        description: 1,
        slug: 1,
        version: 1,
        appName: 1,
        input_parameters: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);

  console.log(
    'Search results:',
    JSON.stringify(
      result.map((r) => ({ name: r.name, slug: r.slug, score: r.score })),
      null,
      2
    )
  );
  return result;
};

/**
 * Generates tool calls using Gemini based on the query and available tools,
 * and then executes them on behalf of the specified entity. This function orchestrates
 * the AI's decision-making and the execution of the decided actions.
 *
 * @param {string} query - The user query or prompt.
 * @param {Array<Object>} tools - The list of tools (retrieved from vector search) available for selection by the LLM.
 * @param {Object<string, string>} toolkitVersions - Map of application names to their toolkit versions.
 * @param {string} entityId - The unique identifier of the entity (user/tenant) executing the tools. This is crucial for multi-tenancy.
 * @returns {Promise<{response: Object, results: Array<Object>, error?: string}>} The LLM response, execution results, and an optional error message if execution fails.
 */
export async function generateAndExecuteTools(
  query,
  tools,
  toolkitVersions,
  entityId
) {
  const cleanedTools = tools.map((tool) => sanitizeToolForGemini(tool));
  console.log('Entity ID for tool execution:', entityId);
  const response = await generateContent('gemini-2.5-flash', query, {
    tools: [{ functionDeclarations: cleanedTools }],
    thinkingConfig: {
      includeThoughts: false,
    },
  });

  // Add defensive checks for LLM response structure
  const contentParts = response?.candidates?.[0]?.content?.parts;
  console.log('Content parts:', JSON.stringify(contentParts || [], null, 2));
  console.log(
    '--- Used Tool Calls ---',
    JSON.stringify(response?.functionCalls || [], null, 2)
  );

  if (response?.functionCalls && response.functionCalls.length > 0) {
    try {
      const results = await executeMultipleTools(
        entityId,
        response.functionCalls,
        toolkitVersions,
        tools // SECURITY PATCH: Pass full tool definitions for argument validation.
      );
      return { response, results };
    } catch (error) {
      console.error('Error executing multiple tools:', error);
      // Return original response and empty results array on error,
      // allowing the system to continue without crashing.
      return { response, results: [], error: error.message };
    }
  } else {
    console.log('No function calls in the response');
    console.log(response?.text || 'No text in response'); // Defensive access
    return { response, results: [] };
  }
}

/**
 * Synthesizes a comprehensive, self-contained user request by combining the latest message
 * with the conversation history or summary. This helps maintain context for the LLM
 * in multi-turn conversations.
 *
 * @param {string} userMessage - The latest message from the user.
 * @param {string} [historySummary=''] - A summary of the conversation history.
 * @param {Array<{role: string, parts: Array<{text: string}>}>} [history=[]] - The raw conversation history.
 * @returns {Promise<string>} The synthesized comprehensive user request. Falls back to the original message on error.
 */
export async function generateUserMessasgeFromContext(
  userMessage,
  historySummary = '',
  history = []
) {
  try {
    let prompt = `You are analyzing a conversation to create a comprehensive user request that combines the conversation history with the latest user input.

IMPORTANT INSTRUCTIONS:
1. If the latest message provides additional information (like details, clarifications, or answers) to a previous request, merge them into a single comprehensive request.
2. Include ALL relevant details from the conversation history that are needed to fulfill the user's complete intent.
3. The output should be a self-contained request that someone reading it for the first time would fully understand.
4. If the latest message is a standalone new request (not related to history), just return it as is.

Latest User Message:
"${userMessage}"`;

    if (historySummary) {
      prompt += `\n\nConversation Summary:\n${historySummary}\n`;
    } else if (history.length > 0) {
      prompt += `\n\nConversation History:\n`;
      history.forEach((msg, idx) => {
        prompt += `[Message ${idx + 1}] ${msg.role.toUpperCase()}: ${msg.content}\n`;
      });
    }

    prompt += `\n\nGenerate a comprehensive user request that combines the context and latest input. Include all necessary details from the history.
    
Examples:
- If user first asks "send email to John" then provides "his email is john@example.com", output should be: "Send an email to John at john@example.com [include other details from history like subject, body, etc.]"
- If user asks a completely new unrelated question, just return that question.

Output only the final comprehensive user request, nothing else:`;

    console.log('Generating user message with prompt:', prompt);
    const response = await generateContent('gemini-2.5-flash', [
      { role: 'user', parts: [{ text: prompt }] },
    ]);

    // Add defensive checks for LLM response structure
    const generatedMessage = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (generatedMessage) {
      console.log('Generated user message response:', generatedMessage);
      return generatedMessage;
    } else {
      console.warn('LLM response text was empty or malformed for user message generation. Returning original message.');
      return userMessage; // Fallback to original message
    }
  } catch (error) {
    console.error('Error generating user message from context:', error);
    return userMessage;
  }
}

/**
 * SECURITY HELPER: Basic validation for tool arguments against a schema.
 * This prevents injection attacks by ensuring LLM-generated arguments conform to the expected structure.
 * For production environments, using a robust schema validation library like Joi or Zod is highly recommended.
 * @param {Object} args - The arguments object to validate.
 * @param {Object} schema - The JSON schema for the tool's input_parameters.
 * @returns {boolean} - True if validation passes, false otherwise.
 */
const validateToolArgs = (args, schema) => {
  if (!schema || !schema.properties) {
    // If no schema is defined, we cannot validate.
    // Depending on security policy, you might want to allow or deny this.
    // Here, we allow it but log a warning.
    console.warn('No input schema found for tool. Skipping argument validation.');
    return true;
  }

  const schemaProps = schema.properties;
  const requiredParams = new Set(schema.required || []);

  // Check for missing required arguments
  for (const param of requiredParams) {
    if (!(param in args)) {
      console.error(`Validation Error: Missing required argument '${param}'.`);
      return false;
    }
  }

  for (const key in args) {
    // Check for unexpected arguments
    if (!schemaProps[key]) {
      console.error(`Validation Error: Unexpected argument '${key}' provided.`);
      return false;
    }

    const expectedType = schemaProps[key].type;
    const actualType = typeof args[key];

    // Basic type checking. Note: JSON schema types (e.g., 'integer', 'array') need more complex checks.
    if (
      (expectedType === 'string' && actualType !== 'string') ||
      (expectedType === 'number' && actualType !== 'number') ||
      (expectedType === 'integer' && !Number.isInteger(args[key])) ||
      (expectedType === 'boolean' && actualType !== 'boolean')
    ) {
      console.error(
        `Validation Error: Argument '${key}' has incorrect type. Expected ${expectedType}, got ${actualType}.`
      );
      return false;
    }
  }

  return true;
};

// MANAGER PLATFORM IMPROVEMENT: Placeholder for a service that checks user permissions.
// In a real application, this would query a database or an authentication/authorization service.
// OPTIMIZATION: This function is now synchronous and accepts a pre-fetched context
// to avoid making a separate database call for each permission check within a loop.
function hasPermission(entityContext, toolSlug) {
  // TODO: Implement actual role-based access control (RBAC) logic based on the context.
  // This function is critical for ensuring managers can perform actions (like inviting users)
  // that regular members cannot.
  console.log(`[RBAC] Checking permission for entity '${entityContext.id}' with role '${entityContext.role}' to use tool '${toolSlug}'.`);
  
  // A real implementation would be more robust, checking a permissions map against the role.
  if (entityContext.role === 'manager') {
    return true; // Managers can do anything in this example.
  }

  // Prevent non-managers from performing sensitive or management-related tasks.
  if (toolSlug.includes('invite') || toolSlug.includes('delete') || toolSlug.includes('update_role')) {
      return false;
  }
  return true; // Allow other non-sensitive tools by default.
}

// MANAGER PLATFORM IMPROVEMENT: Placeholder for a service that checks usage against plan limits.
// In a real application, this would connect to a billing/subscription management system.
// OPTIMIZATION: This function is now synchronous and accepts a pre-fetched context
// to avoid a separate database call for each usage check.
function checkUsageLimits(entityContext, requestedExecutions) {
    // TODO: Implement actual usage and quota checking logic based on the context.
    // This function ensures that workspaces do not exceed their subscribed plan limits.
    console.log(`[Usage] Checking if entity '${entityContext.id}' can execute ${requestedExecutions} more tools.`);
    
    const { current, limit } = entityContext.usage;
    if (current + requestedExecutions > limit) {
        return {
            allowed: false,
            reason: `Execution limit exceeded. Plan allows ${limit} executions, but this request would bring usage to ${current + requestedExecutions}.`
        };
    }
    return { allowed: true };
}

// MANAGER PLATFORM IMPROVEMENT: Placeholder for a service that updates usage counts.
// This function would typically increment a counter in the database for the given entity/tenant.
async function updateUsageCount(entityId, count) {
    // TODO: Implement actual database update logic.
    // Example: Tenant.updateOne({ users: entityId }, { $inc: { 'usage.current': count } });
    console.log(`[Usage] Propagating usage update for entity '${entityId}': incrementing by ${count}.`);
    // This is a placeholder and doesn't need to return anything unless there's an error.
    return Promise.resolve();
}

// OPTIMIZATION (N+1 Query): This helper function centralizes fetching all necessary
// data for a given entity (user/tenant) in a single operation. This context object
// is then passed to other functions to prevent multiple, redundant database queries
// within a single request, such as inside a loop.
async function getEntityContext(entityId) {
    // TODO: Implement actual data fetching from the database.
    // This function should fetch all necessary user/tenant information in a single query.
    // Example: Fetch user role, plan details, and current usage stats from User and Tenant collections.
    console.log(`[Context] Fetching context for entity '${entityId}'...`);
    
    // Simulating a database call that returns a comprehensive context object.
    // In a real scenario, this would be an async DB query:
    // const user = await User.findOne({ entityId }).select('role planId').lean();
    // const tenant = await Tenant.findOne({ planId: user.planId }).select('usageLimit currentUsage').lean();
    const isManager = entityId.includes('manager');
    return {
        id: entityId,
        role: isManager ? 'manager' : 'member',
        usage: {
            current: 50, // Example: Fetched from DB
            limit: 100,  // Example: Fetched from DB based on plan
        },
        // Add other relevant details like tenantId, plan type, etc.
    };
}

/**
 * Executes multiple tool calls sequentially for a specific entity using the Composio SDK.
 * This function operates within a multi-tenant context, executing actions on behalf of the provided entityId.
 *
 * @param {string} entityId - The unique identifier of the entity (user/tenant) in the multi-tenant context. This ensures actions are performed with the correct user's credentials and permissions.
 * @param {Array<{name: string, args: Object}>} functionCalls - The list of function calls to execute, as determined by the LLM.
 * @param {Object<string, string>} toolkitVersions - Map of application names to their toolkit versions.
 * @param {Array<Object>} toolDefinitions - The full definitions of available tools, used for validating arguments.
 * @returns {Promise<Array<{tool: string, status: 'success' | 'error', result?: any, error?: string}>>} The execution results for each tool. Individual tool failures do not stop the execution of subsequent tools.
 */
export async function executeMultipleTools(
  entityId,
  functionCalls,
  toolkitVersions,
  toolDefinitions
) {
  // SECURITY PATCH: Validate entityId to prevent potential injection attacks on the downstream SDK.
  // It should be a non-empty string matching a safe, expected format (e.g., alphanumeric, UUID).
  if (typeof entityId !== 'string' || !/^[a-zA-Z0-9-_]+$/.test(entityId)) {
    console.error(
      `Invalid entityId format: ${entityId}. Aborting tool execution.`
    );
    return functionCalls.map((funcCall) => ({
      tool: funcCall.name,
      status: 'error',
      error:
        'Invalid entityId provided. Execution blocked for security reasons.',
    }));
  }

  // OPTIMIZATION (N+1 Query): Fetch user/tenant context once before the loop
  // to avoid repeated database calls for permissions and usage checks inside the loop.
  const entityContext = await getEntityContext(entityId);

  // MANAGER PLATFORM IMPROVEMENT: Enforce plan limits before execution.
  // This check now uses the pre-fetched context.
  const usageCheck = checkUsageLimits(entityContext, functionCalls.length);
  if (!usageCheck.allowed) {
    console.error(`[Usage] Entity '${entityId}' exceeded plan limits. Reason: ${usageCheck.reason}`);
    return functionCalls.map((funcCall) => ({
      tool: funcCall.name,
      status: 'error',
      error: `Plan limit exceeded. Please upgrade your plan to execute more actions.`,
    }));
  }

  const results = [];
  let successfulExecutions = 0; // HIERARCHY GAP FIX: Initialize counter for usage propagation.
  const composio = new Composio({
    apiKey: config.composio.orgApiKey,
    provider: new GoogleProvider(),
    toolkitVersions,
  });

  console.log(`[Execution] Starting tool execution for entity: ${entityId}`);
  for (const funcCall of functionCalls) {
    console.log(`[Execution] Attempting to call tool ${funcCall.name} for entity ${entityId}`);
    const functionCall = {
      name: funcCall.name || '',
      args: funcCall.args || {},
    };

    // SECURITY PATCH: Find the full tool definition to validate against.
    const toolDef = toolDefinitions.find((t) => t.slug === functionCall.name);
    if (!toolDef) {
      console.error(
        `[Security] Entity '${entityId}' attempted to execute a non-existent or disallowed tool: '${functionCall.name}'. Skipping.`
      );
      results.push({
        tool: functionCall.name,
        status: 'error',
        error: `Tool '${functionCall.name}' not found or is not allowed.`,
      });
      continue;
    }

    // MANAGER PLATFORM IMPROVEMENT: Enforce Role-Based Access Control (RBAC) for each tool.
    // This check now uses the pre-fetched context, avoiding a DB call in the loop.
    const isAuthorized = hasPermission(entityContext, functionCall.name);
    if (!isAuthorized) {
      console.warn(
        `[RBAC] Authorization DENIED for entity '${entityId}' to use tool '${functionCall.name}'. Skipping.`
      );
      results.push({
        tool: functionCall.name,
        status: 'error',
        error: `You do not have permission to perform this action.`,
      });
      continue;
    }

    // SECURITY PATCH: Validate LLM-generated arguments against the tool's schema
    // before execution to prevent injection attacks or unexpected behavior.
    if (!validateToolArgs(functionCall.args, toolDef.input_parameters)) {
      console.error(
        `[Security] Invalid arguments for tool '${functionCall.name}' from entity '${entityId}'. Skipping execution.`,
        { args: functionCall.args }
      );
      results.push({
        tool: functionCall.name,
        status: 'error',
        error: `Invalid arguments provided for tool '${functionCall.name}'.`,
      });
      continue;
    }

    try {
      const result = await composio.provider.executeToolCall(
        entityId,
        functionCall
      );
      console.log(
        `[Execution] Success for ${funcCall.name} by entity ${entityId}:`,
        JSON.stringify(result, null, 2)
      );
      results.push({ tool: funcCall.name, status: 'success', result });
      successfulExecutions++; // HIERARCHY GAP FIX: Increment on successful execution.
    } catch (error) {
      console.error(`[Execution] Error for tool ${funcCall.name} by entity ${entityId}:`, error);
      // Push error information to results array to indicate failure for this specific tool,
      // but do not rethrow to allow other tools to attempt execution.
      results.push({
        tool: funcCall.name,
        status: 'error',
        // Return a generic error to the user to avoid leaking implementation details.
        error: `An error occurred while trying to perform this action.`,
      });
    }
  }

  // HIERARCHY GAP FIX: After all executions, update the usage count in the database.
  // This ensures that usage is correctly propagated and tracked against plan limits.
  if (successfulExecutions > 0) {
    try {
      await updateUsageCount(entityId, successfulExecutions);
    } catch (error) {
      // If usage update fails, we should log it critically as it could affect billing/quotas.
      console.error(`[CRITICAL] Failed to update usage count for entity '${entityId}'. Manual correction may be required. Error:`, error);
    }
  }

  return results;
}