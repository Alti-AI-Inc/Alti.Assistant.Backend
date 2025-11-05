import { Composio } from '@composio/core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import ComposioAuth from '../composio_v2/composio.model.js';
import { conversationService } from './composio.conversation.js';
import AuthConfig from '../composio_v2/authConfig.model.js';
import Tool from '../composio_v2/tools.model.js';

// Initialize Composio
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Format tool execution results into human-readable text
 * @param {Array} toolResults - Raw tool results from Composio
 * @param {Array} functionCalls - Original function calls with tool names
 * @returns {string} Formatted, human-readable response
 */
const formatToolResults = (toolResults, functionCalls) => {
  try {
    const formattedResults = toolResults.map((result, index) => {
      const toolName = functionCalls[index]?.name || 'Unknown Tool';
      const toolDisplayName = toolName.replace(/_/g, ' ').toLowerCase();

      // Parse the result content
      let parsedContent;
      try {
        parsedContent = JSON.parse(result.content);
      } catch {
        return result.content; // Return as-is if not JSON
      }

      // Check if it's a successful Composio response
      if (parsedContent.successful && parsedContent.data) {
        const data = parsedContent.data;

        // Handle different data structures
        if (data.details && Array.isArray(data.details)) {
          // Array of items (like branches, repositories, etc.)
          if (data.details.length === 0) {
            return `✓ No items found.`;
          }

          return data.details.map((item, idx) => {
            const lines = [`**Item ${idx + 1}:**`];

            // Format common fields
            if (item.name) lines.push(`  • Name: ${item.name}`);
            if (item.title) lines.push(`  • Title: ${item.title}`);
            if (item.description) lines.push(`  • Description: ${item.description}`);
            if (item.url) lines.push(`  • URL: ${item.url}`);
            if (item.protected !== undefined) lines.push(`  • Protected: ${item.protected}`);
            if (item.created_at) lines.push(`  • Created: ${new Date(item.created_at).toLocaleDateString()}`);
            if (item.updated_at) lines.push(`  • Updated: ${new Date(item.updated_at).toLocaleDateString()}`);

            // Handle commit info
            if (item.commit) {
              lines.push(`  • Latest Commit: ${item.commit.sha?.substring(0, 7) || 'N/A'}`);
            }

            return lines.join('\n');
          }).join('\n\n');
        } else if (typeof data.details === 'object') {
          // Single object
          const lines = ['**Result:**'];
          Object.entries(data.details).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              const displayKey = key.replace(/_/g, ' ');
              lines.push(`  • ${displayKey}: ${JSON.stringify(value)}`);
            }
          });
          return lines.join('\n');
        } else {
          // Simple data
          return `✓ Success: ${JSON.stringify(data.details)}`;
        }
      } else if (parsedContent.error) {
        return `✗ Error: ${parsedContent.error}`;
      }

      // Fallback to JSON string
      return JSON.stringify(parsedContent, null, 2);
    });

    return formattedResults.join('\n\n---\n\n');
  } catch (error) {
    console.error('Error formatting tool results:', error);
    // Fallback to original format
    return toolResults.map(r => r.content).join('\n');
  }
};

/**
 * Keyword-based tool filtering fallback
 * Scores tools based on keyword matches with user message
 * @param {Array} tools - List of tools to filter
 * @param {string} userMessage - User's request message
 * @param {number} maxTools - Maximum number of tools to return (default: 15)
 */
