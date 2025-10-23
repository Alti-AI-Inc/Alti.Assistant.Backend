import { TavilySearch } from '@langchain/tavily';
import config from '../../../../../config/index.js';
import {
  checkIfSearchNeededForTheQueryUsingAi,
  createBetterQueryFromMultipleQuestions,
  giveAnswerWithoutSearch,
  runSimpleSearchTask,
  analyzeDirectAnswerQuality,
  // manageConversationContext,
  // shouldTrimContext,
  shouldSearchYouTube,
  searchYouTube,
  isVideoOnlyQuery,
  analyzeVideoQuery,
  classifyQueryFast,
  classifyQueryOptimized,
  performParallelSearch,
  extractVideoCountFast,
  createContextualizedQueryFast,
  updateQueryWithCurrentYear,
  runIntelligentSearch,
} from '../llm.js';
import { tavily } from '@tavily/core';

/**
 * OPTIMIZED Node: Fast analysis using rule-based classification first
 */
export const analyzeContextNodeOptimized = async (state) => {
  console.log('--- Node: analyzeContextNodeOptimized ---');
  const { query, history } = state;

  try {
    // Build conversation context (lighter for simple queries)
    const conversationContext = history.length > 0 ? history.slice(-2) : [];

    console.log(`Fast analyzing query: "${query}" with ${conversationContext.length} context messages`);

    // OPTIMIZATION 1: Use fast rule-based classification first
    const fastClassification = classifyQueryFast(query);
    console.log(`Fast classification result:`, fastClassification);

    // Handle different query types with optimized paths
    switch (fastClassification.recommendedAction) {
      case 'direct_answer': {
        // Simple factual queries - skip all searches
        console.log(`Simple query detected: "${query}" - using direct answer path`);
        return {
          ...state,
          needsSearch: false,
          isSearchNeeded: false,
          isVideoOnlyQuery: false,
          contextualizedQuery: query,
          responseType: 'direct',
          fastTrack: true,
          classificationUsed: 'rule_based'
        };
      }

      case 'video_search': {
        // Video queries - skip LLM analysis for video detection
        console.log(`Video query detected: "${query}" - using video path`);
        // Quick video count extraction without LLM for common patterns
        const videoCount = extractVideoCountFast(query);
        return {
          ...state,
          needsSearch: false,
          isSearchNeeded: false,
          isVideoOnlyQuery: true,
          requestedVideoCount: videoCount,
          contextualizedQuery: query,
          responseType: 'video_only',
          fastTrack: true,
          classificationUsed: 'rule_based'
        };
      }

      case 'search_required': {
        // Time-sensitive queries - definitely need search
        console.log(`Time-sensitive query detected: "${query}" - using search path`);
        const contextualizedQuery = history.length > 0 ?
          await createContextualizedQueryFast(history, query) : query;

        return {
          ...state,
          needsSearch: true,
          isSearchNeeded: true,
          isVideoOnlyQuery: false,
          contextualizedQuery,
          responseType: 'search',
          fastTrack: true,
          classificationUsed: 'rule_based'
        };
      }

      case 'llm_classify':
      default: {
        // Low confidence - use LLM classification
        console.log(`Using LLM classification for: "${query}"`);
        break;
      }
    }

    // FALLBACK: Use LLM classification for complex or uncertain queries
    const searchDecision = await classifyQueryOptimized(query, conversationContext);

    // Handle video queries with LLM if needed
    if (searchDecision === 'VIDEO' || fastClassification.queryType === 'video') {
      const videoAnalysis = await analyzeVideoQuery(query, conversationContext);
      if (videoAnalysis.isVideoOnly) {
        console.log(`LLM video-only query detected: "${query}" with count: ${videoAnalysis.videoCount}`);
        return {
          ...state,
          needsSearch: false,
          isSearchNeeded: false,
          isVideoOnlyQuery: true,
          requestedVideoCount: videoAnalysis.videoCount,
          contextualizedQuery: query,
          responseType: 'video_only',
          classificationUsed: 'llm'
        };
      }
    }

    const isSearchNeeded = searchDecision === 'SEARCH';
    console.log(`LLM decision: ${searchDecision} → Search needed: ${isSearchNeeded}`);

    // Generate contextualized query only if needed
    let contextualizedQuery = query;
    if (isSearchNeeded && history.length > 0) {
      contextualizedQuery = await createContextualizedQueryFast(history, query);
    }

    return {
      ...state,
      needsSearch: isSearchNeeded,
      isSearchNeeded,
      isVideoOnlyQuery: false,
      contextualizedQuery,
      responseType: isSearchNeeded ? 'search' : 'direct',
      classificationUsed: 'llm'
    };

  } catch (error) {
    console.error('Error in analyzeContextNodeOptimized:', error);
    return {
      ...state,
      needsSearch: false,
      isSearchNeeded: false,
      isVideoOnlyQuery: false,
      contextualizedQuery: query,
      responseType: 'direct',
      classificationUsed: 'error_fallback'
    };
  }
};

