import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../../config/index.js';
import { AgentExecutor, createReactAgent } from 'langchain/agents';
import { Composio, OpenAIProvider } from '@composio/core';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
  provider: new OpenAIProvider(),
});
/**
 * AI Classification Service using Gemini 3.5
 * This service handles AI-powered classification and reasoning tasks
 */
const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-3.5-flash',
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
});

const runGeminiTask = async (userPrompt, systemPrompt) => {
  try {
    // console.log('Running Gemini task with user prompt:', userPrompt);
    const response = await llm.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    // console.log('Gemini task completed successfully.');
    return response.content;
  } catch (error) {
    console.error('Error running Gemini task:', error);
    throw new Error('Failed to run Gemini task');
  }
};
import fs from 'fs';
export const executeComposioWithGemini = async (
  userId,
  userMessage,
  tools,
  apps,
  historySummary = null,
  conversationContext = null
) => {
  try {
    // console.log(`Executing Composio tools with Gemini for user: ${userId} ${userMessage}`);
    // console.log('History context available:', !!historySummary);

    // fs.writeFileSync(`${userId}_history.json`, JSON.stringify({
    //   userId,
    //   userMessage,
    //   tools,
    //   apps,
    //   historySummary,
    //   conversationContext
    // }, null, 2));

    // console.log(`Retrieved ${JSON.stringify(tools)} tools from Composio`);

    // Convert Composio tools to LangChain format
    const langchainTools = tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    }));
    // console.log('LangChain tools:', langchainTools[0].parameters);
    console.log('Tool length', tools.length);

    // Build context-aware system message
    let systemMessage = `You are a helpful assistant that can use various tools to help users. 
        Available tools: ${langchainTools.map((t) => t.name).join(', ')}.
        Available tools descriptions: ${langchainTools.map((t) => t.description).join(', ')}.
        Available tools parameters: ${JSON.stringify(
          langchainTools.map((t) => t.parameters),
          null,
          2
        )}.
        
        IMPORTANT RULES FOR TOOL CALLS:
        1. NEVER set parameters to null, undefined, or empty values
        2. If a required parameter is missing from user input, infer a reasonable default or ask for clarification
        3. For email tools: always provide a subject line if not specified (use a relevant default)
        4. For missing required fields, use these defaults:
           - subject: "Your [action] request" (e.g., "Your email request")
           - recipient_email: extract from user input or use provided email
           - body: create relevant content based on user intent
        5. Only call tools when you have all required parameters with valid non-null values
        
        When you need to use a tool, call it with the appropriate parameters.`;

    // Add conversation context if available
    if (historySummary && historySummary.context) {
      systemMessage += `\n\nCONVERSATION CONTEXT:
        - Previous app used: ${historySummary.context.lastApp || 'None'}
        - Previous action: ${historySummary.context.lastAction || 'None'}
        - Previous parameters: ${JSON.stringify(historySummary.context.lastParameters || {})}
        - Recent tools used: ${historySummary.context.recentTools.join(', ') || 'None'}
        - Conversation summary: ${historySummary.context.conversationSummary || 'New conversation'}
        - Total conversation turns: ${historySummary.context.totalTurns || 0}
        
        RECENT CONVERSATION:`;

      if (
        historySummary.recentConversation &&
        historySummary.recentConversation.length > 0
      ) {
        historySummary.recentConversation.forEach((msg) => {
          systemMessage += `\n        ${msg.role}: ${msg.content}`;
        });
      }

      systemMessage += `\n\nUse this context to better understand the user's current request and maintain continuity with previous actions.`;
    }

    // Create messages for Gemini
    const messages = [
      new SystemMessage(systemMessage),
      new HumanMessage(systemMessage),
    ];

    // console.log('System message with context:', systemMessage.substring(0, 500) + '...');

    // Execute with Gemini
    const response = await runGeminiTaskWithTools(
      [
        {
          role: 'user',
          content: systemMessage + '\n' + userMessage,
        },
      ],
      tools,
      userId,
      apps
    );
    console.log('Gemini task response:', response);

    return response;
  } catch (error) {
    console.error('Error in executeComposioWithGemini:', error);
    throw error;
  }
};