const keywordBasedToolFilter = (tools, userMessage, maxTools = 15) => {
  const messageLower = userMessage.toLowerCase();

  // Extract intent keywords with mutually exclusive operations
  const intentKeywords = {
    list: ['list', 'get all', 'show all', 'fetch all', 'retrieve all', 'find all', 'show me', 'display'],
    get: ['get', 'fetch', 'retrieve', 'show', 'find', 'read', 'view', 'see', 'check'],
    create: ['create', 'add', 'new', 'post', 'publish', 'make', 'start'],
    update: ['update', 'edit', 'modify', 'change', 'set', 'patch'],
    delete: ['delete', 'remove', 'cancel', 'destroy', 'drop'],
    send: ['send', 'email', 'message', 'notify', 'forward', 'dispatch']
  };

  // Detect user's primary intent
  let primaryIntent = null;
  for (const [intent, keywords] of Object.entries(intentKeywords)) {
    if (keywords.some(kw => messageLower.includes(kw))) {
      primaryIntent = intent;
      break;
    }
  }

  // Score each tool
  const scoredTools = tools.map(tool => {
    let score = 0;
    const toolNameLower = tool.name.toLowerCase();
    const toolDescLower = (tool.description || '').toLowerCase();

    // PENALTY: Heavily penalize wrong operations
    if (primaryIntent) {
      const wrongOperations = {
        'list': ['create', 'delete', 'update', 'remove', 'add'],
        'get': ['create', 'delete', 'update', 'remove', 'add'],
        'create': ['delete', 'remove', 'list', 'get'],
        'delete': ['create', 'add', 'list', 'get'],
        'update': ['delete', 'remove', 'create', 'add'],
        'send': ['delete', 'remove', 'get', 'list']
      };

      const penalties = wrongOperations[primaryIntent] || [];
      const hasWrongOperation = penalties.some(op => toolNameLower.includes(op));
      if (hasWrongOperation) {
        score -= 50; // Heavy penalty for wrong operation
      }
    }

    // 1. Exact keyword matches in tool name (highest priority)
    const messageWords = messageLower.split(/\s+/).filter(w => w.length > 2);
    messageWords.forEach(word => {
      if (toolNameLower.includes(word)) {
        score += 15; // Increased from 10
      }
    });

    // 2. Intent matching (must match primary intent)
    if (primaryIntent && toolNameLower.includes(primaryIntent)) {
      score += 20; // Increased significantly
    }

    // 3. Entity matching (repository, branch, email, etc.)
    const entities = ['repository', 'repo', 'branch', 'commit', 'pull', 'request', 'issue',
      'email', 'mail', 'message', 'calendar', 'event', 'file', 'folder',
      'artifact', 'variable', 'workflow', 'action'];
    entities.forEach(entity => {
      if (messageLower.includes(entity) && toolNameLower.includes(entity)) {
        score += 10; // Increased from 5
      }
    });

    // 4. Penalize mismatched entities (asking for branches but tool is for variables)
    const mismatchEntities = entities.filter(e => messageLower.includes(e));
    mismatchEntities.forEach(requestedEntity => {
      const otherEntities = entities.filter(e => e !== requestedEntity);
      otherEntities.forEach(otherEntity => {
        if (toolNameLower.includes(otherEntity)) {
          score -= 10; // Penalty for wrong entity
        }
      });
    });

    // 5. Description matches (lower priority)
    messageWords.forEach(word => {
      if (word.length > 4 && toolDescLower.includes(word)) {
        score += 1;
      }
    });

    return { tool, score };
  });  // Sort by score and take top N based on maxTools parameter
  const filtered = scoredTools
    .filter(st => st.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTools)
    .map(st => st.tool);

  console.log(`Keyword filter: Found ${filtered.length} tools (max ${maxTools}):`, filtered.map(t => t.name).slice(0, 5));

  // If no matches, return first N tools as last resort
  return filtered.length > 0 ? filtered : tools.slice(0, maxTools);
};

/**
 * Main execution function - handles both single and multi-step actions
 */
