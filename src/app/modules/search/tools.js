import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { LinkupClient } from 'linkup-sdk'; // Adjust to actual SDK import
import { DynamicStructuredTool, StructuredTool } from '@langchain/core/tools';
import { GoogleCustomSearch } from '@langchain/community/tools/google_custom_search';
import { tavily } from '@tavily/core';
import { z } from 'zod';
import config from "../../../../config/index.js";

/**
 * Tool Call Monitor - Tracks and logs all tool usage
 */
class ToolCallMonitor {
  constructor() {
    this.toolCalls = [];
    this.statistics = {
      totalCalls: 0,
      tavilySearchCalls: 0,
      youtubeCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalDuration: 0
    };
  }

  logToolCall(toolName, query, duration, success, error = null, results = null) {
    const callData = {
      timestamp: new Date().toISOString(),
      toolName,
      query,
      duration,
      success,
      error: error?.message || null,
      resultCount: results ? (Array.isArray(results) ? results.length : 1) : 0,
      sessionId: Date.now().toString(36) // Simple session tracking
    };

    this.toolCalls.push(callData);
    this.updateStatistics(toolName, duration, success);

    // Console logging with emojis for visibility
    const status = success ? '✅' : '❌';
    const durationColor = duration < 1000 ? '🟢' : duration < 3000 ? '🟡' : '🔴';

    console.log(`${status} TOOL CALL: ${toolName}`);
    console.log(`   📝 Query: "${query}"`);
    console.log(`   ${durationColor} Duration: ${duration}ms`);
    console.log(`   📊 Results: ${callData.resultCount}`);
    if (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log(`   🆔 Call ID: ${callData.sessionId}`);
    console.log('─'.repeat(50));

    return callData.sessionId;
  }

  updateStatistics(toolName, duration, success) {
    this.statistics.totalCalls++;
    this.statistics.totalDuration += duration;

    if (toolName === 'tavily_search') {
      this.statistics.tavilySearchCalls++;
    } else if (toolName === 'youtube_search') {
      this.statistics.youtubeCalls++;
    }

    if (success) {
      this.statistics.successfulCalls++;
    } else {
      this.statistics.failedCalls++;
    }
  }

  getStatistics() {
    const avgDuration = this.statistics.totalCalls > 0
      ? Math.round(this.statistics.totalDuration / this.statistics.totalCalls)
      : 0;

    return {
      ...this.statistics,
      averageDuration: avgDuration,
      successRate: this.statistics.totalCalls > 0
        ? Math.round((this.statistics.successfulCalls / this.statistics.totalCalls) * 100)
        : 0
    };
  }

  printStatistics() {
    const stats = this.getStatistics();
    console.log('\n📊 TOOL USAGE STATISTICS:');
    console.log('═'.repeat(40));
    console.log(`🔧 Total Tool Calls: ${stats.totalCalls}`);
    console.log(`🔍 Tavily Searches: ${stats.tavilySearchCalls}`);
    console.log(`🎥 YouTube Searches: ${stats.youtubeCalls}`);
    console.log(`✅ Successful: ${stats.successfulCalls}`);
    console.log(`❌ Failed: ${stats.failedCalls}`);
    console.log(`📈 Success Rate: ${stats.successRate}%`);
    console.log(`⏱️  Average Duration: ${stats.averageDuration}ms`);
    console.log(`⏱️  Total Duration: ${stats.totalDuration}ms`);
    console.log('═'.repeat(40));
  }

  getRecentCalls(limit = 10) {
    return this.toolCalls.slice(-limit);
  }
}

// Global tool monitor instance
export const toolMonitor = new ToolCallMonitor();

// Inline updateQueryWithCurrentYear to avoid circular imports
const updateQueryWithCurrentYear = (query) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const currentDateFormatted = `${now.toLocaleString('default', { month: 'long' })} ${currentDay}, ${currentYear}`;
  const todayFormatted = `today ${currentDateFormatted}`;

