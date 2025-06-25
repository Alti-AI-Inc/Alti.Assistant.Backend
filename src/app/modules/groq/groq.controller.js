import zepPackage from '@getzep/zep-js';
import { randomUUID } from 'crypto';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LlamaAiService } from './groq.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
// import { Serper } from 'serper';

const { ZepClient } = zepPackage;


// =========================================================
//          With Serper Groq and langchain
// ==========================================================

// const sessionMemoryStore = {}; // Stores session memory for each user session

// const GroqAiGetResponse = catchAsync(async (req, res) => {
//   const prompt = req.body?.prompt;
//   const userId = req.body?.user;
//   const sessionId = req.body?.sessionId || randomUUID(); // Unique session ID if not provided
//   logger.info('Serper API Key:', config.serper_api_key); // Debugging

//   if (!prompt) {
//     return sendResponse(res, {
//       statusCode: httpStatus.BAD_REQUEST,
//       success: false,
//       message: 'Validation Error',
//       errorMessages: [{ path: 'prompt', message: 'Prompt is required.' }],
//     });
//   }

//   const user = await UserModel.findById(userId);
//   if (!user) {
//     return sendResponse(res, {
//       statusCode: httpStatus.NOT_FOUND,
//       success: false,
//       message: 'User not found.',
//     });
//   }

//   // Initialize session memory for conversation history
//   let memory = sessionMemoryStore[sessionId];
//   if (!memory) {
//     memory = new BufferMemory({
//       returnMessages: true,
//       memoryKey: 'history',
//       chatHistory: new InMemoryChatMessageHistory(),
//     });
//     sessionMemoryStore[sessionId] = memory;
//   }

//   const model = new ChatGroq({
//     model: 'llama3-8b-8192',
//     temperature: 0.7,
//     apiKey: config.groq_api_key,
//   });

//   const chain = new ConversationChain({ llm: model, memory });
//   logger.info('Memory Initialized:', memory);

//   try {
//     // Fetch real-time search results using Serper
//     const serper = new Serper({ apiKey: config.serper_api_key });

//     const searchResults = await serper.search({
//       q: prompt,
//       gl: 'us',
//       hl: 'en',
//     });

//     // Extract top 3 search results
//     const searchSummary = searchResults?.organic
//       ?.slice(0, 3)
//       .map(r => r.snippet)
//       .join(' ');

//     // Format detailed search results
//     const formattedSearchResults =
//       searchResults?.organic?.slice(0, 3).map((r, index) => ({
//         title: r.title,
//         link: r.link,
//         snippet: r.snippet,
//         position: index + 1,
//       })) || [];
//     logger.info('Formatted Search Results:', formattedSearchResults);

//     const enrichedPrompt = searchSummary
//       ? `${prompt}\n\nAdditional Context: ${searchSummary}`
//       : prompt;

//     // Store user message in chat history
//     await memory.chatHistory.addMessage(new HumanMessage(enrichedPrompt));

//     // Invoke model with search-enhanced context
//     const res1 = await chain.invoke({ input: enrichedPrompt });
//     logger.info('Model Response:', res1);

//     const reply = res1?.response || 'No reply generated';

//     try {
//       const paymentResult = await paymentController.incrementPromptsUsed(userId);

//       if (!paymentResult.success) {
//         return res.status(400).json({ success: false, message: paymentResult.message });
//       }
//     } catch (error) {
//       console.error('Error in incrementPromptsUsed:', error);

//       // Send the full error message as a response
//       return res.status(400).json({
//         success: false,
//         message: error.message || 'An error occurred while updating prompt usage.',
//       });
//     }

//     // Store AI response in chat history
//     await memory.chatHistory.addMessage(new AIMessage(reply));

//     // Save response in the database
//     const responseData = {
//       prompt,
//       model: 'llama3-8b-8192',
//       reply,
//       search_results: formattedSearchResults,
//       total_time: res1?.usage?.total_time || 0,
//     };

//     let llamaSession = await Llama.findOne({ user: userId, sessionId });

//     if (llamaSession) {
//       logger.info('Existing Session Found:', llamaSession);
//       llamaSession?.responses?.push(responseData);
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

//     sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: 'Response processed successfully.',
//       data: {
//         sessionId,
//         prompt,
//         reply,
//         search_results: formattedSearchResults, // Include search results in response
//       },
//     });
//   } catch (error) {
//     console.error('Error in ConversationChain:', error);
//     sendResponse(res, {
//       statusCode: httpStatus.INTERNAL_SERVER_ERROR,
//       success: false,
//       message: 'Failed to get response',
//       error: error.message,
//     });
//   }
// });

// =========================================================
//          Without Serper
// ==========================================================

const GroqAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);
  logger.info('✅ Request received at /groq:', req.body); // log incoming request
  const result = await LlamaAiService.getAiResponsesGroqService(
    prompt,
    userId,
    sessionId,
  );
  // logger.info('✅ Service result:', result); // log result
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

const GroqAiGetResponseAnonymously = catchAsync(async (req, res) => {
  const prompt = req.body?.prompt;
  const sessionId = req.body?.sessionId || randomUUID(); // Fixed session for anonymous users

  const responseData = await LlamaAiService.GroqAiGetResponseAnonymousService(
    prompt,
    sessionId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: responseData,
  });
});

const LlamaAiGetResponseFromDbByUserId = catchAsync(async (req, res) => {
  // const id = req.params?.userId;
  // logger.info(id, 'session');
  const userId = req.user?._id;
  console.log(userId, 'userId from token in controller');
  const responseData =
    await LlamaAiService.getAiResponsesByUserIdService(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Response successfully',
    data: responseData,
  });
});

const LlamaAiGetResponseFromDbBySessionId = catchAsync(async (req, res) => {
  const id = req.params?.sessionId;
  // logger.info(id, 'session');

  const responseData = await LlamaAiService.getAiResponsesBySession(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Response successfully',
    data: responseData,
  });
});

const deleteOneAiSession = catchAsync(async (req, res) => {
  const id = req.params?.objectId;
  const result = await LlamaAiService.deleteOneLlamaAiSession(id);
  // logger.info(result, 'resultttt');
  if (!result.success) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'fail',
      error: result.message,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.NO_CONTENT,
    success: true,
    message: result?.message,
    data: result.message,
  });
});

const deleteAllAiSessions = catchAsync(async (req, res) => {
  // const id = req.params?.userId;
  const userId = req.user?._id;
  console.log(userId, 'userId from token in controller');
  const result = await LlamaAiService.deleteAllAiSessionsService(userId);
  // logger.info(result, 'resultttt');

  if (!result.success) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'fail',
      error: result.message,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.NO_CONTENT,
    success: true,
    message: 'Delete All Successfully',
    data: result,
  });
});

export const LlamaAiController = {
  GroqAiGetResponse,
  GroqAiGetResponseAnonymously,
  LlamaAiGetResponseFromDbByUserId,
  LlamaAiGetResponseFromDbBySessionId,
  deleteOneAiSession,
  deleteAllAiSessions,
};