export const executeUserRequest = async (userMessage, userId, conversationId = null) => {
  const startTime = Date.now();

  try {
    // 1. Get or create conversation
    const conversation = await conversationService.getOrCreateConversation(
      userId,
      conversationId,
      userMessage
    );
    console.log('Using conversation ID:', conversation.conversationId);
    const actualConversationId = conversation.conversationId;

    // 2. Get recent conversation history for context
    const recentMessages = conversationId
      ? await conversationService.getRecentMessages(conversationId, userId, 5)
      : [];

    // 3. Get user's connected accounts
    const connectedAccounts = await ComposioAuth.find({
      userId: userId,
      status: 'ACTIVE'
    }).lean();

    if (!connectedAccounts || connectedAccounts.length === 0) {
      throw new Error('No active connected accounts found. Please connect an app first using /initiate endpoint.');
    }
    console.log('Found connected accounts:', connectedAccounts.length);

    // 4. Get all available tools from database
    const allTools = await Tool.find({
      slug: { $in: connectedAccounts.map(acc => acc.toolkit.slug) },
    });

    console.log(`Found ${allTools.length} total tools for user ${userId} across ${connectedAccounts.length} connected accounts`);

    // 5. Smart tool filtering - Use Gemini to identify relevant tools
    let relevantTools;

    if (allTools.length > 20) {
      console.log('Too many tools, using smart filtering...');

      // STEP 1: Pre-filter using keyword matching to reduce from 1000+ to ~50 tools
      console.log('Step 1: Pre-filtering with keyword matching...');
      const keywordFiltered = keywordBasedToolFilter(allTools, userMessage, 50); // Get top 50
      console.log(`Pre-filtered from ${allTools.length} to ${keywordFiltered.length} tools`);

      // STEP 2: Use AI on the pre-filtered list (now manageable size)
      const toolSummaries = keywordFiltered.map(tool => ({
        name: tool.name,
        description: tool.description || tool.name,
        category: tool.category || 'general'
      }));

      // Use Gemini to classify which tools are relevant from the pre-filtered list
      const classificationModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-preview-05-20'
      });

      const classificationPrompt = `Analyze this request and select relevant tools.

USER REQUEST: "${userMessage}"

PRE-FILTERED TOOLS (${toolSummaries.length} candidates - already filtered by keywords):
${toolSummaries.map((t, i) => `${i + 1}. ${t.name}`).join('\n')}

CRITICAL RULES - READ CAREFULLY:
1. Match OPERATION + RESOURCE:
   - "list/get branches" → MUST contain "LIST_BRANCHES" or "GET_BRANCH" (NOT delete, create, update)
   - "send email" → MUST contain "SEND" + "EMAIL/MESSAGE" (NOT get, list, delete)
   - "create issue" → MUST contain "CREATE" + "ISSUE" (NOT list, get, delete)

2. AVOID WRONG OPERATIONS:
   - If request says "list/get" → NEVER select DELETE/CREATE/UPDATE tools
   - If request says "create/add" → NEVER select LIST/GET/DELETE tools
   - If request says "delete/remove" → NEVER select LIST/GET/CREATE tools

3. RESOURCE MATCHING:
   - "branches" → Tools with "BRANCH" in name (NOT "variable", "artifact", "organization")
   - "repository" → Tools with "REPOSITORY" or "REPO" in name
   - "pull request" → Tools with "PULL" in name
   - "issue" → Tools with "ISSUE" in name

EXAMPLES OF CORRECT MATCHING:
- Request: "list branches" → Tool: GITHUB_LIST_BRANCHES ✓ (NOT GITHUB_DELETE_BRANCH ✗)
- Request: "get repository info" → Tool: GITHUB_GET_REPOSITORY ✓ (NOT GITHUB_DELETE_REPOSITORY ✗)
- Request: "send email" → Tool: GMAIL_SEND_MESSAGE ✓ (NOT GMAIL_DELETE_MESSAGE ✗)

YOUR TASK:
1. Read the user request
2. Identify: What OPERATION (list/get/create/delete) + What RESOURCE (branches/email/repository)
3. Select ONLY tools that match BOTH operation AND resource
4. Return JSON array of tool numbers (max 15)

RETURN FORMAT: [1, 5, 12]`;

      const classificationResult = await classificationModel.generateContent(classificationPrompt);
      const classificationText = classificationResult.response.text();

      console.log('Classification response:', classificationText);

      // Parse the response to get tool indices
      try {
        // Extract JSON array from response
        const jsonMatch = classificationText.match(/\[[\d\s,]+\]/);
        if (jsonMatch) {
          const selectedIndices = JSON.parse(jsonMatch[0]);
          // IMPORTANT: Map indices to keywordFiltered array, NOT allTools
          relevantTools = selectedIndices
            .filter(idx => idx >= 1 && idx <= toolSummaries.length)
            .map(idx => keywordFiltered[idx - 1])  // ✓ Use pre-filtered tools
            .filter(Boolean);

          console.log(`AI filtered to ${relevantTools.length} relevant tools:`, relevantTools.map(t => t.name));

          // Validate: If no tools selected or poor selection, use keyword fallback
          if (relevantTools.length === 0) {
            console.log('AI returned no tools, using keyword fallback');
            relevantTools = keywordBasedToolFilter(allTools, userMessage);
          }
        } else {
          // Fallback: use keyword matching
          console.log('Failed to parse AI classification, using keyword fallback');
          relevantTools = keywordBasedToolFilter(allTools, userMessage);
        }
      } catch (error) {
        console.error('Error parsing tool classification:', error);
        // Fallback: use keyword matching
        relevantTools = keywordBasedToolFilter(allTools, userMessage);
      }
    } else {
      // If tools <= 20, use all of them
      relevantTools = allTools;
      console.log(`Using all ${relevantTools.length} tools (under threshold)`);
    }

    // 6. Get full tool schemas from Composio for the selected tools
    const tools = await composio.tools.get(userId, {
      tools: relevantTools.map(t => t.name)
    });

    console.log(`Prepared ${tools.length} tools for Gemini`);

    // 7. Clean tool schemas for Gemini (remove unsupported fields)
    const cleanToolSchema = (schema) => {
      if (!schema) return schema;

      const cleaned = { ...schema };

      // Remove examples from properties
      if (cleaned.properties) {
        cleaned.properties = Object.entries(cleaned.properties).reduce((acc, [key, value]) => {
          const { examples, ...rest } = value;
          acc[key] = rest;

          // Recursively clean nested properties
          if (rest.properties) {
            rest.properties = cleanToolSchema({ properties: rest.properties }).properties;
          }
          if (rest.items && rest.items.properties) {
            rest.items.properties = cleanToolSchema({ properties: rest.items.properties }).properties;
          }

          return acc;
        }, {});
      }

      return cleaned;
    };

    // 8. Initialize Gemini model with cleaned tools
    const geminiTools = [{
      functionDeclarations: tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: cleanToolSchema(tool.function.parameters)
      }))
    }];

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-05-20',
      tools: geminiTools,
    });

    // 9. Build conversation history for Gemini
    const history = recentMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const systemPrompt = `You are a helpful assistant that can use various integrated apps and tools to help users.
Available tools: ${tools.map(t => t.function.name).join(', ')}

IMPORTANT RULES:
1. Always provide complete, non-null values for all required parameters
2. For missing information, use reasonable defaults or ask the user
3. Execute tools confidently when you have enough information
4. Chain multiple tools if the task requires it
5. Be concise and action-oriented`;

    // 10. Start chat with Gemini
    const chat = model.startChat({
      history: history,
      generationConfig: {
        temperature: 0,
      },
    });

    const result = await chat.sendMessage(systemPrompt + '\n\n' + userMessage);
    const response = result.response;

    console.log('Gemini response received');

    // 11. Check if tools were called
    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      console.log('Function calls detected:', functionCalls.length);

      // Convert Gemini function calls to OpenAI format for Composio compatibility
      const openAIFormatResponse = {
        choices: [{
          message: {
            tool_calls: functionCalls.map((fc, index) => ({
              id: `call_${Date.now()}_${index}`,
              type: 'function',
              function: {
                name: fc.name,
                arguments: JSON.stringify(fc.args)
              }
            }))
          }
        }]
      };

      // Execute tools via Composio
      const toolResults = await composio.provider.handleToolCalls(
        userId,
        openAIFormatResponse,
        {}
      );

      console.log(`Executed ${toolResults.length} tool(s)`);

      // Format results into human-readable text
      const formattedResponse = formatToolResults(toolResults, functionCalls);
      const toolNames = functionCalls.map(fc => fc.name);

      // 12. Save messages to conversation
      await conversationService.saveMessage(
        actualConversationId,
        userId,
        'user',
        userMessage,
        { timestamp: new Date() }
      );

      await conversationService.saveMessage(
        actualConversationId,
        userId,
        'assistant',
        formattedResponse,
        {
          toolsUsed: toolNames,
          executionTime: `${Date.now() - startTime}ms`,
          timestamp: new Date()
        }
      );

      // 13. Return result
      return {
        success: true,
        data: {
          response: formattedResponse,
          conversationId: actualConversationId,
          toolsUsed: toolNames,
          executionTime: `${Date.now() - startTime}ms`,
          messageCount: conversation.messageCount + 2
        }
      };
    } else {
      // No tool calls - just conversation
      const assistantMessage = response.text();

      // Save messages
      await conversationService.saveMessage(
        actualConversationId,
        userId,
        'user',
        userMessage
      );

      await conversationService.saveMessage(
        actualConversationId,
        userId,
        'assistant',
        assistantMessage
      );

      return {
        success: true,
        data: {
          response: assistantMessage,
          conversationId: actualConversationId,
          toolsUsed: [],
          executionTime: `${Date.now() - startTime}ms`,
          messageCount: conversation.messageCount + 2
        }
      };
    }
  } catch (error) {
    console.error('Error executing user request:', error);

    return {
      success: false,
      error: error.message,
      data: {
        response: `Sorry, I encountered an error: ${error.message}`,
        conversationId: conversationId,
        executionTime: `${Date.now() - startTime}ms`
      }
    };
  }
};