/**
 * Legacy Node: Keep original for backward compatibility
 */
export const analyzeContextNode = async (state) => {
  console.log('--- Node: analyzeContextNode (Legacy) ---');
  // For now, redirect to optimized version
  return await analyzeContextNodeOptimized(state);
};

/**
 * Node: Manages conversation context by trimming and summarizing when needed
 */
// export const manageContextNode = async (state) => {
//   console.log('--- Node: manageContextNode ---');
//   const { history, conversationSummary } = state;

//   try {
//     // Manage the conversation context
//     const contextResult = await manageConversationContext(history, conversationSummary);

//     console.log(`Context management result:`, {
//       managed: contextResult.contextManaged,
//       trimmedCount: contextResult.trimmedMessageCount,
//       keptCount: contextResult.keptMessageCount,
//       hasSummary: !!contextResult.conversationSummary
//     });

//     return {
//       ...state, // Preserve existing state
//       history: contextResult.trimmedHistory,
//       conversationSummary: contextResult.conversationSummary,
//       contextManaged: contextResult.contextManaged,
//     };
//   } catch (error) {
//     console.error('Error in manageContextNode:', error);

//     // On error, preserve original state
//     return {
//       ...state,
//       contextManaged: false,
//     };
//   }
// };

/**
 * OPTIMIZED Node: Performs parallel intelligent search
 */
export const intelligentSearchNodeOptimized = async (state) => {
  console.log('--- Node: intelligentSearchNodeOptimized ---');
  const { contextualizedQuery, query, depth, previousSearchContext, history, fastTrack } = state;

  // Use contextualized query if available, otherwise fall back to original query
  let searchQuery = contextualizedQuery || query;

  // Apply year correction to ensure current information
  searchQuery = updateQueryWithCurrentYear(searchQuery);

  console.log(`Optimized search for: "${searchQuery}"`);

  try {
    // OPTIMIZATION 3: Determine search strategy based on query type and fast track status
    let searchOptions = {
      includeWeb: true,
      includeYouTube: false,
      maxWebResults: fastTrack ? 3 : 5, // Fewer results for fast track
      maxVideoResults: 2,
      conversationContext: history.slice(-2) // Lighter context
    };

    // Quick YouTube relevance check without LLM for obvious cases
    const lowerQuery = searchQuery.toLowerCase();
    const needsYouTube = lowerQuery.includes('video') ||
      lowerQuery.includes('tutorial') ||
      lowerQuery.includes('how to') ||
      lowerQuery.includes('demo') ||
      lowerQuery.includes('watch');

    if (needsYouTube) {
      searchOptions.includeYouTube = true;
      console.log('YouTube search included based on query content');
    } else if (!fastTrack) {
      // For non-fast track queries, use LLM to determine YouTube relevance
      const youtubeRelevant = await shouldSearchYouTube(searchQuery, history.slice(-2));
      searchOptions.includeYouTube = youtubeRelevant;
      console.log(`YouTube relevance (LLM): ${youtubeRelevant}`);
    }

    // OPTIMIZATION 2: Perform parallel searches
    console.log('Starting parallel search operations...');
    const startTime = Date.now();

    const searchResults = await performParallelSearch(searchQuery, searchOptions);

    const searchTime = Date.now() - startTime;
    console.log(`Parallel search completed in ${searchTime}ms`);
    console.log('Raw search results:', searchResults.web);
    // Process and combine results
    const combinedResults = [];

    // Add web results
    if (searchResults.web.results && searchResults.web.results.length > 0) {
      combinedResults.push(...searchResults.web.results.map(result => {
        console.log("Web result:", result);

        return {
          ...result,
          source: 'web'
        }
      }));
    }

    // Add YouTube results
    if (searchResults.youtube && searchResults.youtube.length > 0) {
      combinedResults.push(...searchResults.youtube.map(result => ({
        ...result,
        source: 'youtube'
      })));
    }

    console.log(`Found ${combinedResults.length} total results (${searchResults.web?.length || 0} web, ${searchResults.youtube?.length || 0} YouTube)`);

    // Log any errors but don't fail the request
    if (searchResults.errors && searchResults.errors.length > 0) {
      console.warn('Search errors:', searchResults.errors);
    }

    return {
      ...state,
      searchResults: combinedResults,
      searchQuery,
      hasYouTubeResults: (searchResults.youtube?.length || 0) > 0,
      searchPerformed: true,
      searchTime,
      parallelSearch: true
    };

  } catch (error) {
    console.error('Error in intelligentSearchNodeOptimized:', error);

    // Fallback to basic search if parallel search fails
    console.log('Falling back to basic search...');
    return await intelligentSearchNodeLegacy(state);
  }
};