import ComposioAuth from '../composio.model.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Recursive helper to capitalize all parameter types for Gemini compatibility
const capitalizeTypes = (schema) => {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  
  const newSchema = Array.isArray(schema) ? [] : {};
  
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') {
      newSchema[key] = value.toUpperCase();
    } else if (typeof value === 'object') {
      newSchema[key] = capitalizeTypes(value);
    } else {
      newSchema[key] = value;
    }
  }
  
  return newSchema;
};

export const runGeminiTaskWithTools = async (
  messages,
  tools = [],
  userId,
  app
) => {
  try {
    const connectedAccount = await ComposioAuth.findOne({
      userId: userId,
      'toolkit.slug': app,
    });
    if (!connectedAccount) {
      throw new Error(`No connected account found for ${app}. Please connect your account first.`);
    }
    const connectedAccountId = connectedAccount.connectedAccountId;

    // Re-fetch tools with explicit connectedAccountId to avoid the warning
    const toolsWithConnectedAccount = await composio.tools.get(userId, {
      tools: tools.map((t) => t.function.name),
      connectedAccountId: connectedAccountId,
    });

    console.log('Tools with connected account:', toolsWithConnectedAccount);

    // Call Gemini using native @google/generative-ai
    const apiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
    const ai = new GoogleGenerativeAI(apiKey);

    // Translate Composio OpenAI tools to Gemini function declarations
    const geminiTools = toolsWithConnectedAccount.map(t => {
      const functionDecl = {
        name: t.function.name,
        description: t.function.description,
      };
      if (t.function.parameters) {
        functionDecl.parameters = capitalizeTypes(t.function.parameters);
      }
      return { functionDeclarations: [functionDecl] };
    });

    // Convert messages array to Gemini contents
    const contents = [];
    let systemInstruction = '';
    for (const msg of messages) {
      if (msg.role === 'system') {
        const sysText = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
        if (sysText) {
          systemInstruction = systemInstruction ? `${sysText}\n\n${systemInstruction}` : sysText;
        }
        continue;
      }
      
      let role = msg.role;
      if (role === 'assistant') role = 'model';
      else if (role !== 'user' && role !== 'model') role = 'user';
      
      const text = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
      if (!text) continue;
      
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts.push({ text });
      } else {
        contents.push({ role, parts: [{ text }] });
      }
    }

    if (contents.length > 0 && contents[0].role === 'model') {
      contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const modelOptions = {};
    if (systemInstruction) {
      modelOptions.systemInstruction = systemInstruction;
    }

    const modelInstance = ai.getGenerativeModel({
      model: 'gemini-3.5-flash',
      tools: geminiTools
    }, modelOptions);

    const response = await modelInstance.generateContent({ contents });
    const functionCalls = response.response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      const textResponse = response.response.text() || 'No reply generated';
      return {
        content: textResponse,
        success: true,
        tool_call_results: null,
      };
    }

    // Map Gemini function calling responses to the mocked OpenAI completion format
    const tool_calls = functionCalls.map((call, index) => ({
      id: `call_${Date.now()}_${index}`,
      type: 'function',
      function: {
        name: call.name,
        arguments: JSON.stringify(call.args)
      }
    }));

    const mockOpenAIMsg = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: tool_calls
          }
        }
      ]
    };

    console.log('Mocked OpenAI tool calls for Composio:', JSON.stringify(mockOpenAIMsg, null, 2));

    const result = await composio.provider.handleToolCalls(
      userId.toString(),
      mockOpenAIMsg,
      {
        connectedAccountId,
      }
    );
    console.log('Composio tool call execution result:', result);
    return {
      content: result[0].content,
      success: true,
      tool_call_results: result[0].content,
    };
  } catch (error) {
    console.error('Error in runGeminiTaskWithTools:', error);
    return {
      content: `Error processing request: ${error.message}`,
      success: false,
      error: error.message,
    };
  }
};