  const previousYears = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4, currentYear - 5];
  let updatedQuery = query;

  // Update outdated years
  previousYears.forEach(year => {
    const patterns = [
      new RegExp(`\\b${year}\\b(?=\\s*(game|schedule|season|event|news|latest|upcoming|next|when|match|today|now|current))`, 'gi'),
      new RegExp(`\\b(schedule|game|season|event|news|latest|upcoming|next|when|match|today|now|current)\\s+${year}\\b`, 'gi'),
    ];

    patterns.forEach(pattern => {
      updatedQuery = updatedQuery.replace(pattern, (match) => {
        return match.replace(year.toString(), currentYear.toString());
      });
    });
  });

  // Add current context for time-sensitive keywords
  const timeSensitiveKeywords = ['next game', 'upcoming game', 'when is', 'schedule', 'latest news'];
  const hasTimeSensitiveKeyword = timeSensitiveKeywords.some(keyword =>
    updatedQuery.toLowerCase().includes(keyword.toLowerCase())
  );

  if (hasTimeSensitiveKeyword && !/\b\d{4}\b/.test(updatedQuery)) {
    updatedQuery += ` ${currentYear}`;
  }

  return updatedQuery;
};

export class LinkupSearchTool extends StructuredTool {
  name = 'linkup_search';
  description = 'Search data using Linkup SDK';

  async call({ query, depth }) {
    try {
      const client = new LinkupClient({
        apiKey: '6c4aee2e-6b7e-4e2d-a55d-e61241db2c94',
      }); // Adjust if SDK requires different initialization

      const result = await client.search({
        query: query,
        depth: depth,
        outputType: 'searchResults',
      }); // Adjust if SDK method differs
      return JSON.stringify(result, null, 2);
    } catch (error) {
      console.error('LinkupSearchTool Error:', error);
      return 'Failed to get results from Linkup.';
    }
  }
}

const rawGoogle = new GoogleCustomSearch({
  maxResults: 5, // tweak
  apiKey: config.google_search_api_key,
  googleCSEId: config.google_engine_id,
});

// Structured wrapper so the LLM won’t pass [object Object]
export const googleSearch = new DynamicStructuredTool({
  name: "google_search",
  description:
    "Search the web for up-to-date info. Return top results with titles and URLs. Search on timezone of the user",
  schema: z.object({
    query: z.string().describe("Plain-text search query, e.g., 'next SpaceX launch schedule'"),
    dateRestrict: z
      .string()
      .optional()
      .describe("Google dateRestrict like 'd7' (7 days), 'w1' (1 week), etc."),
    tz: z.string().describe("IANA timezone, e.g., 'Asia/Dhaka'"),
    gl: z.string().optional().describe("Geolocation region code, e.g., 'us'"),
    lr: z.string().optional().describe("Language restrict, e.g., 'lang_en'"),
    safe: z.string().optional().describe("safe, off, or active"),
  }),
  func: async ({ query, ...params }) => {
    // pass extra params to CSE if you want recency/locale control
    if (Object.keys(params).length) (rawGoogle).params = params;
    const results = await rawGoogle.invoke(query);
    console.log('Google Search Results:', JSON.stringify(results, null, 2));

    return JSON.stringify(results); // ToolMessages must be strings
  },
});


// export class GoogleCustomSearchTool extends StructuredTool {
//   name = 'google_custom_search';
//   description = `Advanced web search tool using Tavily AI. Use this tool when you need current, real-time information, news, facts, or data that requires web search. 

//   WHEN TO USE:
//   - Current events, news, or time-sensitive information
//   - Recent data, prices, or statistics  
//   - Specific facts that may have changed recently
//   - Information about ongoing events or developments
//   - Sports scores, schedules, or recent games
//   - Weather, stock prices, or real-time data

//   SEARCH STRATEGIES:
//   - Use specific, focused queries for better results
//   - Include time context (e.g., "2025", "recent", "latest") for current information
//   - Combine multiple concepts in one search when relevant
//   - Use quotation marks for exact phrases when needed

//   The tool automatically updates queries with current date context for time-sensitive searches.`;

//   schema = z.object({
//     query: z.string().describe("The search query - be specific and include relevant keywords. The tool will automatically add current date context for time-sensitive queries."),
//     searchDepth: z.enum(['basic', 'advanced']).default('advanced').describe("Search depth: 'basic' for quick results, 'advanced' for comprehensive search with more sources"),
//     maxResults: z.number().min(1).max(10).default(5).describe("Maximum number of search results to return (1-10, default 5 for faster performance)"),
//     includeAnswer: z.boolean().default(true).describe("Whether to include Tavily's AI-generated answer based on search results")
//   });

//   constructor({ apiKey = null, searchEngineId = null } = {}) {
//     super();
//     this.apiKey = apiKey || config.google_search_api_key;
//     this.searchEngineId = searchEngineId || config.google_search_engine_id;
//     if (!this.apiKey || !this.searchEngineId) {
//       throw new Error('Google Custom Search API key and Search Engine ID are required');
//     }
//     const client = GoogleCustomSearch.
//   }
// }

