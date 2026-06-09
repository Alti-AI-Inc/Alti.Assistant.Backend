import { GoogleGenAI } from '@google/genai';
import Tool from '../composio_v2/tools.model.js';
import { generateContent } from './utils/gemini.js';
import config from '../../../../config/index.js';
import { sanitizeToolForGemini } from './utils/toolSanitizer.js';
import { Composio } from '@composio/core';
import { GoogleProvider } from '@composio/google';

const gemini = new GoogleGenAI({ apiKey: config.gemini_secret_key });
import fs from 'fs/promises'; // Use fs.promises for asynchronous file operations

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

  console.log('Identified apps:', appList);

  const toolKitVersions = {};
  for (const app of appList) {
    toolKitVersions[app] = toolKits[app] || 'latest';
  }
  console.log('Toolkit versions to use:', toolKitVersions);

  return {
    toolKitVersions,
    appList,
  };
}

async function embedQuery(text) {
  const res = await gemini.models.embedContent({
    model: 'gemini-embedding-001',
    contents: [{ role: 'user', parts: [{ text }] }],
    config: { outputDimensionality: 1536 },
  });

  return res.embeddings[0].values;
}

export const getVectorSearchResults = async (query, topK = 5, apps) => {
  const vector = await embedQuery(query);
  console.log('Vector length:', vector.length);
  console.log(vector.slice(0, 5));
  console.log('Apps filter:', apps);
  const result = await Tool.aggregate([
    {
      $vectorSearch: {
        index: 'vector_index', // or your index name
        path: 'embedding',
        queryVector: vector,
        numCandidates: 200,
        limit: topK,
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
        toolkitVersions
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

export async function executeMultipleTools(
  entityId,
  functionCalls,
  toolkitVersions
) {
  const results = [];
  const composio = new Composio({
    apiKey: config.composio.orgApiKey,
    provider: new GoogleProvider(),
    toolkitVersions,
  });

  console.log('Entity before tool execution:', entityId);
  for (const funcCall of functionCalls) {
    console.log(`Attempting to call tool ${funcCall.name}`);
    const functionCall = {
      name: funcCall.name || '',
      args: funcCall.args || {},
    };
    try {
      const result = await composio.provider.executeToolCall(
        entityId,
        functionCall
      );
      console.log(`Result for ${funcCall.name}:`, JSON.stringify(result, null, 2));
      results.push({ tool: funcCall.name, status: 'success', result });
    } catch (error) {
      console.error(`Error executing tool ${funcCall.name}:`, error);
      // Push error information to results array to indicate failure for this specific tool,
      // but do not rethrow to allow other tools to attempt execution.
      results.push({ tool: funcCall.name, status: 'error', error: error.message });
    }
  }

  return results;
}