const handleComposioToolCalls = async (userId, toolCalls) => {
  const results = [];

  for (const toolCall of toolCalls) {
    try {
      console.log(`Executing tool: ${toolCall.name}`);

      // Execute the tool using Composio
      const result = await composio.actions.execute({
        actionName: toolCall.name,
        params: toolCall.args || {},
        userId: userId,
      });

      results.push({
        tool_call_id: toolCall.id,
        result: result,
        success: true,
      });
    } catch (error) {
      console.error(`Error executing tool ${toolCall.name}:`, error);
      results.push({
        tool_call_id: toolCall.id,
        result: { error: error.message },
        success: false,
      });
    }
  }

  return results;
};

/**
 * Classify user intent using AI
 */
export const classifyUserIntent = async (
  userInput,
  conversationContext = []
) => {
  const systemPrompt = `You are an expert AI assistant that classifies user requests for app integrations and actions.

SUPPORTED APPS AND ACTIONS:
- gmail: send_email, read_email, delete_email, mark_as_read, search_email
- github: create_issue, create_pr, list_repos, create_repo, star_repo, fork_repo
- calendar: create_event, list_events, update_event, delete_event, find_available_time
- linkedin: post_update, send_message, connect_user, share_article
- twitter: post_tweet, delete_tweet, follow_user, send_dm, like_tweet
- youtube: search_videos, upload_video, like_video, subscribe_channel
- notion: create_page, update_page, create_database, add_to_database
- amazon: search_product, add_to_cart, place_order, track_order
- slack: send_message, create_channel, invite_user, post_announcement
- discord: send_message, create_channel, manage_server

You must respond with ONLY a valid JSON object, no additional text or formatting.`;

  const userPrompt = `CONVERSATION CONTEXT:
${conversationContext.map((msg) => `${msg.role}: ${msg.content}`).join('\n')}

USER INPUT: "${userInput}"

Classify this input and respond with a JSON object:
{
  "app": "identified_app_name",
  "action": "identified_action", 
  "confidence": 0.95,
  "parameters": {
    "extracted_key": "extracted_value"
  },
  "metadata": {
    "reasoning": "explanation of classification"
  }
}`;

  try {
    const result = await runGeminiTask(userPrompt, systemPrompt);
    // Clean the response to ensure it's valid JSON
    let cleanedResult = '';
    if (result.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = result.replace(regex, '').trim();
    }

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }
    if (cleanedResult.startsWith('```')) {
      cleanedResult = cleanedResult
        .replace(/```\s*/, '')
        .replace(/\s*```$/, '');
    }

    // console.log('Classification result:', cleanedResult);

    const parsed = JSON.parse(cleanedResult);

    // Validate the structure
    if (
      !parsed.app ||
      !parsed.action ||
      typeof parsed.confidence !== 'number'
    ) {
      throw new Error('Invalid classification structure');
    }

    return parsed;
  } catch (error) {
    console.error('Error in classifyUserIntent:', error);
    // Return a fallback classification
    return {
      app: 'unknown',
      action: 'unknown',
      confidence: 0.0,
      parameters: {},
      metadata: {
        reasoning: 'Failed to classify user input',
        error: error.message,
      },
    };
  }
};

/**
 * Extract parameters for tool execution
 */
