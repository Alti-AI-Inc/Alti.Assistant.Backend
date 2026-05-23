import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import httpStatus from 'http-status';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import Llama from '../groq/groq.model.js';
import { paymentController } from '../payment/payment.controller.js';

const sessionMemoryStore = {}; // Stores session memory for each user session

const Llama4AiGetResponseService = async (prompt, userId, sessionId) => {
  // Initialize session memory for conversation history
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
    model: 'gemini-3.5-flash',
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
      model: 'llama3-8b-8192',
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

    const payload = { prompt, sessionId, reply };
    console.log('Payloadddddddddddddddd:', payload);
    return payload;
  } catch (error) {
    logger.error('Error in openAiResponseService:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
  }
};

export const Llama4AiServices = {
  Llama4AiGetResponseService,
};
