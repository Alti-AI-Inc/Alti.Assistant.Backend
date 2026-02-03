import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatGroq } from '@langchain/groq';
import { randomUUID } from 'crypto';
import httpStatus from 'http-status';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import mongoose from 'mongoose';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import UserModel from '../auth/auth.model.js';
import { paymentController } from '../payment/payment.controller.js';
import { GROQ_RESPONSE_SERVICE_POST } from './groq.constant.js';
import Llama from './groq.model.js';
import { fetchSearchResults } from './groq.utilities.js';

const sessionMemoryStore = {}; // In-memory session store

// export const getAiResponsesGroqService = async (prompt, userId, sessionId) => {
//   // Initialize or retrieve memory
//   let memory = sessionMemoryStore[sessionId];
//   if (!memory) {
//     memory = new BufferMemory({
//       returnMessages: true,
//       memoryKey: 'history',
//       chatHistory: new InMemoryChatMessageHistory(),
//     });

//     // Optional: set a system message once at the beginning
//     await memory.chatHistory.addMessage(
//       new SystemMessage(
//         'You are a helpful AI assistant. Provide concise, professional, clear and deeply answers.',
//       ),
//     );

//     sessionMemoryStore[sessionId] = memory;
//   }

//   // Initialize Groq model
//   const model = new ChatGroq({
//     model: 'llama3-8b-8192', // You can upgrade to 'llama3-70b-8192' for better quality
//     temperature: 0.3, // More accurate, serious answers
//     apiKey: config.groq_api_key,
//   });

//   const chain = new ConversationChain({
//     llm: model,
//     memory,
//   });

//   try {
//     // Only invoke the model — ConversationChain handles memory updates automatically
//     const res1 = await chain.invoke({ input: prompt });
//     logger.info('Model Response:', res1);

//     const reply = res1?.response || 'No reply generated';

//     // Handle prompt usage tracking

//     try {
//       const paymentResult =
//         await paymentController.incrementPromptsUsed(userId);

//       if (!paymentResult.success) {
//         throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
//       }
//     } catch (error) {
//       logger.error('Error in incrementPromptsUsed:', error);
//       throw new ApiError(
//         httpStatus.INTERNAL_SERVER_ERROR,
//         error.message || 'An error occurred while updating prompt usage.',
//       );
//     }

//     // Save response in database
//     const responseData = {
//       prompt,
//       model: 'llama3-8b-8192',
//       reply,
//       total_time: res1?.usage?.total_time || 0,
//     };

//     let llamaSession = await Llama.findOne({ user: userId, sessionId });

//     if (llamaSession) {
//       logger.info('Existing Session Found:', llamaSession);
//       llamaSession.responses.push(responseData);
//       await llamaSession.save();
//       logger.info('Updated Session:', llamaSession);
//     } else {
//       logger.info('Creating New Session...');
//       llamaSession = await Llama.create({
//         user: userId,
//         sessionId,
//         responses: [responseData],
//       });
//       logger.info('New Session Created:', llamaSession);
//       await UserModel.findByIdAndUpdate(userId, {
//         $push: { llamaAiSessions: llamaSession._id },
//       });
//     }

//     return {
//       sessionId,
//       prompt,
//       reply,
//     };
//   } catch (error) {
//     logger.error('Error in getAiResponsesGroqService:', error);
//     throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
//   }
// };

 const getAiResponsesGroqService = async (prompt, userId, sessionId) => {
  let memory = sessionMemoryStore[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });

    // System prompt updated to enable generative, interactive behavior
    await memory.chatHistory.addMessage(
      new SystemMessage(
        `Your task is to assist the user with high-quality, detailed, and technically insightful answers.
    
- If the user's request is vague, ask clear and thoughtful follow-up questions to gather sufficient context.
- Once enough context is gathered, provide a comprehensive, accurate solution with clear reasoning.
- Ask smart and technical questions based on the user's input to uncover deeper requirements or nuances.
- Cover a broader range of relevant sectors and related knowledge, if applicable, to enrich your response.
- Always strive to give responses that are deep, well-structured, and actionable for the user.
`,
      ),
    );

    sessionMemoryStore[sessionId] = memory;
  }

  // Initialize Groq LLM
  const model = new ChatGroq({
    model: 'llama3-8b-8192',
    temperature: 0.4,
    apiKey: config.groq_api_key,
  });

  const chain = new ConversationChain({
    llm: model,
    memory,
  });

  try {
    const res = await chain.invoke({ input: prompt });
    const reply = res?.response || 'No reply generated';

    // Track prompt usage
    try {
      const paymentResult =
        await paymentController.incrementPromptsUsed(userId);
      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (err) {
      logger.error('Error in incrementPromptsUsed:', err);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        err.message || 'Prompt usage update error.',
      );
    }

    // Store in DB
    const responseData = {
      prompt,
      model: 'llama3-8b-8192',
      reply,
      total_time: res?.usage?.total_time || 0,
    };

    let llamaSession = await Llama.findOne({ user: userId, sessionId });

    if (llamaSession) {
      llamaSession.responses.push(responseData);
      await llamaSession.save();
    } else {
      llamaSession = await Llama.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
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
        GROQ_RESPONSE_SERVICE_POST,
        JSON.stringify(payload),
      );
    }
    return payload;
  } catch (err) {
    logger.error('Error in getAiResponsesGroqService:', err);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
  }
};
const MAX_MEMORY_SIZE = 12; // Limits stored messages per session
const AnonymousSessionMemoryStore = {}; // Stores session memory for each user session