export const extractToolParameters = async (
  userInput,
  tool,
  existingParameters = {}
) => {
  const systemPrompt = `You are an expert parameter extraction system. Extract relevant parameters for API tool execution based on user input.

CRITICAL RULES:
1. NEVER set parameters to null, undefined, or empty strings for required fields
2. Always provide sensible defaults for missing required parameters
3. For email tools, always provide a subject line if not mentioned
4. Extract all relevant information from user input

Common parameter patterns:
- Email: to/recipient_email, subject, body, cc, bcc, attachments
- GitHub: title, body, labels, assignees, repository, branch
- Calendar: title, start_time, end_time, description, attendees, location
- Social Media: content, message, visibility, tags
- Search: query, filters, limit, sort_by

You must respond with ONLY a valid JSON object containing the parameters.`;

  const toolSchema = tool.function?.parameters;
  const requiredFields = toolSchema?.required || [];
  const toolProperties = toolSchema?.properties || {};

  const userPrompt = `TOOL: ${tool.name}
TOOL DESCRIPTION: ${tool.description || 'No description available'}
REQUIRED FIELDS: ${requiredFields.join(', ')}
TOOL SCHEMA: ${JSON.stringify(toolProperties, null, 2)}

USER INPUT: "${userInput}"

EXISTING PARAMETERS: ${JSON.stringify(existingParameters)}

Extract the necessary parameters for this tool based on the user input.
Merge with existing parameters where appropriate.
Ensure ALL required fields have valid non-null values.

For missing required fields, use these defaults:
- subject: Create a relevant subject based on the action
- recipient_email: Extract from user input
- body: Create relevant content based on user intent
- user_id: "me"

Respond with a JSON object:
{
  "parameters": {
    "param_name": "param_value"
  }
}`;

  try {
    const result = await runGeminiTask(userPrompt, systemPrompt);
    console.log('Raw parameter extraction result:', result);
    let cleanedResult = result;
    if (result.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = result.replace(regex, '').trim();
    }
    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }
    if (cleanedResult.startsWith('```')) {
      cleanedResult = cleanedResult
        .replace(/```\s*/, '')
        .replace(/\s*```$/, '');
    }
    const jsonMatch = cleanedResult.match(/```json([\s\S]*?)```/);
    // console.log('JSON match found:', jsonMatch);

    if (jsonMatch) {
      cleanedResult = jsonMatch[1];
    }
    console.log('Extracted parameters Cleaned Response:', cleanedResult);
    // console.log('Extracted parameters Cleaned Response:', cleanedResult);
    const parsed = JSON.parse(cleanedResult);
    return parsed.parameters || {};
  } catch (error) {
    console.error('Error in extractToolParameters:', error);
    return existingParameters;
  }
};

/**
 * Generate user-friendly response
 */
export const generateUserResponse = async (
  userInput,
  appName,
  actionName,
  executionResult,
  finalResponse,
  isError = false
) => {
  const systemPrompt = `You are a helpful AI assistant that creates natural, conversational responses for users after completing or attempting to complete their requests.

Generate responses that are:
- Friendly and conversational
- Informative but concise
- Action-oriented when appropriate
- Encouraging even when there are errors`;

  let userPrompt;

  if (isError) {
    userPrompt = `The user requested: "${userInput}"
App: ${appName}
Action: ${actionName}
Error occurred: ${finalResponse}

Generate a helpful error response that explains what went wrong and suggests next steps.`;
  } else {
    userPrompt = `The user requested: "${userInput}"
App: ${appName} 
Action: ${actionName}
Result: ${finalResponse}

Generate a friendly success response that confirms the action was completed and provides relevant details from the result.`;
  }

  try {
    const response = await runGeminiTask(userPrompt, systemPrompt);
    return response;
  } catch (error) {
    console.error('Error in generateUserResponse:', error);
    if (isError) {
      return `❌ I encountered an issue while trying to ${actionName} on ${appName}. Please check your connection and try again.`;
    } else {
      return `✅ Successfully completed ${actionName} on ${appName}!`;
    }
  }
};

/**
 * Filter tools by relevance to action
 */
export const filterToolsByRelevance = async (
  availableTools,
  actionName,
  appName
) => {
  if (!availableTools || availableTools.length === 0) {
    return [];
  }

  const systemPrompt = `You are an expert tool selection system. Given a list of available tools and a desired action, identify the most relevant tools.

You must respond with ONLY a JSON array of tool names in order of relevance.`;

  const userPrompt = `APP: ${appName}
DESIRED ACTION: ${actionName}

AVAILABLE TOOLS:
${availableTools.map((tool) => `- ${tool.name}: ${tool.description || 'No description'}`).join('\n')}

Identify the most relevant tools for the action "${actionName}".
Respond with a JSON array of tool names in order of relevance:
["tool_name_1", "tool_name_2", "tool_name_3"]

Return only the JSON array.`;

  try {
    const result = await runGeminiTask(userPrompt, systemPrompt);
    let cleanedResult = '';
    if (result.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = result.replace(regex, '').trim();
    }
    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }
    if (cleanedResult.startsWith('```')) {
      cleanedResult = cleanedResult
        .replace(/```\s*/, '')
        .replace(/\s*```$/, '');
    }

    const toolNames = JSON.parse(cleanedResult);

    // Filter the available tools to match the AI selection
    return availableTools.filter((tool) =>
      toolNames.some(
        (selectedName) =>
          tool.name.toLowerCase().includes(selectedName.toLowerCase()) ||
          selectedName.toLowerCase().includes(tool.name.toLowerCase())
      )
    );
  } catch (error) {
    console.error('Error in filterToolsByRelevance:', error);
    // Fallback: return tools that match action pattern
    return availableTools
      .filter(
        (tool) =>
          tool.name.toLowerCase().includes(actionName.toLowerCase()) ||
          actionName.toLowerCase().includes(tool.name.toLowerCase())
      )
      .slice(0, 3);
  }
};

