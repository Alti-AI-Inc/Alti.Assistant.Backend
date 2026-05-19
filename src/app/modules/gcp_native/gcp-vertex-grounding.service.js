import { GoogleGenerativeAI } from '@google/generative-ai';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { BufferMemory } from 'langchain/memory';
import httpStatus from 'http-status';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import Llama from '../groq/groq.model.js';
import { paymentController } from '../payment/payment.controller.js';
import { RedisClient } from '../../../shared/redis.js';
import { massiveSmartRouter } from '../../helpers/massiveSmartRouter.js';

// Initialize Generative AI client using our config
const client = new GoogleGenerativeAI(config.gemini_secret_key);

// Fetch a grounded model instance (with googleSearch tool active)
const groundedModel = client.getGenerativeModel({
  model: 'gemini-1.5-pro',
  generationConfig: { temperature: 0.1 },
  tools: [{ googleSearch: {} }],
});

const groundedMemoryStore = {};

/**
 * Executes a Gemini model query with active Google Search Grounding.
 * Parses and returns search queries, citations, and grounded web sources.
 */
const groundedPromptResponse = async (sessionId, prompt, userId) => {
  let memory = groundedMemoryStore[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });
    groundedMemoryStore[sessionId] = memory;
  }

  try {
    // Enhance prompt using massiveSmartRouter for deep context
    const enhancedPrompt = await massiveSmartRouter.routeAndEnhancePrompt(prompt);

    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Call Gemini AI with active search grounding
    logger.info(`Sending prompt with live Google Search Grounding: "${prompt.slice(0, 50)}..."`);
    const result = await groundedModel.generateContent(enhancedPrompt);
    
    const candidate = result?.response?.candidates?.[0];
    const reply = candidate?.content?.parts?.[0]?.text || 'No reply generated';
    
    // Parse Grounding Metadata
    const rawGroundingMetadata = candidate?.groundingMetadata || {};
    
    const groundingMetadata = {
      webSearchQueries: rawGroundingMetadata.webSearchQueries || [],
      groundingChunks: (rawGroundingMetadata.groundingChunks || []).map(chunk => ({
        title: chunk.web?.title || 'Web Reference',
        uri: chunk.web?.uri || ''
      })),
      searchEntryPoint: rawGroundingMetadata.searchEntryPoint?.renderedContent || ''
    };

    // Increment prompt usage metrics
    try {
      const paymentResult = await paymentController.incrementPromptsUsed(userId);
      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (error) {
      logger.error('Error incrementing prompts usage in grounding service:', error);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'An error occurred while updating prompt usage.'
      );
    }

    await memory.chatHistory.addMessage(new AIMessage(reply));

    const responseData = {
      prompt,
      model: 'gemini-1.5-pro-grounded',
      reply,
      groundingMetadata,
      total_time: result?.usage?.total_time || 0,
    };

    // Save prompt & response session in DB
    let session = await Llama.findOne({ user: userId, sessionId });
    if (session) {
      session.responses.push(responseData);
      await session.save();
    } else {
      session = await Llama.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      await UserModel.findByIdAndUpdate(userId, {
        $push: { llamaAiSessions: session._id },
      });
    }

    const payload = { prompt, sessionId, reply, groundingMetadata };
    
    // Publish response to Redis channels
    await RedisClient.publish(
      'GEMINI_RESPONSE_SERVICE_POST',
      JSON.stringify(payload)
    );

    return payload;
  } catch (err) {
    logger.error('GCP Vertex Grounding Service Error:', err);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `GCP Grounding Service failed: ${err.message}`
    );
  }
};

export const GcpVertexGroundingService = {
  groundedPromptResponse,
};