const GroqAiGetResponseAnonymousService = async (
  prompt,
  sessionIdFromClient,
) => {
  const sessionId = sessionIdFromClient || randomUUID(); // Unique session ID if not provided

  if (!prompt) {
    throw ApiError(httpStatus.NOT_FOUND, 'Prompt is required.');
  }

  // Initialize memory if it doesn't exist
  if (!AnonymousSessionMemoryStore[sessionId]) {
    AnonymousSessionMemoryStore[sessionId] = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(), // Chat history storage
    });
  }
  const memory = AnonymousSessionMemoryStore[sessionId];

  // Retrieve previous chat history
  const previousMessages = await memory.chatHistory.getMessages();

  // Limit memory size to prevent excessive context
  if (previousMessages.length > MAX_MEMORY_SIZE) {
    memory.chatHistory.messages = previousMessages.slice(-MAX_MEMORY_SIZE);
  }

  // Fetch real-time search results from Serper
  const searchResults = await fetchSearchResults(prompt);
  const searchContext = searchResults
    .map((result, index) => `${index + 1}. ${result.title}: ${result.link}`)
    .join('\n');

  // Prepare conversation context (previous memory + search results)
  const enrichedPrompt = searchResults.length
    ? `Previous Conversation:\n${previousMessages
        .map(msg => `${msg._getType().toUpperCase()}: ${msg.text}`)
        .join(
          '\n',
        )}\n\nReal-Time Search Info:\n${searchContext}\n\nUser Query: ${prompt}`
    : `Previous Conversation:\n${previousMessages
        .map(msg => `${msg._getType().toUpperCase()}: ${msg.text}`)
        .join('\n')}\n\nUser Query: ${prompt}`;

  // Initialize the Groq model with LangChain
  const model = new ChatGroq({
    model: 'llama3-8b-8192',
    temperature: 0.7,
    apiKey: config.groq_api_key,
  });

  const chain = new ConversationChain({ llm: model, memory });

  // Add the new user message
  await memory.chatHistory.addMessage(new HumanMessage(prompt));

  // Invoke AI model with full conversation context
  const response = await chain.invoke({ input: enrichedPrompt });

  const reply = response?.response || 'No reply generated';

  // Store AI response in chat history
  await memory.chatHistory.addMessage(new AIMessage(reply));

  // Prepare response
  const responseData = {
    sessionId,
    prompt,
    reply,
    search_results: searchResults, // Include search results in response
  };

  return responseData;
};

const getAiResponsesByUserIdService = async userId => {
  const sessionData = await UserModel.findOne({
    _id: userId,
  })
    .select('email profile')
    .populate({
      path: 'llamaAiSessions',
    });
  // logger.info(sessionData, 'sessionData');
  if (!sessionData) {
    return {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Session not found',
      reply: sessionData,
    };
  }
  return sessionData;
};

const getAiResponsesBySession = async id => {
  const sessionData = await Llama.findOne({
    sessionId: id,
  });
  // logger.info(sessionData, 'sessionData');

  if (!sessionData) {
    return {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Session not found',
      response: sessionData,
    };
  }
  return sessionData;
};

const deleteOneLlamaAiSession = async objectId => {
  const userData = await Llama.findOne({
    _id: objectId,
  });
  if (!userData) {
    throw new Error('LlamaAiSession not found');
  }
  const deleteResult = await Llama.deleteOne({
    _id: objectId,
  });

  // Check if the LlamaAiSession was successfully deleted
  if (deleteResult.deletedCount === 1) {
    // Remove the LlamaAiSession reference from the user model
    const userUpdateResult = await UserModel.updateOne(
      { _id: userData.user },
      { $pull: { llamaAiSessions: objectId } },
    );

    logger.info(userUpdateResult, 'userUpdateResult userUpdateResult');

    // Check if the user model was successfully updated
    if (userUpdateResult.modifiedCount === 1) {
      return {
        success: true,
        message: 'LlamaAiSession and user reference deleted successfully',
      };
    } else {
      throw new Error('Failed to update the user model');
    }
  } else {
    throw new Error('Failed to delete the LlamaAiSession');
  }
};

const deleteAllAiSessionsService = async userId => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    // Fetch user data to get the LlamaAiSession array
    const user = await UserModel.findById(userId).session(session);
    if (
      !user ||
      !user.llamaAiSessions ||
      !Array.isArray(user.llamaAiSessions)
    ) {
      throw new Error('User or LlamaAiSession data not found');
    }

    const aiSessionIds = user.llamaAiSessions.map(id => id.toString());
    // logger.info('AI Session IDs to delete:', aiSessionIds);

    // Delete the AI sessions
    const deleteResults = await Promise.all(
      aiSessionIds.map(id => Llama.deleteOne({ _id: id }).session(session)),
    );

    // logger.info('Delete Results:', deleteResults);

    // Check if all AI sessions were successfully deleted
    const allDeleted = deleteResults.every(result => result.deletedCount === 1);
    if (!allDeleted) {
      throw new Error('Failed to delete one or more AI sessions');
    }

    // Remove the AI session references from the user model
    const userUpdateResult = await UserModel.updateOne(
      { _id: userId },
      { $pull: { llamaAiSessions: { $in: aiSessionIds } } },
    ).session(session);

    // logger.info('User update result:', userUpdateResult);

    if (userUpdateResult.acknowledged && userUpdateResult.modifiedCount > 0) {
      await session.commitTransaction();
      session.endSession();
      return {
        statusCode: 200,
        success: true,
        message: 'AI sessions and user references deleted successfully',
      };
    } else {
      throw new Error('Failed to update the user model');
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('An error occurred:', error);
    return {
      success: false,
      message: 'An internal server error occurred',
      error: error.message,
    };
  }
};

export const LlamaAiService = {
  getAiResponsesGroqService,
  GroqAiGetResponseAnonymousService,
  getAiResponsesByUserIdService,
  getAiResponsesBySession,
  deleteOneLlamaAiSession,
  deleteAllAiSessionsService,
};