export { runGeminiTask };

/**
 * Classify user intent to identify the app from available apps
 */
export const classifyAppIntent = async (
  userInput,
  availableApps,
  context = [],
  conversationContext = {}
) => {
  const {
    lastApp,
    lastAction,
    recentTools = [],
    userPreferences = {},
  } = conversationContext;

  const systemPrompt = `You are an AI app classifier with conversation memory. Your task is to identify which app the user wants to use based on their input and conversation context.

Available apps from database:
${availableApps.map((app) => `- ${app}`).join('\n')}

CONVERSATION CONTEXT:
- Last used app: ${lastApp || 'None'}
- Last action performed: ${lastAction || 'None'}
- Recent tools used: ${recentTools.join(', ') || 'None'}
- User preferences: ${JSON.stringify(userPreferences)}

Guidelines:
1. Analyze the user's input to determine which app they want to interact with
2. Consider conversation context - if they say "do the same thing" or "like before", use the last app
3. If they mention "again" or "same app", prioritize the last used app
4. Choose ONLY from the available apps listed above
5. Consider the context of recent conversation if provided
6. Return your response in JSON format with: {"app": "app_name", "confidence": 0.95, "reasoning": "explanation"}
7. If you're unsure, choose the most likely app and indicate lower confidence
8. If no app seems relevant, return {"app": null, "confidence": 0.0, "reasoning": "No relevant app found"}
9. Only give the json nothing extra

Recent conversation:
${context.map((msg) => `- ${msg.role}: ${msg.content}`).join('\n')}`;

  try {
    const response = await runGeminiTask(userInput, systemPrompt);

    let cleanResponse = response;

    if (response.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanResponse = response.replace(regex, '').trim();
    }
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse
        .replace(/```\s*/, '')
        .replace(/\s*```$/, '');
    }

    // console.log('App classification cleaned response:', cleanResponse);

    const parsed = JSON.parse(cleanResponse);

    return {
      app: parsed.app,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      metadata: {
        availableAppsCount: availableApps.length,
        contextLength: context.length,
        usedConversationContext: !!lastApp || !!lastAction,
      },
    };
  } catch (error) {
    console.error('Error in classifyAppIntent:', error);
    throw new Error('Failed to classify app intent');
  }
};

/**
 * Classify user intent to identify the action from available actions for the app
 */
