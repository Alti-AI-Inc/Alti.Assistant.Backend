import { ChatGroq } from '@langchain/groq';
import config from '../../../../../config/index.js';
import { AgentExecutor, createReactAgent } from 'langchain/agents';
import { Composio } from '@composio/core';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});
/**
 * AI Classification Service using Groq
 * This service handles AI-powered classification and reasoning tasks
 */
const llm = new ChatGroq({
  model: 'deepseek-r1-distill-llama-70b',
  apiKey: config.groq_api_key,
  temperature: 0,
  maxTokens: undefined,
  maxRetries: 2,
  // other params...
});

const runGroqTask = async (userPrompt, systemPrompt) => {
  try {
    console.log('Running Groq task with user prompt:', userPrompt);
    const response = await llm.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    console.log('Groq task completed successfully.');
    return response.content;
  } catch (error) {
    console.error('Error running Groq task:', error);
    throw new Error('Failed to run Groq task');
  }
};

export const executeComposioWithGroq = async (userId, userMessage, tools, apps) => {
  try {
    console.log(`Executing Composio tools with Groq for user: ${userId}`);

    console.log(`Retrieved ${JSON.stringify(tools)} tools from Composio`);

    // Convert Composio tools to LangChain format
    const langchainTools = tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    }));

    // Create messages for ChatGroq
    const messages = [
      new SystemMessage(`You are a helpful assistant that can use various tools to help users. 
        Available tools: ${langchainTools.map((t) => t.name).join(', ')}.
        When you need to use a tool, call it with the appropriate parameters.`),
      new HumanMessage(userMessage),
    ];

    // Execute with ChatGroq
    const response = await runGroqTaskWithTools(messages, tools, userId, apps);

    return response;
  } catch (error) {
    console.error('Error in executeComposioWithGroq:', error);
    throw error;
  }
};

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
function jsonSchemaToZod(jsonSchema) {
  // For simplicity, handle only object schemas here
  if (jsonSchema.type === 'object' && jsonSchema.properties) {
    const shape = {};
    for (const [key, value] of Object.entries(jsonSchema.properties)) {
      let zodType;
      if (value.type === 'string') zodType = z.string();
      else if (value.type === 'array') zodType = z.array(z.any());
      else if (value.type === 'boolean') zodType = z.boolean();
      else if (value.type === 'number' || value.type === 'integer')
        zodType = z.number();
      else zodType = z.any();

      if (!(jsonSchema.required || []).includes(key)) {
        zodType = zodType.optional();
      }
      shape[key] = zodType;
    }
    return z.object(shape);
  }
  return z.any();
}
export const runGroqTaskWithTools = async (messages, tools = [], userId, app) => {
  try {
    console.log('Running Groq task with Composio tools...', app);
    const connectedAccount = await composio.connectedAccounts.list({
      user_uuid: userId,
      appNames: app,
      status: 'ACTIVE',
    });
    console.log(
      'Using connected account:',
      connectedAccount,
      connectedAccount.items[0]?.id
    );
    const connectedAccountId = connectedAccount.items[0].id;
    console.log('Using connectedAccountId:', connectedAccountId);
    // Wrap each Composio tool into a LangChain DynamicStructuredTool

    const llm = new ChatGroq({
      model: 'deepseek-r1-distill-llama-70b',
      apiKey: config.groq_api_key,
      temperature: 0,
      maxTokens: undefined,
      maxRetries: 2,
    }).bindTools(tools);

    const response = await llm.invoke(messages);
    console.log('Groq task completed successfully.', response);
    if (response.tool_calls?.length) {
      for (const call of response.tool_calls) {
        console.log(`Processing tool call: ${call.name} with args:`, call.args);

        const tool = tools.find((t) => t.function.name === call.name);
        const result = await composio.tools.execute(tool.function.name, {
          userId: userId,
          connectedAccountId: connectedAccountId,
          arguments: call.args,
        });
        console.log(`Tool call result for ${call.name}:`, result);
      }
    }
    return {
      content: response.content,
      success: true,
    };
  } catch (error) {
    console.error('Error in runGroqTaskWithTools:', error);
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
    const result = await runGroqTask(userPrompt, systemPrompt);
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

    console.log('Classification result:', cleanedResult);

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

Common parameter patterns:
- Email: to, subject, body, cc, bcc, attachments
- GitHub: title, body, labels, assignees, repository, branch
- Calendar: title, start_time, end_time, description, attendees, location
- Social Media: content, message, visibility, tags
- Search: query, filters, limit, sort_by

You must respond with ONLY a valid JSON object containing the parameters.`;

  const userPrompt = `TOOL: ${tool.name}
TOOL DESCRIPTION: ${tool.description || 'No description available'}

USER INPUT: "${userInput}"

EXISTING PARAMETERS: ${JSON.stringify(existingParameters)}

Extract the necessary parameters for this tool based on the user input.
Merge with existing parameters where appropriate.

Respond with a JSON object:
{
  "parameters": {
    "param_name": "param_value"
  }
}`;

  try {
    const result = await runGroqTask(userPrompt, systemPrompt);
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
Error occurred: ${JSON.stringify(executionResult)}

Generate a helpful error response that explains what went wrong and suggests next steps.`;
  } else {
    userPrompt = `The user requested: "${userInput}"
App: ${appName} 
Action: ${actionName}
Result: ${JSON.stringify(executionResult, null, 2)}

Generate a friendly success response that confirms the action was completed and provides relevant details from the result.`;
  }

  try {
    const response = await runGroqTask(userPrompt, systemPrompt);
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
    const result = await runGroqTask(userPrompt, systemPrompt);
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

export { runGroqTask };
