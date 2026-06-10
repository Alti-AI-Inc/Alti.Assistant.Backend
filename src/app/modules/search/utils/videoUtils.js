import { llm } from '../services/geminiService.js';
import config from '../../../../../config/index.js';

/**
 * Video Utility Functions
 * YouTube search, video query analysis, and video content detection
 */

/**
 * Detects if the user is specifically asking for video content using an LLM.
 * This function analyzes the user's query and the conversation context to determine
 * if the primary intent is to find or watch video content.
 *
 * @async
 * @param {string} query - The user's current query string.
 * @param {Array<Object>} [conversationContext=[]] - An optional array of previous messages in the conversation.
 *   Each object should typically have `role` ('user' or 'assistant') and `content` (string) properties,
 *   providing context to the LLM for better classification.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the query is classified as video-only,
 *   `false` otherwise or if an error occurs during the LLM interaction.
 */
export const isVideoOnlyQuery = async (query, conversationContext = []) => {
  try {
    // Build conversation context for better classification
    let conversationHistory = '';
    if (Array.isArray(conversationContext) && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-3);
      conversationHistory = `Previous conversation:\n${recentMessages
        .map(
          (msg) =>
            `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        )
        .join('\n')}\n\n`;
    }

    const systemPrompt = `You are an intelligent query classifier that determines if a user is specifically asking for video content.

CLASSIFY AS VIDEO-ONLY QUERY ONLY IF:
- User EXPLICITLY asks for videos: "show me a video", "find a video", "I want to watch"
- User EXPLICITLY asks for tutorials: "tutorial video", "video tutorial", "show me how to"
- User EXPLICITLY asks for demonstrations: "video demonstration", "watch a demo"
- User EXPLICITLY asks for visual content: "visual guide", "step-by-step video"
- User mentions YouTube specifically: "youtube video", "find on youtube"
- User wants to SEE something being done: "show me how", "watch how to"

DO NOT CLASSIFY AS VIDEO-ONLY IF:
- Simple factual questions: "Who is the president?", "What is the capital?"
- General knowledge queries: "Tell me about...", "What is...?"
- News or current events: "Latest news about...", "What happened...?"
- Mathematical calculations or definitions
- Questions that can be answered with text
- General search queries that don't specifically request video format
- Educational topics that don't explicitly ask for video content
- Historical questions, biographical information
- Scientific facts or explanations that don't specifically request visual format

CRITICAL RULES:
- Be VERY strict - only classify as video-only if the user CLEARLY and EXPLICITLY wants video content
- A topic being "educational" or "tutorial-like" does NOT automatically make it video-only
- The user must explicitly indicate they want to WATCH, SEE, or VIEW content
- Factual questions should NEVER be classified as video-only unless explicitly requesting video format

Respond with ONLY "VIDEO_ONLY" or "NOT_VIDEO_ONLY" - no explanations, no thinking tags, no extra text.`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `${conversationHistory}Current query: "${query}"