/**
 * Legacy Node: Original search implementation as fallback
 */
export const intelligentSearchNodeLegacy = async (state) => {
  console.log('--- Node: intelligentSearchNodeLegacy ---');
  const { contextualizedQuery, query, depth, previousSearchContext } = state;

  // Use contextualized query if available, otherwise fall back to original query
  let searchQuery = contextualizedQuery || query;

  // Apply year correction to ensure current information
  searchQuery = updateQueryWithCurrentYear(searchQuery);

  console.log(`Original query: ${contextualizedQuery || query}`);
  console.log(`Year-corrected query: ${searchQuery}`);

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
    const response = await researchTool.search(searchQuery, {
      searchDepth: 'advanced',
      maxResults: 11,
      includeAnswer: 'advanced',
      chunksPerSource: 5,
    });

    const searchResults = response.results || [];
    console.log('Raw Tavily response:', response.answer);

    // Format results with detailed metadata
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
      ...state,
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
      searchPerformed: true,
      parallelSearch: false
    };
  } catch (error) {
    console.error('Error in intelligentSearchNodeLegacy:', error);
    return {
      ...state,
      searchResults: [],
      metadata: { error: 'Failed to perform search', query: searchQuery },
      contextualizedQuery: searchQuery,
      searchPerformed: false
    };
  }
};

/**
 * Main Node: Uses optimized version by default
 */
export const intelligentSearchNode = async (state) => {
  console.log('--- Node: intelligentSearchNode (Optimized) ---');
  return await intelligentSearchNodeOptimized(state);
};

/**
 * NEXT-GEN Node: Tool-based intelligent search using LLM with search tools
 * This represents the most advanced search approach where the LLM decides when and how to use tools
 */
