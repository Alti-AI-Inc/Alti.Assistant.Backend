import { TavilySearch } from '@langchain/tavily';
import config from '../../../../../config/index.js';
import {
  checkIfSearchNeededForTheQueryUsingAi,
  createBetterQueryFromMultipleQuestions,
  giveAnswerWithoutSearch,
  runSimpleGroqTask,
  analyzeDirectAnswerQuality,
  manageConversationContext,
  shouldTrimContext,
  shouldSearchYouTube,
  searchYouTube,
  isVideoOnlyQuery,
} from '../llm.js';
import { tavily } from '@tavily/core';

/**
 * Node: Analyzes the conversation context and determines the response strategy
 */
export const analyzeContextNode = async (state) => {
  console.log('--- Node: analyzeContextNode ---');
  const { query, history } = state;

  try {
    // Build conversation context for the LLM
    const conversationContext =
      history.length > 0
        ? history.slice(-3) // Last 3 messages for context
        : [];

    console.log(
      `Analyzing query: "${query}" with ${conversationContext.length} context messages`
    );

    // First, check if this is a video-only query
    const isVideoOnly = isVideoOnlyQuery(query);

    if (isVideoOnly) {
      console.log(`Video-only query detected for: "${query}"`);

      // Generate contextualized query for video search
      let contextualizedQuery = query;
      if (history.length > 0) {
        contextualizedQuery = await createContextualizedQuery(history, query);
      }

      return {
        ...state, // Preserve existing state
        needsSearch: false, // Skip web search
        isSearchNeeded: false, // Skip web search
        isVideoOnlyQuery: true, // Flag for video-only routing
        contextualizedQuery,
        responseType: 'video_only',
      };
    }

    // Check if search is needed based on query and context
    const searchDecision = await checkIfSearchNeededForTheQueryUsingAi(
      query,
      conversationContext
    );

    console.log(`Raw LLM decision for "${query}": "${searchDecision}"`);

    // The LLM function already handles cleaning and returns "SEARCH" or "ANSWER"
    const isSearchNeeded = searchDecision === 'SEARCH';

    console.log(
      `Final decision: ${searchDecision} → Search needed: ${isSearchNeeded}`
    );

    // Generate contextualized query if search is needed
    let contextualizedQuery = query;
    if (isSearchNeeded && history.length > 0) {
      contextualizedQuery = await createContextualizedQuery(history, query);
    }

    console.log(`Search needed: ${isSearchNeeded}`);
    console.log(`Contextualized query: ${contextualizedQuery}`);

    return {
      ...state, // Preserve existing state
      needsSearch: isSearchNeeded, // Use needsSearch to match workflow routing
      isSearchNeeded, // Keep for backward compatibility
      isVideoOnlyQuery: false, // Not a video-only query
      contextualizedQuery,
      responseType: isSearchNeeded ? 'search' : 'direct',
    };
  } catch (error) {
    console.error('Error in analyzeContextNode:', error);
    return {
      ...state, // Preserve existing state
      needsSearch: false, // Default to direct answer on error
      isSearchNeeded: false,
      isVideoOnlyQuery: false,
      contextualizedQuery: query,
      responseType: 'direct',
    };
  }
};

/**
 * Node: Manages conversation context by trimming and summarizing when needed
 */
export const manageContextNode = async (state) => {
  console.log('--- Node: manageContextNode ---');
  const { history, conversationSummary } = state;

  try {
    // Manage the conversation context
    const contextResult = await manageConversationContext(history, conversationSummary);

    console.log(`Context management result:`, {
      managed: contextResult.contextManaged,
      trimmedCount: contextResult.trimmedMessageCount,
      keptCount: contextResult.keptMessageCount,
      hasSummary: !!contextResult.conversationSummary
    });

    return {
      ...state, // Preserve existing state
      history: contextResult.trimmedHistory,
      conversationSummary: contextResult.conversationSummary,
      contextManaged: contextResult.contextManaged,
    };
  } catch (error) {
    console.error('Error in manageContextNode:', error);

    // On error, preserve original state
    return {
      ...state,
      contextManaged: false,
    };
  }
};

/**
 * Node: Performs intelligent search using the contextualized query
 */
