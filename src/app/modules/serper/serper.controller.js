import { Serper } from 'serper'; // Ensure Serper API is properly set up
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';

// const sessionMemoryStore = {}; // Stores LangChain memory for each session

// const SerperAiGetResponse = catchAsync(async (req, res) => {
//   const prompt = req.body?.prompt;
//   const userId = req.body?.user;
//   const sessionId = req.body?.sessionId || randomUUID();
//   const serper = new Serper({ apiKey: config.serper_api_key });

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

//   const searchResults = await serper.search({
//     q: query,
//     gl: 'us',
//     hl: 'en',
//   });

//   // Extract top 3 search results
//   const searchSummary = searchResults?.organic
//     ?.slice(0, 3)
//     .map(r => r.snippet)
//     .join(' ');

//   const formattedSearchResults =
//     searchResults?.organic?.slice(0, 3).map((r, index) => ({
//       title: r.title,
//       link: r.link,
//       snippet: r.snippet,
//       position: index + 1,
//     })) || [];

//   // Store search results in LangChain memory
//   let memory = sessionMemoryStore[sessionId];
//   if (!memory) {
//     memory = new BufferMemory({
//       returnMessages: true,
//       memoryKey: 'history',
//       chatHistory: new InMemoryChatMessageHistory(),
//     });
//     sessionMemoryStore[sessionId] = memory;
//   }

//   await memory.chatHistory.addMessage(
//     new AIMessage(`Search Results: ${searchSummary}`),
//   );

//   console.error('Error in Gemini AI:', error);
//   sendResponse(res, {
//     statusCode: httpStatus.INTERNAL_SERVER_ERROR,
//     success: false,
//     message: 'Failed to get response',
//     error: error.message,
//   });
// });

const SerperAiGetResponse = catchAsync(async (req, res) => {
  try {
    const prompt = req.body?.prompt;
    // const userId = req.body?.user;
    const serper = new Serper({ apiKey: config.serper_api_key });

    const searchResults = await serper.search({
      q: prompt,
      gl: 'us',
      hl: 'en',
    });

    // Extract top 3 search results
    const searchSummary = searchResults?.organic
      ?.slice(0, 3)
      .map(r => r.snippet)
      .join(' ');

    const formattedSearchResults =
      searchResults?.organic?.slice(0, 3).map((r, index) => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        position: index + 1,
      })) || [];

    return { searchSummary, formattedSearchResults };
  } catch (error) {
    console.error('Error fetching Serper results:', error);
    return { searchSummary: '', formattedSearchResults: [] };
  }
});

export const SerperAiController = {
  SerperAiGetResponse,
};