export const toolBasedSearchNode = async (state) => {
  console.log('--- Node: toolBasedSearchNode (Next-Gen Tool-Enabled) ---');
  const { query, history } = state;

  try {
    const startTime = Date.now();

    // Use the new intelligent tool-based search
    const result = await runIntelligentSearch(state);

    const duration = Date.now() - startTime;
    console.log(`🚀 Tool-based search completed in ${duration}ms`);
    console.log('Tool-based search result:', result);
    // Handle structured response format
    if (typeof result === 'object' && result.answer) {
      return {
        ...state,
        answer: result.answer,
        reference: result.reference || [],
        searchCompleted: true,
        searchMethod: result.searchMethod || 'tool_based',
        searchDuration: duration,
        timestamp: result.timestamp || new Date().toISOString()
      };
    } else {
      // Fallback for legacy string response
      return {
        ...state,
        answer: result,
        reference: [],
        searchCompleted: true,
        searchMethod: 'tool_based',
        searchDuration: duration,
        timestamp: new Date().toISOString()
      };
    }

  } catch (error) {
    console.error('❌ Error in toolBasedSearchNode:', error);

    // Fallback to optimized search
    console.log('🔄 Falling back to optimized search method');
    return await intelligentSearchNodeOptimized(state);
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

    // Perform YouTube search with conversation context
    const youtubeResults = await searchYouTube(searchQuery, 5, fullContextHistory);

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
      ...state,
      directAnswer: cleanedResponse, // Store the direct answer for analysis
      answer: cleanedResponse,
      references: [], // No references for direct answers
      responseType: 'direct',
      searchMethod: 'direct',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in directAnswerNode:', error);
    return {
      ...state,
      directAnswer: 'I apologize, but I encountered an error while processing your question. Could you please rephrase it?',
      answer: 'I apologize, but I encountered an error while processing your question. Could you please rephrase it?',
      references: [],
      responseType: 'error',
      searchMethod: 'direct',
      timestamp: new Date().toISOString()
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

    // Build context for YouTube search
    let fullContextHistory = [];

    if (conversationSummary) {
      fullContextHistory.push({
        role: 'system',
        content: `Previous conversation summary: ${conversationSummary}`
      });
    }

    fullContextHistory = fullContextHistory.concat(history || []);

    // Perform YouTube search with conversation context
    const youtubeResults = await searchYouTube(searchQuery, 3, fullContextHistory); // Fewer results for direct answers

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
        combinedAnswer += `\n🎥 **${video.title}**\n`;
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
  const { query, contextualizedQuery, history, conversationSummary, requestedVideoCount } = state;

  try {
    // Use the contextualized query if available, otherwise fall back to original query
    const searchQuery = contextualizedQuery || query;

    // Use the requested video count, default to 1 if not specified
    const videoCount = requestedVideoCount || 1;

    console.log(`Performing video-only YouTube search for: "${searchQuery}" with count: ${videoCount}`);

    // Build context for YouTube search
    let fullContextHistory = [];

    if (conversationSummary) {
      fullContextHistory.push({
        role: 'system',
        content: `Previous conversation summary: ${conversationSummary}`
      });
    }

    fullContextHistory = fullContextHistory.concat(history || []);

    // Perform YouTube search with conversation context and the requested number of videos
    const youtubeResults = await searchYouTube(searchQuery, videoCount, fullContextHistory);

    console.log(`Found ${youtubeResults.length} YouTube results for video-only query (requested: ${videoCount})`);

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
    requestedVideoCount,
  } = state;

  try {
    const requestedCount = requestedVideoCount || 1;
    console.log(`Synthesizing video-only response with ${youtubeResults?.length || 0} YouTube results (requested: ${requestedCount})`);

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

    // Handle single vs multiple video responses
    if (requestedCount === 1) {
      // Single video response (existing logic)
      const mostRelevantVideo = youtubeResults[0];

      const videoResponse = `Here's the most relevant video I found for your request:

🎥 **${mostRelevantVideo.title}**
📺 Channel: ${mostRelevantVideo.channelTitle}
🔗 **Video Link:** ${mostRelevantVideo.url}

Click the link above to watch the video on YouTube!`;

      const references = [{
        title: `🎥 ${mostRelevantVideo.title}`,
        url: mostRelevantVideo.url,
        source: 'youtube',
        index: 1
      }];

      console.log(`Returning most relevant video: ${mostRelevantVideo.title}`);

      return {
        answer: videoResponse,
        reference: references,
        responseType: 'video_only_synthesis',
      };
    } else {
      // Multiple videos response
      const videosToShow = youtubeResults.slice(0, requestedCount);

      let videoResponse = `Here are the ${videosToShow.length} most relevant videos I found for your request:\n\n`;

      videosToShow.forEach((video, index) => {
        videoResponse += `**${index + 1}. ${video.title}** 🎥\n`;
        videoResponse += `📺 Channel: ${video.channelTitle}\n`;
        videoResponse += `🔗 Link: ${video.url}\n`;

        if (video.description && video.description.length > 0) {
          const shortDesc = video.description.length > 100
            ? video.description.substring(0, 100) + '...'
            : video.description;
          videoResponse += `📝 Description: ${shortDesc}\n`;
        }

        videoResponse += '\n';
      });

      videoResponse += `Click any link above to watch the videos on YouTube!`;

      // Create references for all videos
      const references = videosToShow.map((video, index) => ({
        title: `🎥 ${video.title}`,
        url: video.url,
        source: 'youtube',
        index: index + 1
      }));

      console.log(`Returning ${videosToShow.length} videos as requested`);

      return {
        answer: videoResponse,
        reference: references,
        responseType: 'video_only_synthesis',
      };
    }

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

    const response = await runSimpleSearchTask(enhancedState, false);

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

// Removed duplicate function - now imported from llm.js