Determine if this is a video-only query:`,
      },
    ];

    const response = await llm.invoke(messages);
    let rawContent = response.content.trim();

    console.log(
      'LLM video-only classification for query:',
      query,
      '→',
      rawContent
    );

    // Handle thinking tags - extract the actual decision
    let cleanedContent = rawContent;
    if (rawContent.includes('<THINK>') || rawContent.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/gi;
      cleanedContent = rawContent.replace(regex, '').trim();
    }

    const finalDecision = cleanedContent.toUpperCase().trim();
    console.log('Cleaned video-only decision:', finalDecision);

    const isNotVideoOnly = finalDecision.includes('NOT_VIDEO_ONLY');
    console.log(`Video-only query result: ${isNotVideoOnly}`);

    return isNotVideoOnly ? false : true;
  } catch (error) {
    console.error('Error detecting video-only query with LLM:', error);
    return false; // Default to not video-only on error
  }
};

/**
 * Extracts the number of videos requested from a user's query using an LLM.
 * This function parses the query and conversation context to identify explicit
 * or implied numerical requests for video content.
 *
 * @async
 * @param {string} query - The user's current query string.
 * @param {Array<Object>} [conversationContext=[]] - An optional array of previous messages in the conversation.
 *   Each object should typically have `role` ('user' or 'assistant') and `content` (string) properties,
 *   providing context to the LLM for better analysis.
 * @returns {Promise<number>} A promise that resolves to the extracted number of videos (clamped between 1 and 20).
 *   Defaults to 1 if no number is found or if an error occurs.
 */
export const extractVideoCount = async (query, conversationContext = []) => {
  try {
    // Build conversation context for better analysis
    let conversationHistory = '';
    if (Array.isArray(conversationContext) && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-3);
      conversationHistory = `Previous conversation:\n${recentMessages
        .map(
          (msg) =>
            `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        )
        .join('\n')}\n\n`;
    }

    const systemPrompt = `You are an expert at extracting the number of videos requested from user queries.

ANALYZE THE QUERY TO DETERMINE HOW MANY VIDEOS THE USER WANTS:

EXPLICIT NUMBERS:
- "5 videos" → 5
- "show me 3 tutorials" → 3
- "find 10 clips" → 10
- "top 7 videos" → 7
- "first 2 demonstrations" → 2

WRITTEN NUMBERS:
- "three videos" → 3
- "five tutorials" → 5
- "ten clips" → 10

IMPLIED QUANTITIES:
- "a video" → 1
- "single video" → 1
- "one video" → 1
- "some videos" → 3
- "few videos" → 3
- "several videos" → 3
- "multiple videos" → 3
- "many videos" → 5
- "lots of videos" → 5
- "all videos" → 10

DEFAULT BEHAVIOR:
- If no specific number is mentioned, assume 1
- Maximum reasonable limit is 20 videos
- If user asks for an unreasonable amount (>20), cap at 20

IMPORTANT: 
- Respond with ONLY a single number (1-20)
- Do not include any explanations, text, or thinking tags
- Just return the number as a digit`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `${conversationHistory}Current query: "${query}"

Extract the number of videos requested:`,
      },
    ];

    const response = await llm.invoke(messages);
    let rawContent = response.content.trim();

    console.log(
      'LLM video count extraction for query:',
      query,
      '→',
      rawContent
    );

    // Handle thinking tags - extract the actual decision
    let cleanedContent = rawContent;
    if (rawContent.includes('<THINK>') || rawContent.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/gi;
      cleanedContent = rawContent.replace(regex, '').trim();
    }

    // Extract just the number from the response
    const numberMatch = cleanedContent.match(/\b(\d+)\b/);
    let count = 1;

    if (numberMatch) {
      count = parseInt(numberMatch[1], 10);
      // Ensure reasonable bounds
      if (count < 1) count = 1;
      if (count > 20) count = 20;
    }

    console.log(`Extracted video count: ${count}`);
    return count;
  } catch (error) {
    console.error('Error extracting video count with LLM:', error);
    return 1; // Default to 1 on error
  }
};

/**
 * Analyzes a user's query to determine if it's a video-only request and, if so,
 * extracts the requested video count. This function combines the logic of
 * `isVideoOnlyQuery` and `extractVideoCount`.
 *
 * @async
 * @param {string} query - The user's current query string.
 * @param {Array<Object>} [conversationContext=[]] - An optional array of previous messages in the conversation.
 *   Each object should typically have `role` ('user' or 'assistant') and `content` (string) properties,
 *   providing context to the LLM for better analysis.
 * @returns {Promise<{isVideoOnly: boolean, videoCount: number}>} A promise that resolves to an object
 *   containing `isVideoOnly` (boolean indicating if the query is video-only) and `videoCount` (number,
 *   representing the extracted count, or 1 if not a video-only query or on error).
 */
export const analyzeVideoQuery = async (query, conversationContext = []) => {
  try {
    console.log(`Analyzing video query with LLM: "${query}"`);

    // Use LLM to determine if it's a video-only query
    const isVideoOnly = await isVideoOnlyQuery(query, conversationContext);

    // If it's a video query, extract the count
    let videoCount = 1;
    if (isVideoOnly) {
      videoCount = await extractVideoCount(query, conversationContext);
    }

    console.log(
      `LLM Video query analysis - Query: "${query}", IsVideoOnly: ${isVideoOnly}, Count: ${videoCount}`
    );

    return { isVideoOnly, videoCount };
  } catch (error) {
    console.error('Error analyzing video query with LLM:', error);
    return { isVideoOnly: false, videoCount: 1 };
  }
};