export class TavilySearchTool extends StructuredTool {
  name = 'tavily_search';
  description = `Advanced web search tool using Tavily AI. Use this tool when you need current, real-time information, news, facts, or data that requires web search. 
  
  WHEN TO USE:
  - Current events, news, or time-sensitive information
  - Recent data, prices, or statistics  
  - Specific facts that may have changed recently
  - Information about ongoing events or developments
  - Sports scores, schedules, or recent games
  - Weather, stock prices, or real-time data
  
  SEARCH STRATEGIES:
  - Use specific, focused queries for better results
  - Include time context (e.g., "2025", "recent", "latest") for current information
  - Combine multiple concepts in one search when relevant
  - Use quotation marks for exact phrases when needed
  
  The tool automatically updates queries with current date context for time-sensitive searches.`;

  schema = z.object({
    query: z.string().describe("The search query - be specific and include relevant keywords. The tool will automatically add current date context for time-sensitive queries."),
    searchDepth: z.enum(['basic', 'advanced']).default('advanced').describe("Search depth: 'basic' for quick results, 'advanced' for comprehensive search with more sources"),
    maxResults: z.number().min(1).max(10).default(5).describe("Maximum number of search results to return (1-10, default 5 for faster performance)"),
    includeAnswer: z.boolean().default(true).describe("Whether to include Tavily's AI-generated answer based on search results")
  });

  constructor({ apiKey = null } = {}) {
    super();
    this.apiKey = apiKey || config.tavily_api_key;
    if (!this.apiKey) {
      throw new Error('Tavily API key is required');
    }
    this.client = tavily({ apiKey: this.apiKey });
  }

  async _call({ query, searchDepth = 'advanced', maxResults = 5, includeAnswer = true }) {
    const startTime = Date.now();
    let callId = null;

    try {
      console.log('\n� TAVILY SEARCH TOOL ACTIVATED');
      console.log('═'.repeat(50));
      console.log(`📝 Original Query: "${query}"`);
      console.log(`🔧 Search Depth: ${searchDepth}`);
      console.log(`📊 Max Results: ${maxResults}`);
      console.log(`💡 Include Answer: ${includeAnswer}`);

      // Apply date contextualization to the query
      const contextualizedQuery = updateQueryWithCurrentYear(query);

      if (contextualizedQuery !== query) {
        console.log(`📅 Query contextualized: "${query}" → "${contextualizedQuery}"`);
      }      // Perform the search with enhanced parameters
      const response = await this.client.search(contextualizedQuery, {
        searchDepth: searchDepth,
        maxResults: Math.min(maxResults, 20), // Ensure we don't exceed Tavily limits
        includeAnswer: includeAnswer ? 'advanced' : false,
        chunksPerSource: 5, // Get more detailed content per source
        includeRawContent: false, // Focus on processed content
        excludeDomains: [], // Can be configured to exclude specific domains
      });

      const duration = Date.now() - startTime;
      console.log(`⏱️  Search completed in ${duration}ms`);

      // Process and enhance the results
      const searchResults = response.results || [];
      const processedResults = searchResults.map((result, index) => {
        // Calculate recency score based on published date if available
        let recencyScore = 0;
        if (result.publishedDate) {
          const publishedDate = new Date(result.publishedDate);
          const now = new Date();
          const daysDiff = (now - publishedDate) / (1000 * 60 * 60 * 24);
          recencyScore = Math.max(0, 1 - (daysDiff / 365)); // Score decreases over a year
        }

        const domain = this.extractDomain(result.url || '');
        const publishedYear = result.publishedDate ? new Date(result.publishedDate).getFullYear() : new Date().getFullYear();

        return {
          title: result.title || 'No title',
          url: result.url || '',
          content: result.content || result.snippet || 'No content available',
          detailedContent: result.content || result.snippet || 'No detailed content available',
          score: result.score || (searchResults.length - index) / searchResults.length,
          recencyScore: recencyScore,
          isRecent: recencyScore > 0.5, // Consider recent if published within ~6 months
          publishedDate: result.publishedDate || null,
          publishedYear: publishedYear,
          domain: domain,
          sourceName: this.formatSourceName(domain),
          citationFormat: `${this.formatSourceName(domain)} (${publishedYear})`,
          citationIndex: index + 1
        };
      });

      // Sort results by relevance and recency
      processedResults.sort((a, b) => {
        const scoreA = (a.score * 0.7) + (a.recencyScore * 0.3);
        const scoreB = (b.score * 0.7) + (b.recencyScore * 0.3);
        return scoreB - scoreA;
      });

      const searchResponse = {
        success: true,
        query: query,
        contextualizedQuery: contextualizedQuery,
        searchDepth: searchDepth,
        tavilyAnswer: response.answer || null,
        results: processedResults,
        totalResults: processedResults.length,
        searchTime: duration,
        timestamp: new Date().toISOString(),
        source: 'tavily'
      };

      console.log(`📊 Search Summary: ${processedResults.length} results, ${duration}ms, Answer: ${response.answer ? 'Yes' : 'No'}`);

      return JSON.stringify(searchResponse, null, 2);

    } catch (error) {
      console.error('❌ TavilySearchTool Error:', error);

      return JSON.stringify({
        success: false,
        error: 'Failed to perform Tavily search',
        errorDetails: error.message,
        query: query,
        timestamp: new Date().toISOString()
      }, null, 2);
    }
  }

  extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'Unknown domain';
    }
  }

  formatSourceName(domain) {
    // Convert domain to a more readable source name
    const sourceMap = {
      'espn.com': 'ESPN',
      'cnn.com': 'CNN',
      'bbc.com': 'BBC',
      'reuters.com': 'Reuters',
      'nytimes.com': 'New York Times',
      'washingtonpost.com': 'Washington Post',
      'techcrunch.com': 'TechCrunch',
      'mlb.com': 'MLB.com',
      'nfl.com': 'NFL.com',
      'nba.com': 'NBA.com',
      'wikipedia.org': 'Wikipedia',
      'github.com': 'GitHub',
      'stackoverflow.com': 'Stack Overflow'
    };

    return sourceMap[domain] || domain.split('.')[0].toUpperCase();
  }
}

/**
 * Enhanced YouTube Search Tool for video content
 */
export class YouTubeSearchTool extends StructuredTool {
  name = 'youtube_search';
  description = `Search YouTube for video content. Use this tool when users specifically request videos, tutorials, demonstrations, or visual content.
  
  WHEN TO USE:
  - User explicitly asks for videos, tutorials, or demonstrations
  - Educational content that benefits from visual explanation
  - How-to guides, step-by-step instructions
  - Product reviews, unboxings, or comparisons
  - Entertainment content (music, movies, shows)
  - Visual learning content (art, cooking, fitness, etc.)
  
  DO NOT USE for simple factual questions that can be answered with text.`;

  schema = z.object({
    query: z.string().describe("YouTube search query - be specific about what type of video content is needed"),
    maxResults: z.number().min(1).max(20).default(5).describe("Maximum number of video results to return (1-20)"),
    order: z.enum(['relevance', 'date', 'viewCount', 'rating']).default('relevance').describe("Sort order for results"),
    duration: z.enum(['any', 'short', 'medium', 'long']).default('any').describe("Video duration filter")
  });

  constructor() {
    super();
    this.apiKey = config.youtube_api_key;
    if (!this.apiKey) {
      console.warn('YouTube API key not configured');
    }
  }

  async _call({ query, maxResults = 5, order = 'relevance', duration = 'any' }) {
    try {
      if (!this.apiKey) {
        return JSON.stringify({
          success: false,
          error: 'YouTube API key not configured',
          query: query
        });
      }

      console.log(`🎥 YouTube Search Tool called with query: "${query}"`);

      const searchURL = 'https://www.googleapis.com/youtube/v3/search';
      const params = new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: maxResults.toString(),
        order: order,
        key: this.apiKey,
        safeSearch: 'moderate',
        relevanceLanguage: 'en'
      });

      if (duration !== 'any') {
        params.append('videoDuration', duration);
      }

      const response = await fetch(`${searchURL}?${params}`);

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      const videoResults = (data.items || []).map((item, index) => {
        const snippet = item.snippet;
        return {
          title: snippet.title,
          description: snippet.description,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          videoId: item.id.videoId,
          channelTitle: snippet.channelTitle,
          publishedAt: snippet.publishedAt,
          thumbnails: snippet.thumbnails,
          source: 'youtube',
          citationIndex: index + 1
        };
      });

      return JSON.stringify({
        success: true,
        query: query,
        results: videoResults,
        totalResults: videoResults.length,
        source: 'youtube'
      }, null, 2);

    } catch (error) {
      console.error('❌ YouTubeSearchTool Error:', error);

      return JSON.stringify({
        success: false,
        error: 'Failed to search YouTube',
        errorDetails: error.message,
        query: query
      });
    }
  }
}
