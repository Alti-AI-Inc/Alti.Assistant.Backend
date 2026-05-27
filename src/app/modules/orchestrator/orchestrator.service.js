import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';
import { logger } from '../../../shared/logger.js';
import { paymentController } from '../payment/payment.controller.js';
import { GeminiAiService } from '../gemini/gemini.service.js';
import { SwarmService } from '../swarm/swarm.service.js';
import Conversation from '../conversations/conversation.model.js';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { aiClassificationService } from '../composio_v2/aiClassification.service.js';
import { userMemoryService } from '../conversations/userMemory.service.js';

const client = new GoogleGenerativeAI(config.gemini_secret_key);

// For lightning-fast classification, use Flash and force strict JSON response
const model = client.getGenerativeModel({
  model: 'gemini-3.5-flash',
  generationConfig: {
    temperature: 0.1, // extremely low temp for high deterministic accuracy
    responseMimeType: "application/json",
  },
});

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Master Orchestrator (Synapse) for the Alti Assistant platform.
Your ONLY job is to classify the user's prompt into one of the supported backend modules and extract the required parameters.

Supported Modules:
1. "general_chat" - Standard conversational AI queries.
2. "web_search" - Queries requiring real-time internet search or browsing.
3. "image_generation" - Requests to create or modify images.
4. "document_analysis" - Requests to summarize or analyze specific files.
5. "legal_contract" - Requests explicitly related to drafting or reviewing contracts.
6. "code_generation" - Requests to write or debug code.
7. "connected_apps" - Requests requiring actions, tasks, or automations on third-party apps connected to the user's account (e.g., sending Gmail emails, posting Slack messages, fetching/creating GitHub issues, creating Jira tickets, adding contacts to HubSpot, etc.).