/**
 * Determines if a YouTube search would be relevant for the given query,
 * leveraging an LLM for contextual understanding. This helps decide whether
 * to include YouTube results in a broader search or to prioritize video content.
 *
 * @async
 * @param {string} query - The user's current query string.
 * @param {Array<Object>} [conversationContext=[]] - An optional array of previous messages in the conversation.
 *   Each object should typically have `role` ('user' or 'assistant') and `content` (string) properties,
 *   providing context to the LLM for better classification.
 * @returns {Promise<boolean>} A promise that resolves to `true` if YouTube search is deemed relevant
 *   for the query, `false` otherwise or if an error occurs.
 */
export const shouldSearchYouTube = async (query, conversationContext = []) => {
  try {
    // Build conversation context for better classification
    let conversationHistory = '';
    if (Array.isArray(conversationContext) && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-3);
      conversationHistory = `Previous conversation:\n${recentMessages
        .map(
          (msg) =>
            `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        )
        .join('\n')}\n\n`;
    }

    const systemPrompt = `You are an intelligent query classifier that determines when YouTube video content would be valuable for answering a query.

YOUTUBE SEARCH IS RELEVANT FOR:
- How-to guides, tutorials, demonstrations
- Product reviews, comparisons, unboxings
- Entertainment content (music, movies, shows, games)
- Educational content (lectures, explanations, documentaries)
- News events, interviews, speeches
- Cooking recipes, DIY projects, crafts
- Sports highlights, game analysis
- Technology demos, software tutorials
- Scientific explanations with visual components
- Music-related queries (songs, artists, concerts)
- Visual learning topics (art, dance, fitness)

YOUTUBE SEARCH IS NOT RELEVANT FOR:
- Simple factual questions with direct answers
- Mathematical calculations
- Text-based information queries
- Historical dates or basic facts
- Definitions or explanations that don't benefit from video
- Personal advice or recommendations
- Current stock prices, weather, or real-time data
- Simple conversational queries

IMPORTANT: Consider the conversation context. If the user is following up on a topic that could benefit from video content, lean toward YouTube search.

Respond with ONLY "RELEVANT" or "NOT_RELEVANT" - no explanations, no thinking tags, no extra text.`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `${conversationHistory}Current query: "${query}"

Determine if YouTube search would be relevant:`,
      },
    ];

    const response = await llm.invoke(messages);
    let rawContent = response.content.trim();

    console.log(
      'YouTube relevance analysis for query:',
      query,
      '→',
      rawContent
    );

    // Handle thinking tags - extract the actual decision
    let cleanedContent = rawContent;
    if (rawContent.includes('<THINK>') || rawContent.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/gi;
      cleanedContent = rawContent.replace(regex, '').trim();
    }

    const finalDecision = cleanedContent.toUpperCase().trim();
    console.log('Cleaned YouTube relevance decision:', finalDecision);

    return !finalDecision.includes('NOT_RELEVANT');
  } catch (error) {
    console.error('Error checking YouTube relevance:', error);
    return false; // Default to no YouTube search on error
  }
};

/**
 * Creates an optimized YouTube search query from the original user query and
 * conversation context using an LLM. This helps improve the relevance and
 * quality of video search results on YouTube.
 *
 * @async
 * @param {string} query - The original user query string.
 * @param {Array<Object>} [conversationContext=[]] - An optional array of previous messages in the conversation.
 *   Each object should typically have `role` ('user' or 'assistant') and `content` (string) properties,
 *   providing context to the LLM for better query refinement.
 * @returns {Promise<string>} A promise that resolves to the optimized YouTube search query string.
 *   If an error occurs, the original query is returned as a fallback.
 */
export const createOptimizedYouTubeQuery = async (
  query,
  conversationContext = []
) => {
  try {
    // Build conversation history
    let conversationHistory = '';
    if (conversationContext && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-3);
      conversationHistory = `Recent conversation:\n${recentMessages
        .map(
          (msg) =>
            `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        )
        .join('\n')}\n\n`;
    }

    const systemPrompt = `You are an expert at creating optimized YouTube search queries that will find the most relevant and high-quality video content.

OPTIMIZATION GUIDELINES:
- Keep queries concise but descriptive (3-8 words optimal)
- Add specific keywords that improve video discoverability
- Use terms that content creators commonly use in titles
- Consider educational vs entertainment intent
- Remove unnecessary words that don't help search

YOUTUBE-SPECIFIC IMPROVEMENTS:
- Add "tutorial", "guide", "how to" for instructional content
- Add "review", "comparison" for product/service queries  
- Add "explained", "breakdown" for complex topics
- Add "best", "top" for recommendation queries
- Use popular YouTube terminology and keywords

EXAMPLES:
- "How do I cook pasta" → "how to cook pasta perfectly tutorial"
- "What happened in the news today" → "latest news today"
- "Best smartphones" → "best smartphones review comparison"
- "Learn Python programming" → "Python programming tutorial beginners"
- "Detroit Tigers game" → "Detroit Tigers highlights"

CONTEXT AWARENESS:
- Consider conversation history to understand user intent
- If user is following up on a topic, refine the query accordingly
- Maintain the core intent while optimizing for YouTube search

Output ONLY the optimized YouTube search query, nothing else.`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `${conversationHistory}Original query: "${query}"

Create an optimized YouTube search query:`,
      },
    ];

    const response = await llm.invoke(messages);
    let optimizedQuery = response.content.trim();

    // Clean any thinking tags
    if (optimizedQuery.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/gi;
      optimizedQuery = optimizedQuery.replace(regex, '').trim();
    }

    // Remove quotes if present
    optimizedQuery = optimizedQuery.replace(/^["']|["']$/g, '');

    console.log(`YouTube query optimization: "${query}" → "${optimizedQuery}"`);

    return optimizedQuery;
  } catch (error) {
    console.error('Error optimizing YouTube query:', error);
    // Fallback to original query
    return query;
  }
};