export const classifyActionIntent = async (
  userInput,
  appName,
  availableActions,
  context = [],
  conversationContext = {}
) => {
  const {
    lastApp,
    lastAction,
    lastParameters = {},
    userPreferences = {},
  } = conversationContext;

  const systemPrompt = `You are an AI action classifier with conversation memory. Your task is to identify which action the user wants to perform with the "${appName}" app based on their input and conversation context.

Available actions for "${appName}" app from database:
${availableActions.map((action) => `- ${action.name}: ${action.description || 'No description'}`).join('\n')}

CONVERSATION CONTEXT:
- Last app used: ${lastApp || 'None'}
- Last action performed: ${lastAction || 'None'}
- Last parameters used: ${JSON.stringify(lastParameters)}
- User preferences: ${JSON.stringify(userPreferences)}

Guidelines:
1. Analyze the user's input to determine which action they want to perform with the "${appName}" app
2. Consider conversation context - if they say "do the same thing" or "repeat", use the last action
3. If they mention "again" or "same action", prioritize the last action if it's available for this app
4. Choose ONLY from the available actions listed above
5. Consider the context of recent conversation if provided
6. Return your response in JSON format with: {"action": "action_name", "confidence": 0.95, "reasoning": "explanation"}
7. If you're unsure, choose the most likely action and indicate lower confidence
8. If no action seems relevant, return {"action": null, "confidence": 0.0, "reasoning": "No relevant action found"}
9. Only give the json nothing extra

Recent conversation:
${context.map((msg) => `- ${msg.role}: ${msg.content}`).join('\n')}`;

  try {
    const response = await runGeminiTask(userInput, systemPrompt);

    let cleanResponse = response;

    if (response.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanResponse = response.replace(regex, '').trim();
    }
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse
        .replace(/```\s*/, '')
        .replace(/\s*```$/, '');
    }

    //Remove everything except the json
    const jsonMatch = cleanResponse.match(/```json([\s\S]*?)```/);
    // console.log('JSON match found:', jsonMatch);

    cleanResponse = jsonMatch ? jsonMatch[1] : cleanResponse;

    // console.log('Action classification cleaned response:', cleanResponse);

    const parsed = JSON.parse(cleanResponse);

    return {
      action: parsed.action,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      metadata: {
        appName,
        availableActionsCount: availableActions.length,
        contextLength: context.length,
        usedConversationContext: !!lastApp || !!lastAction,
      },
    };
  } catch (error) {
    console.error('Error in classifyActionIntent:', error);
    throw new Error('Failed to classify action intent');
  }
};

/**
 * Identify all required apps for a complex user intent
 */
export const identifyRequiredApps = async (
  userInput,
  availableApps,
  context = []
) => {
  const startTime = Date.now();
  const systemPrompt = `You are an expert app identification system. Analyze user input to identify ALL apps/services needed to complete their request.

User might need multiple apps for complex workflows like:
- "Get my GitHub issues and email them to john@company.com" → needs: github, gmail
- "Create a calendar event and post about it on Twitter" → needs: google_calendar, twitter
- "Search my emails and create a Notion page with the results" → needs: gmail, notion

Available apps: ${availableApps.join(', ')}

You must respond with ONLY a valid JSON object.`;

  const userPrompt = `USER INPUT: "${userInput}"

CONVERSATION CONTEXT: ${JSON.stringify(context)}

Analyze the user input and identify ALL apps that will be needed to complete this request.
Consider the full workflow from start to finish. Please return only json nothing else

Respond with a JSON object:
{
  "required_apps": ["app1", "app2"],
  "reasoning": "explanation of why these apps are needed",
  "workflow_type": "single_step|multi_step",
  "confidence": 0.95
}`;

  try {
    const result = await runGeminiTask(userPrompt, systemPrompt);
    let cleanedResult = result;

    if (result.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = result.replace(regex, '').trim();
    }

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }

    // console.log('Cleaned Result:', cleanedResult);

    const match = cleanedResult.match(/```json([\s\S]*?)```/);
    if (match) {
      cleanedResult = match[1];
    }
    // console.log('Cleaned Result After :', cleanedResult);
    const parsed = JSON.parse(cleanedResult);
    console.log('Parsed Result:', parsed);

    // Validate structure
    if (!parsed.required_apps || !Array.isArray(parsed.required_apps)) {
      throw new Error('Invalid required_apps structure');
    }
    const endTime = Date.now();
    console.log(
      `identifyRequiredApps execution time: ${endTime - startTime}ms`
    );
    return {
      requiredApps: parsed.required_apps,
      reasoning: parsed.reasoning || '',
      workflowType: parsed.workflow_type || 'single_step',
      confidence: parsed.confidence || 0.5,
    };
  } catch (error) {
    console.error('Error in identifyRequiredApps:', error);
    return {
      requiredApps: [],
      reasoning: 'Failed to identify required apps',
      workflowType: 'single_step',
      confidence: 0.0,
    };
  }
};

/**
 * Create execution plan for multi-step workflow
 */