You MUST respond strictly with valid JSON matching this schema:
{
  "target_module": "string (must be one of the exact names above)",
  "parameters": {
    "query": "The optimized or extracted search/generation query string",
    "require_search": boolean
  }
}
Do NOT wrap the JSON in markdown blocks. Return pure raw JSON string.`;

const classifyAndDispatch = async (prompt, sessionId, userId, conversationId) => {
  try {
    // 0. LIGHTNING FAST PATH FOR COMMON GREETINGS / SHORT CONVERSATIONAL QUERIES
    const trimmedPrompt = prompt.trim().toLowerCase();
    const commonGreetings = ['hi', 'hello', 'hey', 'yo', 'sup', 'hola', 'bonjour', 'howdy', 'greetings', 'help', 'who are you', 'how are you', 'what is this'];
    const isShortQuery = trimmedPrompt.length <= 15;
    const isCommonGreeting = commonGreetings.includes(trimmedPrompt) || commonGreetings.some(greet => trimmedPrompt.startsWith(greet + ' ') || trimmedPrompt.endsWith(' ' + greet));
    
    let intentPayload;
    if (isShortQuery || isCommonGreeting) {
      logger.info(`[Orchestrator] Lightning-fast path triggered for greeting/short query: "${prompt}"`);
      intentPayload = { target_module: 'general_chat', parameters: { query: prompt } };
    } else {
      // 1. FAST INTENT CLASSIFICATION
      logger.info(`[Orchestrator] Received prompt from user ${userId}. Classifying intent...`);
      let rawJson = '{}';
      try {
        const classificationResult = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          systemInstruction: { role: "system", parts: [{ text: ORCHESTRATOR_SYSTEM_PROMPT }] }
        });
        rawJson = classificationResult?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      } catch (geminiErr) {
        logger.warn(`[Orchestrator] Gemini classification failed: ${geminiErr.message}. Falling back to Azure AI Foundry...`);
        try {
          if (!config.azure.endpoint || !config.azure.apiKey) {
            throw new Error('Azure AI Foundry endpoint or key is not configured.');
          }

          const { endpoint, apiKey, deploymentOrModel, apiVersion } = config.azure;
          const isAzureOpenAI = endpoint.includes('openai.azure.com') || endpoint.includes('deployments');

          let requestUrl = endpoint;
          let headers = {
            'Content-Type': 'application/json',
          };

          if (isAzureOpenAI) {
            headers['api-key'] = apiKey;
            if (!requestUrl.includes('/openai/deployments/')) {
              const baseUrl = requestUrl.split('/openai')[0];
              requestUrl = `${baseUrl}/openai/deployments/${deploymentOrModel}/chat/completions?api-version=${apiVersion}`;
            }
          } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
            if (!requestUrl.includes('/chat/completions')) {
              requestUrl = requestUrl.replace(/\/$/, '') + '/chat/completions';
            }
          }

          const response = await fetch(requestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...(isAzureOpenAI ? {} : { model: deploymentOrModel }),
              messages: [
                { role: 'system', content: ORCHESTRATOR_SYSTEM_PROMPT },
                { role: 'user', content: prompt }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1
            })
          });

          if (response.ok) {
            const data = await response.json();
            rawJson = data.choices?.[0]?.message?.content || '{}';
            logger.info('[Orchestrator] Successfully classified intent using Azure AI Foundry fallback.');
          } else {
            const errBody = await response.text();
            throw new Error(`Azure AI Foundry returned status ${response.status}: ${errBody}`);
          }
        } catch (azureErr) {
          logger.error('[Orchestrator] Both Gemini and Azure AI Foundry classification failed:', azureErr);
          rawJson = '{}';
        }
      }

      // Clean markdown blocks if LLM happens to ignore instructions
      rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        intentPayload = JSON.parse(rawJson);
      } catch (e) {
        logger.error('[Orchestrator] Failed to parse classification JSON. Defaulting to general_chat.', e);
        intentPayload = { target_module: 'general_chat', parameters: { query: prompt } };
      }
    }

    const { target_module, parameters } = intentPayload;
    logger.info(`[Orchestrator] Intent classified as: ${target_module} with parameters:`, parameters);

    // 2. CHECK CREDITS
    try {
      const paymentResult = await paymentController.incrementPromptsUsed(userId);
      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (error) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message || 'Payment usage update failed.');
    }

    // 3. DISPATCH TO CORRECT MODULE VIA SWARM ENGINE
    let finalResponse;

    switch (target_module) {
      case 'connected_apps':
        logger.info(`[Orchestrator] Connected apps routing triggered for prompt: "${prompt}"`);
        try {
          const composioResult = await aiClassificationService.processUserInputService(
            prompt,
            {
              userId,
              conversationId,
              isGuest: false,
            },
            null
          );
          if (composioResult.success) {
            finalResponse = {
              reply: composioResult.data?.responseMessage?.message || 'Action completed successfully.',
              executionResult: composioResult.data?.executionResult,
              toolResults: composioResult.data?.responseMessage?.toolResults || [],
            };
          } else {
            throw new Error(composioResult.error || 'Connected apps execution failed');
          }
        } catch (composioErr) {
          logger.error(`[Orchestrator] Connected apps routing failed: ${composioErr.message}. Falling back to collaborative Swarm...`);
          finalResponse = await SwarmService.executeSwarmSync(prompt, [], userId);
        }
        break;

      case 'general_chat':
      case 'code_generation':
        // Run collaborative multi-agent execution pipeline synchronously
        finalResponse = await SwarmService.executeSwarmSync(parameters.query || prompt, [], userId);
        break;
      
      default:
        // Default to collaborative multi-agent execution pipeline
        finalResponse = await SwarmService.executeSwarmSync(prompt, [], userId);
        break;
    }

    // 4. PERSIST CHAT TO DATABASE HISTORY
    let finalConversationId = conversationId;
    try {
      if (userId) {
        let conversation;
        if (finalConversationId && finalConversationId !== 'new-chat') {
          conversation = await Conversation.findOne({ conversationId: finalConversationId, userId });
        }
        
        if (conversation) {
          conversation.addMessage('user', prompt);
          conversation.addMessage('assistant', finalResponse.reply);
          await conversation.save();
          logger.info(`[Orchestrator] Appended message history for conversation: ${finalConversationId}`);
        } else {
          // Create new conversation
          finalConversationId = crypto.randomUUID();
          const cleanTitle = prompt.length > 40 ? `${prompt.substring(0, 40)}...` : prompt;
          conversation = new Conversation({
            conversationId: finalConversationId,
            userId,
            title: cleanTitle,
            messages: [
              { role: 'user', content: prompt, timestamp: new Date() },
              { role: 'assistant', content: finalResponse.reply, timestamp: new Date() }
            ],
            status: 'active'
          });
          await conversation.save();
          logger.info(`[Orchestrator] Created and persisted new conversation history: ${finalConversationId}`);
        }
      }
    } catch (dbErr) {
      logger.error('[Orchestrator] Failed to persist chat history to database:', dbErr);
      // Do not crash the entire response if database save fails
    }

    // 5. ASYNCHRONOUS CROSS-THREAD MEMORY FACT EXTRACTION (Hermes-style)
    if (userId && finalResponse.reply) {
      userMemoryService.asyncExtractFacts(userId, prompt, finalResponse.reply);
    }

    return {
      conversationId: finalConversationId || null,
      orchestrator_decision: target_module,
      extracted_parameters: parameters,
      original_prompt: prompt,
      reply: finalResponse.reply, // Original root-level
      responseMessage: { 
        answer: finalResponse.reply,
        reference: finalResponse.reference || finalResponse.citations || []
      }, // Backwards compatibility for ChatInput.tsx
      ...finalResponse // Spread additional data (like total_time, etc.)
    };
  } catch (err) {
    logger.error('Orchestrator Service Error:', err);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Orchestrator routing failed');
  }
};

export const orchestratorService = {
  classifyAndDispatch,
};
