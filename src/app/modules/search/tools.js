import { DynamicStructuredTool, StructuredTool } from '@langchain/core/tools';
import { GoogleCustomSearch } from '@langchain/community/tools/google_custom_search';
import { z } from 'zod';
import config from "../../../../config/index.js";

const rawGoogle = new GoogleCustomSearch({
  maxResults: 20, // Default max results
  apiKey: config.google_search_api_key,
  googleCSEId: config.google_engine_id,
});

// Structured wrapper so the LLM won’t pass [object Object]
export const googleSearch = new DynamicStructuredTool({
  name: "google_search",
  description:
    `
      Advanced web search tool with intelligent sports query enhancement. Use this tool when you need current, real-time information, news, facts, or data that requires web search. 
  
  WHEN TO USE:
  - Current events, news, or time-sensitive information
  - Recent data, prices, or statistics  
  - Specific facts that may have changed recently
  - Information about ongoing events or developments
  - Sports scores, schedules, or recent games (automatically enhanced with site restrictions)
  - Weather, stock prices, or real-time data
  
  SPORTS INTELLIGENCE:
  - Automatically detects sports-related queries
  - For sports queries, restricts search to authoritative sources: ESPN, NHL.com, www.viagogo.com, MLB.com, NFL.com, NBA.com, and official team sites
  - Adds current season context (e.g., "2025-2026 season" for NHL)
  - Includes "after current date" for schedule queries
  - Example: "Detroit Red Wings home game" becomes "Detroit Red Wings home game 2025-2026 season after 2025-10-12 (site:espn.com OR site:nhl.com OR site:detroitredwings.com)"
  
  SEARCH STRATEGIES:
  - Use specific, focused queries for better results
  - Include time context (e.g., "2025", "recent", "latest") for current information
  - Combine multiple concepts in one search when relevant
  - Use quotation marks for exact phrases when needed
  - Sports queries are automatically optimized with site restrictions and date context
  - Search top 20 results for best info
  
  The tool automatically updates queries with current date context for time-sensitive searches.
    `,
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
    num: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of search results to return, 1–50"),
  }),
  func: async ({ query, ...params }) => {
    console.log('Params are', params);

    // Helper function to detect sports queries
    const isSportsQuery = (searchQuery) => {
      const sportsKeywords = [
        // Team names
        'detroit red wings', 'detroit tigers', 'detroit lions', 'detroit pistons',
        'red wings', 'tigers', 'lions', 'pistons',
        // General sports terms
        'game', 'schedule', 'season', 'match', 'playoff', 'championship',
        'home game', 'away game', 'next game', 'upcoming game',
        'regular season', 'preseason', 'postseason',
        // Sports types
        'hockey', 'baseball', 'football', 'basketball', 'soccer',
        'nhl', 'mlb', 'nfl', 'nba', 'mls',
        // Sport-specific terms
        'roster', 'standings', 'stats', 'score', 'result'
      ];

      const lowerQuery = searchQuery.toLowerCase();
      return sportsKeywords.some(keyword => lowerQuery.includes(keyword));
    };

    // Helper function to enhance sports queries with site restrictions
    const enhanceSportsQuery = (originalQuery) => {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;
      const currentDay = currentDate.getDate();
      const dateString = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`;

      let enhancedQuery = originalQuery;

      // Add current season context
      if (!enhancedQuery.includes(currentYear.toString())) {
        if (enhancedQuery.toLowerCase().includes('red wings') || enhancedQuery.toLowerCase().includes('hockey') || enhancedQuery.toLowerCase().includes('nhl')) {
          enhancedQuery += ` ${currentYear}-${currentYear + 1} season`;
        } else {
          enhancedQuery += ` ${currentYear}`;
        }
      }

      // Add "after current date" context for schedule queries
      if (/\b(next|upcoming|schedule|game|match)\b/i.test(enhancedQuery)) {
        enhancedQuery += ` after ${dateString}`;
      }

      // Add site restrictions for sports queries
      const sportsSites = 'site:espn.com OR site:nhl.com OR www.viagogo.com OR site:mlb.com OR site:nfl.com OR site:nba.com OR site:detroitredwings.com OR site:detroittigers.com OR site:detroitlions.com OR site:detroitpistons.com';
      enhancedQuery += ` (${sportsSites})`;

      console.log(`🏒 Enhanced sports query: "${enhancedQuery}"`);
      return enhancedQuery;
    };

    // Check if this is a sports query and enhance it accordingly
    let finalQuery = query;
    if (isSportsQuery(query)) {
      console.log(`🎯 Sports query detected: "${query}"`);
      finalQuery = enhanceSportsQuery(query);
    }

    // pass extra params to CSE if you want recency/locale control
    if (Object.keys(params).length) (rawGoogle).params = params;
    console.log('The final query before invoke', finalQuery);

    const results = await rawGoogle.invoke(finalQuery);
    const parsedResults = JSON.parse(results);
    const actualResultCount = Array.isArray(parsedResults) ? parsedResults.length : (parsedResults.items ? parsedResults.items.length : 0);
    const requestedResults = params.num || 20;

    console.log(`Google Search Results: ${actualResultCount} results returned (requested: ${requestedResults})`);

    // Provide helpful information about result limitations
    if (actualResultCount < requestedResults) {
      console.log(`📊 Note: Google Custom Search API returned fewer results than requested. This is normal due to:`);
      console.log(`   • API limitations (free tier often limited to 10 results per query)`);
      console.log(`   • Search result availability for the specific query`);
      console.log(`   • Custom Search Engine configuration limits`);
    }

    if (isSportsQuery(query)) {
      console.log(`🏒 Sports query results: ${actualResultCount} from sports-specific sources`);
    }

    return results; // ToolMessages must be strings
  },
});

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