export const createExecutionPlan = async (
  userInput,
  requiredApps,
  actionsMap,
  context = []
) => {
  const systemPrompt = `You are an expert workflow planning system. Create a detailed execution plan for complex user requests that require multiple apps/services.

You must analyze the user input and create a step-by-step execution plan that:
1. Identifies the correct sequence of actions
2. Handles data dependencies between steps
3. Extracts parameters for each step
4. Maps output from one step to input of next step

You must respond with ONLY a valid JSON object.`;

  const actionsDescription = Object.entries(actionsMap)
    .map(
      ([app, actions]) =>
        `${app}: ${actions.map((a) => `${a.name} (${a.description})`).join(', ')}`
    )
    .join('\n');

  const userPrompt = `USER INPUT: "${userInput}"

REQUIRED APPS: ${requiredApps.join(', ')}

AVAILABLE ACTIONS:
${actionsDescription}

CONVERSATION CONTEXT: ${JSON.stringify(context)}

Create a detailed execution plan that breaks down the user's request into sequential steps.
Each step should specify the app, action, parameters, and any data dependencies.

Respond with a JSON object:
{
  "plan": [
    {
      "step": 1,
      "app": "github",
      "action": "", //It has to be from actionDescriptions action name nothing outside of it.
      "description": "Fetch all GitHub issues for the user",
      "parameters": {
        "repository": "extracted_from_input_or_user_context",
        "state": "open"
      },
      "dependencies": [],
      "output_mapping": {
        "issues_list": "step_2.email_body"
      }
    },
    {
      "step": 2,
      "app": "gmail",
      "action": "", //It has to be from actionDescriptions action name nothing outside of it
      "description": "Send email with GitHub issues",
      "parameters": {
        "to": "extracted_from_input",
        "subject": "Your GitHub Issues",
        "body": "from_step_1.issues_list"
      },
      "dependencies": [1],
      "output_mapping": {}
    }
  ],
  "total_steps": 2,
  "execution_type": "sequential",
  "reasoning": "explanation of the plan"
}`;

  try {
    const result = await runGeminiTask(userPrompt, systemPrompt);
    let cleanedResult = result;

    if (result.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = result.replace(regex, '').trim();
    }

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }
    console.log('Cleaned Result:', cleanedResult);

    const parsed = JSON.parse(cleanedResult);

    // Validate structure
    if (!parsed.plan || !Array.isArray(parsed.plan)) {
      throw new Error('Invalid execution plan structure');
    }

    return {
      executionPlan: parsed.plan,
      totalSteps: parsed.total_steps || parsed.plan.length,
      executionType: parsed.execution_type || 'sequential',
      reasoning: parsed.reasoning || '',
      dependencyGraph: createDependencyGraph(parsed.plan),
    };
  } catch (error) {
    console.error('Error in createExecutionPlan:', error);
    return {
      executionPlan: [],
      totalSteps: 0,
      executionType: 'sequential',
      reasoning: 'Failed to create execution plan',
      dependencyGraph: {},
    };
  }
};

/**
 * Extract parameters that flow between workflow steps
 */
export const extractCrossStepParameters = async (
  userInput,
  executionPlan,
  stepResults = []
) => {
  const systemPrompt = `You are an expert parameter extraction system for multi-step workflows. 
Extract and map parameters that need to flow between different steps of a workflow.

You must respond with ONLY a valid JSON object.`;

  const userPrompt = `USER INPUT: "${userInput}"

EXECUTION PLAN: ${JSON.stringify(executionPlan)}
[]
COMPLETED STEP RESULTS: ${JSON.stringify(stepResults)}

Extract parameters for the workflow steps, considering:
1. Direct parameters from user input
2. Parameters that need to be passed between steps
3. Default values for missing parameters

Respond with a JSON object:
{
  "step_parameters": {
    "1": {
      "param_name": "param_value"
    },
    "2": {
      "param_name": "value_from_step_1_or_direct"
    }
  },
  "cross_step_mappings": {
    "step_1_output_field": "step_2_input_field"
  }
}`;

  try {
    const result = await runGeminiTask(userPrompt, systemPrompt);
    let cleanedResult = result;

    if (result.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = result.replace(regex, '').trim();
    }

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedResult);
    // console.log('Extracted cross-step parameters:', parsed);

    return {
      stepParameters: parsed.step_parameters || {},
      crossStepMappings: parsed.cross_step_mappings || {},
    };
  } catch (error) {
    console.error('Error in extractCrossStepParameters:', error);
    return {
      stepParameters: {},
      crossStepMappings: {},
    };
  }
};

