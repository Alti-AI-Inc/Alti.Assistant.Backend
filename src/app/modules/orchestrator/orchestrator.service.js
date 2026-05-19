import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';
import { logger } from '../../../shared/logger.js';
import { paymentController } from '../payment/payment.controller.js';
import { GeminiAiService } from '../gemini/gemini.service.js';

const client = new GoogleGenerativeAI(config.gemini_secret_key);

// For lightning-fast classification, use Flash and force strict JSON response
const model = client.getGenerativeModel({
  model: 'gemini-2.0-flash',
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
    // 1. FAST INTENT CLASSIFICATION
    logger.info(`[Orchestrator] Received prompt from user ${userId}. Classifying intent...`);
    const classificationResult = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: { role: "system", parts: [{ text: ORCHESTRATOR_SYSTEM_PROMPT }] }
    });

    let rawJson = classificationResult?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Clean markdown blocks if Gemini happens to ignore instructions
    rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let intentPayload;
    try {
      intentPayload = JSON.parse(rawJson);
    } catch (e) {
      logger.error('[Orchestrator] Failed to parse classification JSON. Defaulting to general_chat.', e);
      intentPayload = { target_module: 'general_chat', parameters: { query: prompt } };
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

    // 3. DISPATCH TO CORRECT MODULE
    let finalResponse;

    switch (target_module) {
      case 'general_chat':
      case 'code_generation': // Gemini is excellent at code, so we route it here too
        finalResponse = await GeminiAiService.geminiService(sessionId, parameters.query, userId);
        break;
      
      // Additional modules will be mapped here natively
      // case 'web_search':
      //   finalResponse = await TavilyAiService.search(parameters.query);
      //   break;

      default:
        // Fallback to standard conversational AI if module mapping is pending
        finalResponse = await GeminiAiService.geminiService(sessionId, prompt, userId);
        break;
    }

    return {
      conversationId: conversationId || null,
      orchestrator_decision: target_module,
      extracted_parameters: parameters,
      original_prompt: prompt,
      reply: finalResponse.reply, // Original root-level
      responseMessage: { answer: finalResponse.reply }, // Backwards compatibility for ChatInput.tsx
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