export const intelligentSearchNode = async (state) => {
  console.log('--- Node: intelligentSearchNode ---');
  const { contextualizedQuery, query, depth, previousSearchContext } = state;

  // Use contextualized query if available, otherwise fall back to original query
  const searchQuery = contextualizedQuery || query;

  // Check if we've already searched for similar content recently
  if (
    previousSearchContext &&
    isSimilarQuery(searchQuery, previousSearchContext)
  ) {
    console.log('Similar query detected, using cached context');
    return {
      searchResults: previousSearchContext.results,
      metadata: previousSearchContext.metadata,
      contextualizedQuery: searchQuery,
    };
  }

  // const researchTool = new TavilySearch({
  //   tavilyApiKey: config.tavily_api_key,
  //   searchDepth: depth === 'deep' ? 'advanced' : 'basic',
  //   maxResults: depth === 'deep' ? 10 : 6, // Increased for more comprehensive results
  //   includeAnswer: true, // Get Tavily's answer
  //   includeRawContent: true, // Get full page content
  //   includeImages: false, // Focus on text content for better performance
  //   includeDomains: [], // No domain restrictions for broader results
  //   excludeDomains: ['reddit.com', 'quora.com'], // Exclude low-quality sources
  // });
  const researchTool = tavily({
    apiKey: config.tavily_api_key,
  });

  try {
    console.log('Performing search with query:', searchQuery);
    const response = await researchTool.search(contextualizedQuery, {
      searchDepth: 'advanced',
      maxResults: 11,
      includeAnswer: 'advanced',
      chunksPerSource: 5,
    });

    const searchResults = response.results || [];
    console.log('Raw Tavily response:', response.answer);

    // Format results with detailed metadata for citations
    const formattedResults = {
      answer: response.answer || null,
      results: searchResults.map((result, index) => ({
        title: result.title || 'No title available',
        url: result.url || '#',
        content: result.content || result.snippet || 'No content available',
        rawContent: result.raw_content || result.rawContent || null,
        publishedDate: result.published_date || result.publishedDate || null,
        score: result.score || 1 - index * 0.1,
        // Enhanced content extraction - get more detailed content
        detailedContent: extractDetailedContent(result),
        contentLength: (result.content || '').length,
        domain: extractDomain(result.url),
        isRecent: isRecentContent(
          result.published_date || result.publishedDate
        ),
        citationIndex: index + 1, // Add citation index for references
      })),
      query: searchQuery,
      originalQuery: query,
      numResults: searchResults.length,
      searchTimestamp: new Date().toISOString(),
      tavilyAnswer: response.answer || null,
      searchDepth: depth || 'standard',
    };

    console.log(`Found ${searchResults.length} search results`);

    // Log sample of detailed content for debugging
    if (searchResults.length > 0) {
      console.log('Sample detailed content from first result:');
      console.log('Title:', searchResults[0]?.title);
      console.log(
        'Content length:',
        formattedResults.results[0]?.contentLength
      );
      console.log(
        'Has raw content:',
        !!formattedResults.results[0]?.rawContent
      );
      console.log('Domain:', formattedResults.results[0]?.domain);
      console.log('Is recent:', formattedResults.results[0]?.isRecent);
    }

    return {
      searchResults,
      contextualizedQuery: searchQuery,
      metadata: formattedResults,
      final_answer: response.answer || null,
      previousSearchContext: {
        query: searchQuery,
        results: searchResults,
        metadata: formattedResults,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    console.error('Error in intelligentSearchNode:', error);
    return {
      searchResults: [],
      metadata: { error: 'Failed to perform search', query: searchQuery },
      contextualizedQuery: searchQuery,
    };
  }
};

/**
 * Node: Performs YouTube search and combines with web search results
 */
export const youtubeSearchNode = async (state) => {
  console.log('--- Node: youtubeSearchNode ---');
  const { query, contextualizedQuery, history, conversationSummary, searchResults } = state;

  try {
    // Use the contextualized query if available, otherwise fall back to original query
    const searchQuery = contextualizedQuery || query;

    // Build context for YouTube relevance determination
    let fullContextHistory = [];

    if (conversationSummary) {
      fullContextHistory.push({
        role: 'system',
        content: `Previous conversation summary: ${conversationSummary}`
      });
    }

    fullContextHistory = fullContextHistory.concat(history || []);

    // Check if YouTube search is relevant for this query
    const isYouTubeRelevant = await shouldSearchYouTube(searchQuery, fullContextHistory);

    console.log(`YouTube search relevance for "${searchQuery}": ${isYouTubeRelevant}`);

    if (!isYouTubeRelevant) {
      console.log('YouTube search not relevant, skipping');
      return {
        youtubeResults: [],
        needsYouTubeSearch: false,
        combinedResults: searchResults || [],
      };
    }

    // Perform YouTube search
    const youtubeResults = await searchYouTube(searchQuery, 5);

    console.log(`Found ${youtubeResults.length} YouTube results`);

    // Combine web search results with YouTube results
    const webResults = searchResults || [];
    const combinedResults = [
      ...webResults.map(result => ({ ...result, source: 'web' })),
      ...youtubeResults
    ];

    // Sort combined results by relevance score if available
    combinedResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    console.log(`Combined ${webResults.length} web results with ${youtubeResults.length} YouTube results`);

    return {
      youtubeResults,
      needsYouTubeSearch: true,
      combinedResults,
      youtubeSearchPerformed: true,
    };

  } catch (error) {
    console.error('Error in youtubeSearchNode:', error);

    // On error, return original search results without YouTube
    return {
      youtubeResults: [],
      needsYouTubeSearch: false,
      combinedResults: searchResults || [],
      youtubeSearchPerformed: false,
      youtubeError: error.message,
    };
  }
};

/**
 * Node: Provides direct answer without search for simple queries
 */
export const directAnswerNode = async (state) => {
  console.log('--- Node: directAnswerNode ---');
  const { query, history, conversationSummary } = state;

  try {
    // Build context from conversation history and summary
    let contextualPrompt = query;

    // Combine summary and recent history for comprehensive context
    let fullContext = "";

    if (conversationSummary) {
      fullContext += `Previous conversation summary:\n${conversationSummary}\n\n`;
    }

    if (history.length > 0) {
      const recentHistory = history.slice(-4); // Last 4 messages for context
      const contextString = recentHistory
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n');
      fullContext += `Recent conversation:\n${contextString}`;
    }

    if (fullContext) {
      contextualPrompt = `${fullContext}\n\nCurrent question: ${query}`;
    }

    const response = await giveAnswerWithoutSearch(contextualPrompt);

    // Clean response
    let cleanedResponse = response;
    if (response.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResponse = response.replace(regex, '').trim();
    }

    console.log(
      'Direct answer provided:',
      cleanedResponse.substring(0, 100) + '...'
    );

    return {
      directAnswer: cleanedResponse, // Store the direct answer for analysis
      answer: cleanedResponse,
      responseType: 'direct',
      reference: [], // No references for direct answers
    };
  } catch (error) {
    console.error('Error in directAnswerNode:', error);
    return {
      directAnswer: 'I apologize, but I encountered an error while processing your question. Could you please rephrase it?',
      answer: 'I apologize, but I encountered an error while processing your question. Could you please rephrase it?',
      responseType: 'error',
      reference: [],
    };
  }
};

/**
 * Node: Analyzes the quality of direct answer to determine if search is needed
 */
export const analyzeAnswerQualityNode = async (state) => {
  console.log('--- Node: analyzeAnswerQualityNode ---');
  const { directAnswer, query, history, conversationSummary } = state;

  try {
    // Build complete context for analysis (summary + recent history)
    let fullContextHistory = [];

    if (conversationSummary) {
      // Add summary as context
      fullContextHistory.push({
        role: 'system',
        content: `Previous conversation summary: ${conversationSummary}`
      });
    }

    // Add recent history
    fullContextHistory = fullContextHistory.concat(history);

    // Analyze if the direct answer is adequate or needs search
    const qualityAssessment = await analyzeDirectAnswerQuality(
      directAnswer,
      query,
      fullContextHistory
    );

    console.log(`Answer quality analysis for "${query}": ${qualityAssessment}`);

    const needsSearchFallback = qualityAssessment === 'INADEQUATE';

    return {
      ...state, // Preserve existing state
      answerQuality: qualityAssessment,
      needsSearchFallback,
      analysisComplete: true,
    };
  } catch (error) {
    console.error('Error in analyzeAnswerQualityNode:', error);

    // On error, assume the direct answer is adequate to avoid infinite loops
    return {
      ...state,
      answerQuality: 'ADEQUATE',
      needsSearchFallback: false,
      analysisComplete: true,
    };
  }
};

/**
 * Node: Checks if YouTube search would enhance a direct answer
 */
export const checkYouTubeRelevanceNode = async (state) => {
  console.log('--- Node: checkYouTubeRelevanceNode ---');
  const { query, history, conversationSummary, answerQuality } = state;

  try {
    // Only check YouTube relevance if the direct answer was adequate
    if (answerQuality !== 'ADEQUATE') {
      console.log('Direct answer was inadequate, skipping YouTube relevance check');
      return {
        ...state,
        needsYouTubeSearch: false,
        youtubeRelevanceChecked: true,
      };
    }

    // Build context for YouTube relevance determination
    let fullContextHistory = [];

    if (conversationSummary) {
      fullContextHistory.push({
        role: 'system',
        content: `Previous conversation summary: ${conversationSummary}`
      });
    }

    fullContextHistory = fullContextHistory.concat(history || []);

    // Check if YouTube search would add value to the direct answer
    const isYouTubeRelevant = await shouldSearchYouTube(query, fullContextHistory);

    console.log(`YouTube relevance for direct answer on "${query}": ${isYouTubeRelevant}`);

    return {
      ...state,
      needsYouTubeSearch: isYouTubeRelevant,
      youtubeRelevanceChecked: true,
    };

  } catch (error) {
    console.error('Error in checkYouTubeRelevanceNode:', error);

    // On error, skip YouTube search to avoid disrupting the flow
    return {
      ...state,
      needsYouTubeSearch: false,
      youtubeRelevanceChecked: true,
      youtubeError: error.message,
    };
  }
};

/**
 * Node: Performs YouTube search for direct answers (without web search)
 */
export const youtubeSearchForDirectAnswerNode = async (state) => {
  console.log('--- Node: youtubeSearchForDirectAnswerNode ---');
  const { query, contextualizedQuery, history, conversationSummary, needsYouTubeSearch } = state;

  try {
    // Skip YouTube search if not needed
    if (!needsYouTubeSearch) {
      console.log('YouTube search not needed for direct answer');
      return {
        youtubeResults: [],
        combinedResults: [],
        youtubeSearchPerformed: false,
      };
    }

    // Use the contextualized query if available, otherwise fall back to original query
    const searchQuery = contextualizedQuery || query;

    console.log(`Performing YouTube search for direct answer: "${searchQuery}"`);

    // Perform YouTube search
    const youtubeResults = await searchYouTube(searchQuery, 3); // Fewer results for direct answers

    console.log(`Found ${youtubeResults.length} YouTube results for direct answer`);

    return {
      youtubeResults,
      combinedResults: youtubeResults, // For direct answers, only YouTube results
      youtubeSearchPerformed: true,
    };

  } catch (error) {
    console.error('Error in youtubeSearchForDirectAnswerNode:', error);

    // On error, continue without YouTube results
    return {
      youtubeResults: [],
      combinedResults: [],
      youtubeSearchPerformed: false,
      youtubeError: error.message,
    };
  }
};

/**
 * Node: Synthesizes direct answers with YouTube results
 */
export const synthesizeDirectAnswerWithYouTubeNode = async (state) => {
  console.log('--- Node: synthesizeDirectAnswerWithYouTubeNode ---');
  const {
    directAnswer,
    youtubeResults,
    query,
    history,
    conversationSummary,
    youtubeSearchPerformed
  } = state;

  try {
    // If no YouTube results, just return the direct answer
    if (!youtubeSearchPerformed || !youtubeResults || youtubeResults.length === 0) {
      console.log('No YouTube results to synthesize, returning direct answer');
      return {
        answer: directAnswer,
        responseType: 'direct',
        reference: [],
      };
    }

    console.log(`Synthesizing direct answer with ${youtubeResults.length} YouTube results`);

    // Create a combined response that includes the direct answer plus YouTube recommendations
    let combinedAnswer = directAnswer;

    // Add YouTube recommendations
    if (youtubeResults.length > 0) {
      combinedAnswer += '\n\n**For visual demonstrations and additional information, you might find these helpful:**\n';

      youtubeResults.forEach((video, index) => {
        combinedAnswer += `\n[${index + 1}] 🎥 **${video.title}**\n`;
        combinedAnswer += `   Channel: ${video.channelTitle}\n`;
        combinedAnswer += `   ${video.url}\n`;
        if (video.description && video.description.length > 0) {
          const shortDesc = video.description.length > 100
            ? video.description.substring(0, 100) + '...'
            : video.description;
          combinedAnswer += `   ${shortDesc}\n`;
        }
      });
    }

    // Create references for YouTube videos
    const references = youtubeResults.map((video, index) => ({
      title: `🎥 ${video.title}`,
      url: video.url,
      source: 'youtube',
      index: index + 1
    }));

    console.log('Combined direct answer with YouTube results');

    return {
      answer: combinedAnswer,
      responseType: 'direct_with_youtube',
      reference: references,
    };

  } catch (error) {
    console.error('Error in synthesizeDirectAnswerWithYouTubeNode:', error);

    // On error, fall back to direct answer only
    return {
      answer: directAnswer || 'I apologize, but I encountered an error while processing your question.',
      responseType: 'direct',
      reference: [],
    };
  }
};

/**
 * Node: Performs YouTube-only search for video-specific queries
 */
export const videoOnlySearchNode = async (state) => {
  console.log('--- Node: videoOnlySearchNode ---');
  const { query, contextualizedQuery, history, conversationSummary } = state;

  try {
    // Use the contextualized query if available, otherwise fall back to original query
    const searchQuery = contextualizedQuery || query;

    console.log(`Performing video-only YouTube search for: "${searchQuery}"`);

    // Perform YouTube search - get more results to find the most relevant one
    const youtubeResults = await searchYouTube(searchQuery, 5); // Get a few results to pick the best

    console.log(`Found ${youtubeResults.length} YouTube results for video-only query`);

    return {
      youtubeResults,
      combinedResults: youtubeResults, // For video-only, YouTube is the only source
      youtubeSearchPerformed: true,
      needsYouTubeSearch: true,
      searchResults: [], // No web search results
    };

  } catch (error) {
    console.error('Error in videoOnlySearchNode:', error);

    return {
      youtubeResults: [],
      combinedResults: [],
      youtubeSearchPerformed: false,
      youtubeError: error.message,
      searchResults: [],
    };
  }
};

/**
 * Node: Synthesizes video-only results into a conversational response
 */
export const videoOnlySynthesisNode = async (state) => {
  console.log('--- Node: videoOnlySynthesisNode ---');
  const {
    youtubeResults,
    query,
    history,
    contextualizedQuery,
    conversationSummary,
  } = state;

  try {
    console.log(`Synthesizing video-only response with ${youtubeResults?.length || 0} YouTube results`);

    // Build context from conversation history and summary
    let fullContext = "";

    if (conversationSummary) {
      fullContext += `Previous conversation summary:\n${conversationSummary}\n\n`;
    }

    if (history.length > 0) {
      const recentHistory = history.slice(-3); // Last 3 messages for context
      const contextString = recentHistory
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n');
      fullContext += `Recent conversation:\n${contextString}\n\n`;
    }

    // If no YouTube results found, provide a helpful message
    if (!youtubeResults || youtubeResults.length === 0) {
      const fallbackMessage = `I couldn't find any relevant videos for "${query}". Try searching directly on YouTube with different keywords.`;

      return {
        answer: fallbackMessage,
        reference: [],
        responseType: 'video_only_no_results',
      };
    }

    // Get the most relevant video (first result is usually most relevant)
    const mostRelevantVideo = youtubeResults[0];

    // Create a descriptive response with the video link
    const videoResponse = `Here's the most relevant video I found for your request:

🎥 **${mostRelevantVideo.title}**
📺 Channel: ${mostRelevantVideo.channelTitle}
🔗 **Video Link:** ${mostRelevantVideo.url}

Click the link above to watch the video on YouTube!`;

    // Create a single reference for the most relevant video
    const references = [{
      title: `🎥 ${mostRelevantVideo.title}`,
      url: mostRelevantVideo.url,
      source: 'youtube',
      index: 1
    }];

    console.log(`Returning most relevant video: ${mostRelevantVideo.title}`);
    console.log(`Video URL: ${mostRelevantVideo.url}`);

    return {
      answer: videoResponse,
      reference: references,
      responseType: 'video_only_synthesis',
    };

  } catch (error) {
    console.error('Error in videoOnlySynthesisNode:', error);

    return {
      answer: 'I encountered an error while searching for videos. Please try rephrasing your query or search directly on YouTube.',
      reference: [],
      responseType: 'video_only_error',
    };
  }
};

/**
 * Node: Synthesizes search results into a conversational response
 */
export const conversationalSynthesisNode = async (state) => {
  console.log('--- Node: conversationalSynthesisNode ---');
  const {
    searchResults,
    youtubeResults,
    combinedResults,
    metadata,
    query,
    history,
    contextualizedQuery,
    final_answer,
  } = state;

  try {
    // Use combined results if available, otherwise fall back to regular search results
    const resultsToUse = combinedResults && combinedResults.length > 0 ? combinedResults : searchResults;

    console.log(`Synthesizing response with ${resultsToUse?.length || 0} total results`);
    console.log(`YouTube results: ${youtubeResults?.length || 0}, Web results: ${searchResults?.length || 0}`);

    // Enhance the state with conversation context and combined results for better synthesis
    const enhancedState = {
      ...state,
      searchResults: resultsToUse, // Use combined results for synthesis
      conversationContext:
        history.length > 0
          ? history.slice(-3) // Keep as array for proper processing
          : [],
      originalQuery: query,
      searchQuery: contextualizedQuery,
    };

    const response = await runSimpleGroqTask(enhancedState, false);

    // Clean response
    let finalResponse = response;
    if (response.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      finalResponse = response.replace(regex, '').trim();
    }

    // Extract simplified references from metadata for citations (only URL and domain)
    const reference =
      metadata?.results?.map((result, index) => ({
        url: result.url || '#',
        domain: result.domain || extractDomain(result.url),
      })) || [];

    // Create citation metadata for message storage
    const citationMetadata = {
      totalCitations: reference.length,
      searchQuery: contextualizedQuery,
      originalQuery: query,
      searchTimestamp: metadata?.searchTimestamp || new Date().toISOString(),
      tavilyAnswer: metadata?.tavilyAnswer || null,
      references: reference,
    };

    console.log('Synthesized conversational answer');
    console.log('References extracted:', reference.length);
    console.log('Citation metadata created:', citationMetadata);

    //Remove references from the final response. Also remove everything after "References:"
    finalResponse = finalResponse.replace(/References:[\s\S]*$/i, '').trim();

    console.log('Synthesized response:', finalResponse);

    return {
      answer: finalResponse,
      reference,
      citationMetadata, // Add metadata for message storage
      responseType: 'search_synthesis',
    };
  } catch (error) {
    console.error('Error in conversationalSynthesisNode:', error);
    return {
      answer:
        'I found some information but encountered an error while synthesizing it. Please try asking your question differently.',
      reference: [],
      responseType: 'error',
    };
  }
};

/**
 * Router: Determines the next step based on context analysis
 */
export const routeResponse = (state) => {
  console.log('--- Router: routeResponse ---');
  const { isSearchNeeded, responseType } = state;

  if (isSearchNeeded) {
    return 'search';
  } else {
    return 'direct';
  }
};

/**
 * Helper: Creates a contextualized query from conversation history
 */
const createContextualizedQuery = async (history, currentQuery) => {
  try {
    // Get recent user messages for context
    const userMessages = history
      .filter((msg) => msg.role === 'user')
      .slice(-3) // Last 3 user messages
      .map((msg) => msg.content);

    // Add current query (with year correction applied)
    const correctedCurrentQuery = updateQueryWithCurrentYear(currentQuery);
    userMessages.push(correctedCurrentQuery);

    if (userMessages.length <= 1) {
      return correctedCurrentQuery;
    }

    // Generate a single, contextualized query
    const contextualizedQuery = await createBetterQueryFromMultipleQuestions(
      userMessages.join(' '), // Join the messages as the query parameter
      [], // No search results yet
      history // Pass conversation context
    );

    // Clean the response
    let cleanedQuery = contextualizedQuery;
    if (contextualizedQuery.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedQuery = contextualizedQuery.replace(regex, '').trim();
    }

    // Apply final year correction
    // const finalQuery = updateQueryWithCurrentYear(
    //   cleanedQuery || correctedCurrentQuery
    // );
    console.log('Final contextualized query:', cleanedQuery);

    return cleanedQuery;
  } catch (error) {
    console.error('Error creating contextualized query:', error);
    return updateQueryWithCurrentYear(currentQuery);
  }
};

/**
 * Helper: Checks if a query is similar to a previous search
 */
const isSimilarQuery = (newQuery, previousContext) => {
  if (!previousContext || !previousContext.query) return false;

  // Simple similarity check - can be enhanced with more sophisticated methods
  const similarity = calculateStringSimilarity(
    newQuery.toLowerCase(),
    previousContext.query.toLowerCase()
  );

  // Consider queries similar if >70% similar and searched within last 5 minutes
  const timeDiff = new Date() - new Date(previousContext.timestamp);
  const isRecent = timeDiff < 5 * 60 * 1000; // 5 minutes

  return similarity > 0.7 && isRecent;
};

/**
 * Helper: Calculates simple string similarity
 */
const calculateStringSimilarity = (str1, str2) => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const matches = longer
    .split('')
    .filter((char) => shorter.includes(char)).length;
  return matches / longer.length;
};

/**
 * Helper: Extracts detailed content from search result
 */
const extractDetailedContent = (result) => {
  try {
    // Priority order: raw_content > content > snippet > title
    const sources = [
      result.raw_content,
      result.rawContent,
      result.content,
      result.snippet,
      result.title,
    ];

    for (const source of sources) {
      if (source && typeof source === 'string' && source.trim().length > 0) {
        // Clean and truncate the content for optimal use
        let cleaned = source
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/[^\w\s.,!?;:()\-'"]/g, ' ') // Remove special chars but keep punctuation
          .trim();

        // If content is very long, get a meaningful excerpt
        if (cleaned.length > 1500) {
          const sentences = cleaned.split(/[.!?]+/);
          let excerpt = '';
          for (const sentence of sentences) {
            if ((excerpt + sentence).length > 1200) break;
            excerpt += sentence + '. ';
          }
          return excerpt.trim() || cleaned.substring(0, 1200) + '...';
        }

        return cleaned;
      }
    }

    return 'Content not available';
  } catch (error) {
    console.error('Error extracting detailed content:', error);
    return result.content || result.snippet || 'Content extraction failed';
  }
};

/**
 * Helper: Extracts domain from URL
 */
const extractDomain = (url) => {
  try {
    if (!url || typeof url !== 'string') return 'unknown';
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (error) {
    return 'invalid-url';
  }
};

/**
 * Helper: Checks if content is recent (within last 30 days)
 */
const isRecentContent = (publishedDate) => {
  if (!publishedDate) return null;

  try {
    const pubDate = new Date(publishedDate);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return pubDate > thirtyDaysAgo;
  } catch (error) {
    return null;
  }
};

/**
 * Helper: Updates queries with current year for time-sensitive searches
 */
const updateQueryWithCurrentYear = (query) => {
  const currentYear = new Date().getFullYear();
  const previousYears = [
    currentYear - 1,
    currentYear - 2,
    currentYear - 3,
    currentYear - 4,
    currentYear - 5,
  ];

  let updatedQuery = query;

  // Replace previous years with current year in common contexts
  previousYears.forEach((year) => {
    // Match year patterns that are likely outdated
    const patterns = [
      new RegExp(
        `\\b${year}\\b(?=\\s*(game|schedule|season|event|news|latest|upcoming))`,
        'gi'
      ),
      new RegExp(
        `\\b(schedule|game|season|event|news|latest|upcoming)\\s+${year}\\b`,
        'gi'
      ),
      new RegExp(
        `\\b${year}\\s+(schedule|game|season|event|news|latest|upcoming)\\b`,
        'gi'
      ),
    ];

    patterns.forEach((pattern) => {
      updatedQuery = updatedQuery.replace(pattern, (match) => {
        return match.replace(year.toString(), currentYear.toString());
      });
    });
  });

  return updatedQuery;
};