/**
 * Performs a YouTube video search using the YouTube Data API v3.
 * The user's query is first optimized using an LLM to enhance search relevance.
 *
 * @async
 * @param {string} query - The user's search query. This query will be optimized before being sent to YouTube.
 * @param {number} [maxResults=5] - The maximum number of video results to return. Defaults to 5.
 * @param {Array<Object>} [conversationContext=[]] - An optional array of previous messages in the conversation,
 *   used to provide context for query optimization. Each object should have `role` and `content` properties.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of YouTube video result objects.
 *   Each object typically includes:
 *   - `title` (string): The title of the video.
 *   - `description` (string): A brief description of the video.
 *   - `url` (string): The direct URL to the YouTube video.
 *   - `videoId` (string): The unique ID of the YouTube video.
 *   - `channelTitle` (string): The title of the YouTube channel that published the video.
 *   - `publishedAt` (string): The ISO 8601 formatted date and time the video was published.
 *   - `thumbnails` (Object): An object containing various thumbnail URLs (e.g., `default`, `medium`, `high`).
 *   - `relevanceScore` (number): A simple calculated score indicating the result's relevance (higher is better).
 *   - `source` (string): Always 'youtube'.
 *   - `citationIndex` (number): The 1-based index of the result in the returned list.
 *   Returns an empty array if the YouTube API key is not configured, an error occurs, or no results are found.
 */
export const searchYouTube = async (
  query,
  maxResults = 5,
  conversationContext = []
) => {
  try {
    const youtubeApiKey = config.youtube_api_key;

    if (!youtubeApiKey) {
      console.warn('YouTube API key not configured, skipping YouTube search');
      return [];
    }

    // Optimize the query for better YouTube results
    const optimizedQuery = await createOptimizedYouTubeQuery(
      query,
      conversationContext
    );

    const searchUrl = `https://www.googleapis.com/youtube/v3/search`;
    const params = new URLSearchParams({
      part: 'snippet',
      q: optimizedQuery, // Use optimized query
      type: 'video',
      maxResults: maxResults.toString(),
      order: 'relevance',
      key: youtubeApiKey,
      safeSearch: 'moderate',
      relevanceLanguage: 'en',
    });

    console.log(
      `Searching YouTube for: "${optimizedQuery}" (original: "${query}")`
    );

    const response = await fetch(`${searchUrl}?${params}`);

    if (!response.ok) {
      console.error(
        `YouTube API error: ${response.status} ${response.statusText}`
      );
      return [];
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.log('No YouTube results found');
      return [];
    }

    const youtubeResults = data.items.map((item, index) => {
      const snippet = item.snippet;
      const videoId = item.id.videoId;

      return {
        title: snippet.title,
        description: snippet.description,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        videoId,
        channelTitle: snippet.channelTitle,
        publishedAt: snippet.publishedAt,
        thumbnails: snippet.thumbnails,
        relevanceScore: (maxResults - index) / maxResults, // Simple relevance scoring
        source: 'youtube',
        citationIndex: index + 1,
      };
    });

    console.log(`Found ${youtubeResults.length} YouTube results`);
    return youtubeResults;
  } catch (error) {
    console.error('Error searching YouTube:', error);
    return [];
  }
};