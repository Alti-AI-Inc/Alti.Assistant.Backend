import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import httpStatus from 'http-status';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import UserModel from '../auth/auth.model.js';
import Llama from '../groq/groq.model.js';
import { paymentController } from '../payment/payment.controller.js';
import {
  QWEN_QWQ_RESPONSE_SERVICE_POST,
  QWEN_RESPONSE_SERVICE_POST,
} from './qwen.constant.js';

const sessionMemoryStore = {}; // Stores session memory for each user session

const QwenQWQSessionMemoryStore = {}; // Stores session memory for each user session

const QwenAiGetResponseService = async (prompt, userId, sessionId) => {
  let memory = sessionMemoryStore[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });
    sessionMemoryStore[sessionId] = memory;
  }

  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    apiKey: config.gemini_secret_key,
  });

  const chain = new ConversationChain({ llm: model, memory });
  logger.info('Memory Initialized:', memory);

  try {
    // Store user message in chat history
    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Invoke model
    const res1 = await chain.invoke({ input: prompt });
    logger.info('Model Response:', res1);

    const reply = res1?.response || 'No reply generated';

    try {
      const paymentResult =
        await paymentController.incrementPromptsUsed(userId);

      if (!paymentResult.success) {
        // return res
        //   .status(400)
        //   .json({ success: false, message: paymentResult.message });
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (error) {
      console.error('Error in incrementPromptsUsed:', error);

      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'An error occurred while updating prompt usage.'
      );
    }
    // Store AI response in chat history
    await memory.chatHistory.addMessage(new AIMessage(reply));

    // Save response in the database
    const responseData = {
      prompt,
      model: 'gemini-2.5-flash-thinking',
      reply,
      total_time: res1?.usage?.total_time || 0,
    };

    let llamaSession = await Llama.findOne({ user: userId, sessionId });

    if (llamaSession) {
      logger.info('Existing Session Found:', llamaSession);
      llamaSession?.responses?.push(responseData);
      await llamaSession.save();
      logger.info('Updated Session:', llamaSession);
    } else {
      logger.info('Creating New Session...');
      llamaSession = await Llama.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      logger.info('New Session Created:', llamaSession);
      await UserModel.findByIdAndUpdate(userId, {
        $push: { llamaAiSessions: llamaSession._id },
      });
    }
    const payload = {
      sessionId,
      prompt,
      reply,
    };

    if (payload) {
      await RedisClient.publish(
        QWEN_RESPONSE_SERVICE_POST,
        JSON.stringify(payload)
      );
    }

    return payload;
  } catch (error) {
    logger.error('Error in QwenAiGetResponseService:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
  }
};

const QwenQWQAiGetResponseService = async (prompt, userId, sessionId) => {
  // Initialize session memory for conversation history
  let memory = QwenQWQSessionMemoryStore[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });
    QwenQWQSessionMemoryStore[sessionId] = memory;
  }

  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    apiKey: config.gemini_secret_key,
  });

  const chain = new ConversationChain({ llm: model, memory });
  logger.info('Memory Initialized:', memory);

  try {
    // Store user message in chat history
    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Invoke model
    const res1 = await chain.invoke({ input: prompt });
    logger.info('Model Response:', res1);

    const reply = res1?.response || 'No reply generated';

    try {
      const paymentResult =
        await paymentController.incrementPromptsUsed(userId);

      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (error) {
      logger.error('Error in incrementPromptsUsed:', error);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'An error occurred while updating prompt usage.'
      );
    }

    // Store AI response in chat history
    await memory.chatHistory.addMessage(new AIMessage(reply));

    // Save response in the database
    const responseData = {
      prompt,
      model: 'gemini-2.5-flash-thinking',
      reply,
      total_time: res1?.usage?.total_time || 0,
    };

    let llamaSession = await Llama.findOne({ user: userId, sessionId });

    if (llamaSession) {
      logger.info('Existing Session Found:', llamaSession);
      llamaSession?.responses?.push(responseData);
      await llamaSession.save();
      logger.info('Updated Session:', llamaSession);
    } else {
      logger.info('Creating New Session...');
      llamaSession = await Llama.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      logger.info('New Session Created:', llamaSession);
      await UserModel.findByIdAndUpdate(userId, {
        $push: { llamaAiSessions: llamaSession._id },
      });
    }

    const payload = {
      sessionId,
      prompt,
      reply,
    };

    if (payload) {
      await RedisClient.publish(
        QWEN_QWQ_RESPONSE_SERVICE_POST,
        JSON.stringify(payload)
      );
    }
    return payload;
  } catch (error) {
    logger.error('Error in QwenQWQAiGetResponseService:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
  }
};
export const QwenAiServices = {
  QwenAiGetResponseService,
  QwenQWQAiGetResponseService,
};
