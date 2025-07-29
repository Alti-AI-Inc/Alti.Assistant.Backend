import { TavilySearch } from '@langchain/tavily';
import config from '../../../../../config/index.js';
import {
  checkIfSearchNeededForTheQueryUsingAi,
  generateOneQuestionFromMultipleQuestions,
  giveAnswerWithoutSearch,
  runSimpleGroqTask,
} from '../llm.js';

/**
 * Node: Performs a search using the Tavily tool based on the user's query.
 */
export const searchNode = async (state) => {
  console.log('--- Node: searchNode ---');
  const { query, history, depth } = state;
  const researchTool = new TavilySearch({
    tavilyApiKey: config.tavily_api_key, // Ensure the API key is set in your environment variables
    searchDepth: 'advanced', // Default to 'standard' if not provided
    maxResults: 5,
  });
  const updatedQuery = history
    ? await createTavilyQueryFromHistory(history, query)
    : query;

  console.log('Updated Query for Tavily Search:', updatedQuery, history);

  try {
    const response = await researchTool.invoke({ query: updatedQuery });
    const searchResults = response.results || [];

    const formattedResults = {
      answer: response.answer || null,
      results: searchResults.map((result, index) => ({
        title: result.title,
        url: result.url,
        content: result.content,
        score: result.score || index + 1,
      })),
      query,
      numResults: searchResults.length,
    };

    console.log(formattedResults);

    return {
      searchResults,
      query: updatedQuery,
      metadata: formattedResults,
      history: history || [],
    };
  } catch (error) {
    console.error('Error in searchNode:', error);
    return { searchResults: 'Error: Failed to perform the search.' };
  }
};

export const checkIfSearchNeededByAi = async (state) => {
  console.log('--- Node: checkIfSearchNeeded ---');
  const { query } = state;
  let response = await checkIfSearchNeededForTheQueryUsingAi(query);

  // Remove <think> tags from the response if they exist
  let cleanedResponse = response;
  if (response.includes('<think>')) {
    console.log('Response contains <think> tags. Removing them...');
    const regex = /<think>[\s\S]*?<\/think>/g;
    cleanedResponse = response.replace(regex, '').trim();
  }

  console.log('Cleaned response:', cleanedResponse);

  // Convert the cleaned response to boolean
  // Assuming the AI returns "true" or "false" as string, or "yes"/"no"
  const isSearchNeeded =
    cleanedResponse.toLowerCase().includes('true') ||
    cleanedResponse.toLowerCase().includes('yes') ||
    cleanedResponse.toLowerCase().includes('search');

  console.log('Is search needed:', isSearchNeeded);

  return { isSearchNeeded };
};

export const giveAnswer = async (state) => {
  console.log('--- Node: giveAnswer ---');
  const { query } = state;
  try {
    let cleanedResponse = '';
    const response = await giveAnswerWithoutSearch(query);
    if (response.includes('<think>')) {
      console.log('Response contains <think> tags. Removing them...');
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResponse = response.replace(regex, '').trim();
    }
    console.log('Answer without search:', cleanedResponse);
    return { answer: cleanedResponse };
  } catch (error) {
    console.error('Error in giveAnswerWithoutSearch:', error);
    return 'Error: Failed to give answer without search.';
  }
};

export const convertTheSearchResultsToGenerativeAnswerUsingAI = async (
  state
) => {
  console.log('--- Node: convertTheSearchResultsToGenerativeAnswerUsingAI ---');
  try {
    const response = await runSimpleGroqTask(state, true);
    // console.log("Synthesized Answer:", response);
    // Check if the response has <think> tags. Remove all text between <think> and </think> tags.
    let finalResponse = response;
    if (response.includes('<think>')) {
      console.log('Response contains <think> tags. Removing them...');
      const regex = /<think>[\s\S]*?<\/think>/g;
      finalResponse = response.replace(regex, '').trim();
    }

    //If finalResponse is json, parse it or return it as is
    console.log(
      'Synthesized Answer after removing <think> tags:',
      finalResponse
    );

    const metadata = state.metadata || {};
    console.log('Metadata for the search results:', metadata.results);

    const reference = metadata.results.map((result) => result.url);
    console.log('References are:', reference);

    return { answer: finalResponse, reference };
  } catch (error) {
    console.error(
      'Error in convertTheSearchResultsToGenerativeAnswerUsingAI:',
      error
    );
    return 'Error: Failed to synthesize the search results.';
  }
};

export const convertFollowUpSearchQueryByAi = async (state) => {
  console.log('--- Node: convertFollowUpSearchQueryByAi ---');
  const { query, history } = state;
  try {
    const followUpQuery = createTavilyQueryFromHistory(history, query);
    return { followUpQuery };
  } catch (error) {
    console.error('Error in convertFollowUpSearchQueryByAi:', error);
    return 'Error: Failed to convert follow-up search query.';
  }
};

const createTavilyQueryFromHistory = async (history, query) => {
  //Filter out the user's query from the history
  const userQuery = history
    .filter((h) => h.role === 'user')
    .map((h) => h.content)
    .join('\n');
  const updatedQuery = `Search for: "${userQuery}\n ${query}"`;
  let singleQuery = ''
  const response = await generateOneQuestionFromMultipleQuestions(
    history.map((h) => h.content)
  );
  if (response.includes('<think>')) {
      console.log('Response contains <think> tags. Removing them...');
      const regex = /<think>[\s\S]*?<\/think>/g;
      singleQuery = response.replace(regex, '').trim();
    }
  console.log('Single Query from History:', singleQuery);
  return singleQuery || updatedQuery;
};