/**
 * Helper function to create dependency graph from execution plan
 */
const createDependencyGraph = (plan) => {
  const graph = {};

  plan.forEach((step) => {
    graph[step.step] = {
      dependencies: step.dependencies || [],
      outputs: step.output_mapping || {},
      app: step.app,
      action: step.action,
    };
  });

  return graph;
};

/**
 * Generate execution summary for a completed step
 */
export const generateStepExecutionSummary = async (
  stepResult,
  executionPlan,
  currentStepIndex
) => {
  const systemPrompt = `You are an expert workflow summarizer. Generate a concise, actionable summary of a step execution result that will be used as context for subsequent steps.

Focus on:
1. What was accomplished in this step
2. Key data/information extracted or generated
3. Important outcomes that next steps might need
4. Any relevant context for the overall workflow

Keep the summary concise but informative. This will be passed to the next step as context.`;

  const userPrompt = `STEP EXECUTION SUMMARY REQUEST:

Step ${stepResult.step} Details:
- App: ${stepResult.app}
- Action: ${stepResult.action}
- Description: ${executionPlan[currentStepIndex]?.description || 'No description'}
- Parameters: ${JSON.stringify(stepResult.parameters)}

Execution Result:
${JSON.stringify(stepResult.result, null, 2)}

Overall Workflow Context:
- Total Steps: ${executionPlan.length}
- Current Step: ${stepResult.step}/${executionPlan.length}
- Remaining Steps: ${executionPlan
    .slice(currentStepIndex + 1)
    .map((s) => `${s.app}.${s.action}`)
    .join(', ')}

Generate a concise summary of what was accomplished in this step and any key information that should be passed to the next step.

Respond with a JSON object:
{
  "summary": "Concise summary of what was accomplished",
  "key_outputs": {
    "output_name": "output_value"
  },
  "context_for_next_step": "Relevant context for the next step",
  "status": "success|partial|failed"
}`;

  console.log(`STEP EXECUTION SUMMARY REQUEST:

Step ${stepResult.step} Details:
- App: ${stepResult.app}
- Action: ${stepResult.action}
- Description: ${executionPlan[currentStepIndex]?.description || 'No description'}
- Parameters: ${JSON.stringify(stepResult.parameters)}

Execution Result:
${JSON.stringify(stepResult.result, null, 2)}

Overall Workflow Context:
- Total Steps: ${executionPlan.length}
- Current Step: ${stepResult.step}/${executionPlan.length}
- Remaining Steps: ${executionPlan
    .slice(currentStepIndex + 1)
    .map((s) => `${s.app}.${s.action}`)
    .join(', ')}

Generate a concise summary of what was accomplished in this step and any key information that should be passed to the next step.

Respond with a JSON object:
{
  "summary": "Concise summary of what was accomplished",
  "key_outputs": {
    "output_name": "output_value"
  },
  "context_for_next_step": "Relevant context for the next step",
  "status": "success|partial|failed"
}`);

  try {
    const result = await runGeminiTask(userPrompt, systemPrompt);
    let cleanedResult = result;

    if (result.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = result.replace(regex, '').trim();
    }

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedResult);

    return {
      summary:
        parsed.summary || `Completed ${stepResult.app}.${stepResult.action}`,
      keyOutputs: parsed.key_outputs || {},
      contextForNextStep: parsed.context_for_next_step || '',
      status: parsed.status || 'success',
      timestamp: new Date(),
      stepNumber: stepResult.step,
    };
  } catch (error) {
    console.error('Error in generateStepExecutionSummary:', error);
    return {
      summary: `Completed step ${stepResult.step}: ${stepResult.app}.${stepResult.action}`,
      keyOutputs: {},
      contextForNextStep: `Previous step executed ${stepResult.action} on ${stepResult.app}`,
      status: 'unknown',
      timestamp: new Date(),
      stepNumber: stepResult.step,
    };
  }
};
