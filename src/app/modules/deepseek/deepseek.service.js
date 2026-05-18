import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import Groq from 'groq-sdk';
import httpStatus from 'http-status';
import { BufferMemory } from 'langchain/memory';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import Llama from '../groq/groq.model.js';
import { paymentController } from '../payment/payment.controller.js';
import { DEEPSEEK_RESPONSE_SERVICE_POST } from './deepseek.constatn.js';
import { RedisClient } from '../../../shared/redis.js';

const groq = new Groq(); // Initialize the Groq SDK

const sessionMemoryStore = {};

const deepseekResponseService = async (prompt, userId, sessionId) => {
  let memory = sessionMemoryStore[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });
    sessionMemoryStore[sessionId] = memory;
  }

  try {
    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    const startTime = Date.now(); // Record start time

    // Call Groq API to generate a response using the deepseek model
    const completion = await groq.chat.completions.create({
      // model: "deepseek-r1-distill-qwen-32b", // Use the deepseek model
      model: 'DeepSeek-R1-Distill-Llama-70B',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const endTime = Date.now(); // Record end time
    const totalTime = endTime - startTime; // Calculate total time taken

    const reply =
      completion.choices[0]?.message?.content || 'No reply generated';

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

    await memory.chatHistory.addMessage(new AIMessage(reply));

    const responseData = {
      prompt,
      model: 'DeepSeek-R1-Distill-Llama-70B',
      reply,
      total_time: totalTime, // Add total time to response data
    };

    let deepseekSession = await Llama.findOne({ user: userId, sessionId });

    if (deepseekSession) {
      deepseekSession.responses.push(responseData);
      await deepseekSession.save();
    } else {
      deepseekSession = await Llama.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      await UserModel.findByIdAndUpdate(userId, {
        $push: { llamaAiSessions: deepseekSession._id },
      });
    }
    const payload = { prompt, sessionId, reply };

    if (payload) {
      await RedisClient.publish(
        DEEPSEEK_RESPONSE_SERVICE_POST,
        JSON.stringify(payload)
      );
    }
    return payload;
  } catch (error) {
    logger.error('Error in openAiResponseService:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
  }
};

export const deepseekServices = {
  deepseekResponseService,
};
