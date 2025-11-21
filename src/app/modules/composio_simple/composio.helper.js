import { GoogleGenAI } from "@google/genai";
import Tool from "../composio_v2/tools.model.js";
import { generateContent } from "./utils/gemini.js";
import config from "../../../../config/index.js";
import { sanitizeToolForGemini } from "./utils/toolSanitizer.js";
import { Composio } from "@composio/core";
import { GoogleProvider } from "@composio/google";

const gemini = new GoogleGenAI({ apiKey: config.gemini_secret_key });
import fs from "fs";


export async function findAppropriateApp(query, chatHistory = [], summarizedContext = '') {
  // Load available apps from JSON file
  const appsData = fs.readFileSync('./src/app/modules/composio_simple/available_apps.json', 'utf-8');
  const apps = JSON.parse(appsData);

  const toolKitsData = fs.readFileSync('./src/app/modules/composio_simple/toolkits.json', 'utf-8');
  const toolKits = JSON.parse(toolKitsData);

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

  const response = await generateContent(
    'gemini-3-pro-preview',
    [{ role: 'user', parts: [{ text: prompt }] }],
  );

  // Before parsing remove any extra text around the JSON array
  const jsonArrayText = response.candidates[0].content.parts[0].text.trim().match(/\[.*\]/s)[0];
  const appList = JSON.parse(jsonArrayText);
  console.log('Identified apps:', appList);

  const toolKitVersions = {};
  for (const app of appList) {
    toolKitVersions[app] = toolKits[app] || 'latest';
  }
  console.log('Toolkit versions to use:', toolKitVersions);

  return {
    toolKitVersions,
    appList
  };
}

async function embedQuery(text) {
  const res = await gemini.models.embedContent({
    model: "gemini-embedding-001",
    contents: [{ role: "user", parts: [{ text }] }],
    config: { outputDimensionality: 1536 }
  });

  return res.embeddings[0].values;
}

export const getVectorSearchResults = async (query, topK = 5, apps) => {
  const vector = await embedQuery(query);
  console.log("Vector length:", vector.length);
  console.log(vector.slice(0, 5));
  console.log('Apps filter:', apps);
  const result = await Tool.aggregate([
    {
      $vectorSearch: {
        index: "vector_index",     // or your index name
        path: "embedding",
        queryVector: vector,
        numCandidates: 200,
        limit: topK,
        filter: { appName: { $in: apps } }
      }
    },
    {
      $project: {
        name: 1,
        description: 1,
        slug: 1,
        version: 1,
        appName: 1,
        input_parameters: 1,
        score: { $meta: "vectorSearchScore" }
      }
    }
  ])

  console.log("Search results:", JSON.stringify(result.map(r => ({ name: r.name, slug: r.slug, score: r.score })), null, 2));
  return result;
}

export async function generateAndExecuteTools(query, tools, toolkitVersions, entityId) {
  const cleanedTools = tools.map(tool => sanitizeToolForGemini(tool));
  console.log('Entity ID for tool execution:', entityId);
  const response = await generateContent(
    'gemini-3-pro-preview',
    query,
    {
      tools: [{ functionDeclarations: cleanedTools }],
      thinkingConfig: {
        includeThoughts: false,
      }
    }
  );

  const contentParts = response.candidates[0].content.parts;
  console.log('Content parts:', JSON.stringify(contentParts, null, 2));
  console.log('--- Used Tool Calls ---', JSON.stringify(response.functionCalls, null, 2));

  if (response.functionCalls && response.functionCalls.length > 0) {
    const results = await executeMultipleTools(entityId, response.functionCalls, toolkitVersions);
    return { response, results };
  } else {
    console.log('No function calls in the response');
    console.log(response.text);
    return { response, results: [] };
  }
}

export async function generateUserMessasgeFromContext(userMessage, historySummary = '', history = []) {
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
    const response = await generateContent(
      'gemini-3-pro-preview',
      [{ role: 'user', parts: [{ text: prompt }] }]
    );
    const generatedMessage = response.candidates[0].content.parts[0].text.trim();
    console.log('Generated user message response:', generatedMessage);
    return generatedMessage;
  } catch (error) {
    console.error('Error generating user message from context:', error);
    return userMessage;
  }
}

export async function executeMultipleTools(entityId, functionCalls, toolkitVersions) {
  const results = [];
  const composio = new Composio({
    apiKey: config.composio.orgApiKey,
    provider: new GoogleProvider(),
    toolkitVersions
  });

  console.log('Entity before tool execution:', entityId);
  for (const funcCall of functionCalls) {
    console.log(`Calling tool ${funcCall.name}`);
    const functionCall = {
      name: funcCall.name || '',
      args: funcCall.args || {},
    };
    const result = await composio.provider.executeToolCall(entityId, functionCall);
    console.log(`Result:`, JSON.stringify(result, null, 2));
    results.push(result);
  }

  return results;
}