/**
 * Initiate authentication for an app
 */
export const initiateAuth = async (appName, userId) => {
  try {
    const authConfig = await AuthConfig.findOne({ app: appName });
    if (!authConfig) {
      throw new Error(`App with name ${appName} not found`);
    }
    console.log(`Initiating auth for app ${appName} and user ${userId} api key ${config.composio.orgApiKey}`);
    const connectionUrl = await composio.connectedAccounts.initiate(userId, authConfig.authConfigId);
    console.log('Connection URL generated:', connectionUrl);
    // Save to database
    const composioAuth = new ComposioAuth({
      userId: userId,
      authConfigId: authConfig.authConfigId,
      connectedAccountId: connectionUrl.id,
      status: 'pending',
      integrationId: connectionUrl.integrationId,
      redirectUrl: connectionUrl.redirectUrl,
      toolkit: {
        slug: appName,
      }
    });

    await composioAuth.save();

    return {
      success: true,
      data: connectionUrl
    };
  } catch (error) {
    console.error('Error initiating auth:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Wait for connection to complete
 */
export const waitForConnection = async (connectedAccountId) => {
  try {
    const connection = await composio.connectedAccounts.waitForConnection(connectedAccountId);

    // Update database
    await ComposioAuth.updateOne(
      { connectedAccountId: connectedAccountId },
      {
        status: connection.data.status,
        accessToken: connection.data.accessToken,
        refreshToken: connection.data.refreshToken,
        toolkit: connection.toolkit
      }
    );

    return {
      success: true,
      data: connection
    };
  } catch (error) {
    console.error('Error waiting for connection:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get user's connected accounts
 */
export const getUserConnectedAccounts = async (userId) => {
  try {
    const accounts = await ComposioAuth.find({
      userId: userId,
      status: 'ACTIVE'
    }).lean();

    return {
      success: true,
      data: accounts
    };
  } catch (error) {
    console.error('Error getting connected accounts:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export const composioService = {
  executeUserRequest,
  initiateAuth,
  waitForConnection,
  getUserConnectedAccounts
};
