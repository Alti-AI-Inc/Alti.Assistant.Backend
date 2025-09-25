import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { TavilySearch } from '@langchain/tavily';
import config from "../../../../config/index.js";
import { tavily } from "@tavily/core";
import { TavilySearchTool, YouTubeSearchTool } from './tools.js';

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash-preview-05-20",
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
  // other params...
});

// Create tool-enabled LLM with search capabilities
const createToolEnabledLLM = () => {
  const searchTools = [
    new TavilySearchTool(),
    new YouTubeSearchTool()
  ];

  return llm.bindTools(searchTools);
};

// Tool-enabled LLM instance
const toolEnabledLLM = createToolEnabledLLM();

/**
 * Fast rule-based query classification to avoid unnecessary LLM calls
 * Returns: { isSimple: boolean, queryType: string, confidence: number }
 */
export const classifyQueryFast = (query) => {
  const lowerQuery = query.toLowerCase().trim();

  // Simple factual queries - high confidence
  const simpleFactPatterns = [
    /^what is (the |a )?[a-zA-Z0-9\s]+\?*$/,
    /^who is [a-zA-Z0-9\s]+\?*$/,
    /^when (did|was|is) [a-zA-Z0-9\s]+\?*$/,
    /^where is [a-zA-Z0-9\s]+\?*$/,
    /^how many [a-zA-Z0-9\s]+\?*$/,
    /^define [a-zA-Z0-9\s]+$/,
    /^meaning of [a-zA-Z0-9\s]+$/
  ];

  // Time-sensitive queries - need search
  const timeSensitivePatterns = [
    /\b(today|now|current|latest|recent|2024|2025)\b/,
    /\b(next|upcoming|when is the next)\b/,
    /\b(schedule|game|match|event)\b.*\b(today|tomorrow|this week|next)\b/,
    /\b(stock price|weather|news)\b/
  ];

  // Video-related queries
  const videoPatterns = [
    /\b(video|tutorial|how to|guide|demo|watch)\b/,
    /\b(youtube|show me|explain|walkthrough)\b/,
    /\b(\d+\s*(video|tutorial|clip|demo)s?)\b/
  ];

  // Complex queries that need full workflow
  const complexPatterns = [
    /\b(compare|vs|versus|difference between)\b/,
    /\b(analyze|research|detailed|comprehensive)\b/,
    /\b(pros and cons|advantages|disadvantages)\b/,
    /\w+.*\w+.*\w+.*\w+.*\w+/ // More than 5 meaningful words
  ];

  // Check for simple factual queries
  for (const pattern of simpleFactPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        isSimple: true,
        queryType: 'factual',
        confidence: 0.9,
        recommendedAction: 'direct_answer'
      };
    }
  }

  // Check for time-sensitive queries
  for (const pattern of timeSensitivePatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        isSimple: false,
        queryType: 'time_sensitive',
        confidence: 0.95,
        recommendedAction: 'search_required'
      };
    }
  }

  // Check for video queries
  for (const pattern of videoPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        isSimple: false,
        queryType: 'video',
        confidence: 0.85,
        recommendedAction: 'video_search'
      };
    }
  }

  // Check for complex queries
  for (const pattern of complexPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        isSimple: false,
        queryType: 'complex',
        confidence: 0.8,
        recommendedAction: 'full_search'
      };
    }
  }

  // Default classification based on query length and complexity
  const wordCount = lowerQuery.split(/\s+/).length;
  const hasQuestionWords = /\b(what|who|when|where|why|how)\b/.test(lowerQuery);

  if (wordCount <= 4 && hasQuestionWords) {
    return {
      isSimple: true,
      queryType: 'simple',
      confidence: 0.7,
      recommendedAction: 'direct_answer'
    };
  }

  return {
    isSimple: false,
    queryType: 'unknown',
    confidence: 0.6,
    recommendedAction: 'llm_classify'
  };
};

/**
 * Optimized classification that uses rule-based first, then LLM if needed
 */
export const classifyQueryOptimized = async (query, conversationContext = []) => {
  // First try fast rule-based classification
  const fastClassification = classifyQueryFast(query);

  console.log(`Fast classification for "${query}":`, fastClassification);

  // If high confidence, use fast classification
  if (fastClassification.confidence >= 0.8) {
    switch (fastClassification.recommendedAction) {
      case 'direct_answer':
        return 'ANSWER';
      case 'search_required':
      case 'full_search':
        return 'SEARCH';
      case 'video_search':
        return 'VIDEO';
      default:
        return 'ANSWER';
    }
  }

  // If low confidence or unknown type, fall back to LLM classification
  console.log(`Low confidence (${fastClassification.confidence}), using LLM classification`);
  return await checkIfSearchNeededForTheQueryUsingAi(query, conversationContext);
};

/**
 * Parallel search operations for better performance
 */
export const performParallelSearch = async (query, options = {}) => {
  const {
    includeWeb = true,
    includeYouTube = false,
    maxWebResults = 5,
    maxVideoResults = 3,
    conversationContext = []
  } = options;

  const searchPromises = [];

  if (includeWeb) {
    // Web search promise
    const webSearchPromise = (async () => {
      try {
        const researchTool = tavily({
          apiKey: config.tavily_api_key,
        });
        console.log("Performing web search for query:", updateQueryWithCurrentYear(query));

        const response = await researchTool.search(updateQueryWithCurrentYear(query), {
          searchDepth: 'advanced',
          maxResults: 11,
          includeAnswer: 'advanced',
          chunksPerSource: 5,
        });
        // console.log("Web search response:", response);

        return { type: 'web', result: response, success: true };
      } catch (error) {
        console.error('Web search error:', error);
        return { type: 'web', results: [], success: false, error };
      }
    })();
    searchPromises.push(webSearchPromise);
  }

  if (includeYouTube) {
    // YouTube search promise
    const youtubeSearchPromise = (async () => {
      try {
        const results = await searchYouTube(query, maxVideoResults, conversationContext);
        return { type: 'youtube', results, success: true };
      } catch (error) {
        console.error('YouTube search error:', error);
        return { type: 'youtube', results: [], success: false, error };
      }
    })();
    searchPromises.push(youtubeSearchPromise);
  }

  // Execute all searches in parallel
  const searchResults = await Promise.all(searchPromises);

  // Combine and return results
  const combinedResults = {
    web: [],
    youtube: [],
    errors: []
  };

  searchResults.forEach(result => {
    if (result.success) {
      combinedResults[result.type] = result.answer || result.results || result.result || [];
    } else {
      combinedResults.errors.push({ type: result.type, error: result.error });
    }
  });
  console.log("Parallel search results:", combinedResults);
  return combinedResults;
};

/**
 * Fast video count extraction without LLM for common patterns
 */
export const extractVideoCountFast = (query) => {
  const lowerQuery = query.toLowerCase();

  // Look for explicit numbers
  const numberPatterns = [
    /(\d+)\s*(video|tutorial|clip|demo)s?/,
    /(one|two|three|four|five|six|seven|eight|nine|ten)\s*(video|tutorial|clip|demo)s?/,
    /show me (\d+)/,
    /(first|top) (\d+)/
  ];

  for (const pattern of numberPatterns) {
    const match = lowerQuery.match(pattern);
    if (match) {
      const numStr = match[1];
      if (/^\d+$/.test(numStr)) {
        const count = parseInt(numStr, 10);
        return Math.min(Math.max(count, 1), 10); // Limit between 1-10
      }

      // Handle written numbers
      const writtenNums = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
      };
      return writtenNums[numStr] || 1;
    }
  }

  // Default based on query type
  if (lowerQuery.includes('video') || lowerQuery.includes('tutorial')) {
    return lowerQuery.includes('some') || lowerQuery.includes('few') ? 3 : 1;
  }

  return 1;
};

/**
 * Fast contextualized query creation without heavy LLM processing
 */
export const createContextualizedQueryFast = async (history, query) => {
  if (!history || history.length === 0) return query;

  const lastMessage = history[history.length - 1];
  const lowerQuery = query.toLowerCase();

  // Simple contextual patterns that don't need LLM
  const followUpPatterns = [
    /^(and|also|what about|how about)\b/,
    /^(more|tell me more|details?)\b/,
    /^(why|how|when|where)\b.*\b(it|that|this|they)\b/
  ];

  let needsContext = false;
  for (const pattern of followUpPatterns) {
    if (pattern.test(lowerQuery)) {
      needsContext = true;
      break;
    }
  }

  if (needsContext && lastMessage && lastMessage.role === 'assistant') {
    // Extract main topic from last response
    const lastContent = lastMessage.content.toLowerCase();
    const topicMatch = lastContent.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/);
    const topic = topicMatch ? topicMatch[1] : '';

    if (topic) {
      return `${query} about ${topic}`;
    }
  }

  return query;
};

/**
 * Helper function to update queries with current year and date for time-sensitive searches
 */
export const updateQueryWithCurrentYear = (query) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 0-indexed, so add 1
  const currentDay = now.getDate();
  const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Get current date strings in different formats
  const currentMonthName = now.toLocaleString('default', { month: 'long' });
  const currentMonthShort = now.toLocaleString('default', { month: 'short' });
  const currentDateFormatted = `${currentMonthName} ${currentDay}, ${currentYear}`;
  const todayFormatted = `today ${currentDateFormatted}`;

  const previousYears = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4, currentYear - 5];
  const previousMonths = [];

  // Generate previous months for the current year
  for (let i = 1; i <= 3; i++) {
    const prevDate = new Date(now);
    prevDate.setMonth(now.getMonth() - i);
    previousMonths.push({
      year: prevDate.getFullYear(),
      month: prevDate.getMonth() + 1,
      monthName: prevDate.toLocaleString('default', { month: 'long' }),
      monthShort: prevDate.toLocaleString('default', { month: 'short' })
    });
  }

  let updatedQuery = query;

  // 1. Update outdated years
  previousYears.forEach(year => {
    const patterns = [
      // Basic year patterns
      new RegExp(`\\b${year}\\b(?=\\s*(game|schedule|season|event|news|latest|upcoming|next|when|match|today|now|current))`, 'gi'),
      new RegExp(`\\b(schedule|game|season|event|news|latest|upcoming|next|when|match|today|now|current)\\s+${year}\\b`, 'gi'),
      new RegExp(`\\b${year}\\s+(schedule|game|season|event|news|latest|upcoming|next|when|match|today|now|current)\\b`, 'gi'),
      // Sports specific patterns
      new RegExp(`\\b${year}[-/]\\d{2}\\b`, 'gi'), // Match 2023-24 season format
      new RegExp(`\\b\\d{2}[-/]${year}\\b`, 'gi'), // Match 23-2024 season format
      // Date formats with outdated years
      new RegExp(`\\b${year}[-/]\\d{1,2}[-/]\\d{1,2}\\b`, 'gi'), // YYYY-MM-DD or YYYY/MM/DD
      new RegExp(`\\b\\d{1,2}[-/]\\d{1,2}[-/]${year}\\b`, 'gi'), // MM/DD/YYYY or DD/MM/YYYY
    ];

    patterns.forEach(pattern => {
      updatedQuery = updatedQuery.replace(pattern, (match) => {
        return match.replace(year.toString(), currentYear.toString());
      });
    });
  });

  // 2. Update relative time references to be more specific
  const timeReplacements = [
    // Today/now references
    { pattern: /\b(today|now)\b(?!\s+\d{4})/gi, replacement: todayFormatted },
    { pattern: /\bcurrent\s+(month|week|day)\b/gi, replacement: `current $1 ${currentMonthName} ${currentYear}` },
    { pattern: /\bthis\s+(month|week|year)\b/gi, replacement: `this $1 ${currentMonthName} ${currentYear}` },
    { pattern: /\blatest\s+(news|updates|information)\b/gi, replacement: `latest $1 ${currentMonthName} ${currentYear}` },

    // Recent time references
    { pattern: /\brecent\b(?!\s+\d{4})/gi, replacement: `recent ${currentYear}` },
    { pattern: /\bupcoming\b(?!\s+\d{4})/gi, replacement: `upcoming ${currentYear}` },
    { pattern: /\bnext\s+(week|month)\b(?!\s+\d{4})/gi, replacement: `next $1 ${currentYear}` },

    // Yesterday/tomorrow references
    { pattern: /\byesterday\b/gi, replacement: `yesterday ${currentDateFormatted}` },
    { pattern: /\btomorrow\b/gi, replacement: `tomorrow ${currentDateFormatted}` },
  ];

  timeReplacements.forEach(({ pattern, replacement }) => {
    updatedQuery = updatedQuery.replace(pattern, replacement);
  });

  // 3. Update outdated month references
  previousMonths.forEach(({ year, monthName, monthShort }) => {
    if (year < currentYear) {
      const monthPatterns = [
        new RegExp(`\\b${monthName}\\s+${year}\\b`, 'gi'),
        new RegExp(`\\b${monthShort}\\s+${year}\\b`, 'gi'),
        new RegExp(`\\b${year}\\s+${monthName}\\b`, 'gi'),
        new RegExp(`\\b${year}\\s+${monthShort}\\b`, 'gi'),
      ];

      monthPatterns.forEach(pattern => {
        updatedQuery = updatedQuery.replace(pattern, (match) => {
          return match.replace(year.toString(), currentYear.toString());
        });
      });
    }
  });

  // 4. Add current context for time-sensitive keywords
  const timeSensitiveKeywords = [
    'next game', 'upcoming game', 'when is', 'schedule', 'next match',
    'latest news', 'current events', 'breaking news', 'today\'s',
    'stock price', 'weather', 'forecast', 'happening now'
  ];

  const hasTimeSensitiveKeyword = timeSensitiveKeywords.some(keyword =>
    updatedQuery.toLowerCase().includes(keyword.toLowerCase())
  );

  // Add current year/date context if not already present
  if (hasTimeSensitiveKeyword) {
    const hasYearContext = /\b\d{4}\b/.test(updatedQuery);
    const hasDateContext = /\b(today|now|current|latest|recent|upcoming|next)\s+\d{4}\b/i.test(updatedQuery);

    if (!hasYearContext && !hasDateContext) {
      updatedQuery += ` ${currentYear}`;
    }
  }

  // 5. Special handling for "latest" or "current" queries
  if (/\b(latest|current|newest|most recent)\b/i.test(updatedQuery) && !/\b\d{4}\b/.test(updatedQuery)) {
    updatedQuery += ` ${currentYear}`;
  }

  // Log the transformation if there were changes
  if (updatedQuery !== query) {
    console.log(`Query updated for current date context:`);
    console.log(`  Original: "${query}"`);
    console.log(`  Updated:  "${updatedQuery}"`);
    console.log(`  Context:  ${currentDateFormatted}`);
    updatedQuery = `${updatedQuery} ${currentDateFormatted}`;
  }

  return updatedQuery;
};

/**
 * Tool-based intelligent search using LLM with search tools
 * This allows the LLM to decide when and how to use search tools
 */
export const performIntelligentToolSearch = async (query, conversationContext = []) => {
  try {
    console.log(`🤖 Starting intelligent tool-based search for: "${query}"`);
    const startTime = Date.now();

    // Build conversation context
    let conversationHistory = "";
    if (Array.isArray(conversationContext) && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-5);
      conversationHistory = `Previous conversation:\n${recentMessages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n')}\n\n`;
    }

    // Get current date context
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentDateString = currentDate.toDateString();

    const systemPrompt = `You are an intelligent research assistant with access to powerful search tools. Your task is to answer user questions by deciding when and how to use your available tools.

CURRENT CONTEXT:
- Today's date: ${currentDateString}
- Current year: ${currentYear}

AVAILABLE TOOLS:
1. tavily_search: Advanced web search for current information, news, facts, real-time data
2. youtube_search: Video content search for tutorials, demonstrations, visual content

DECISION FRAMEWORK:
1. ANALYZE the user's question to understand what information is needed
2. DETERMINE if you need external information or if you can answer directly
3. CHOOSE the appropriate tool(s) if search is needed:
   - Use tavily_search for: current events, news, facts, data, recent information, sports scores/schedules
   - Use youtube_search for: when user explicitly asks for videos, tutorials, demonstrations, visual content
4. SYNTHESIZE the search results into a comprehensive, conversational response

SEARCH STRATEGY:
- For time-sensitive queries, emphasize current year (${currentYear}) and recent information
- Use specific, focused search queries for better results
- Consider multiple searches if the question has multiple components
- Always provide context about the recency and reliability of information

RESPONSE GUIDELINES:
- Be conversational and helpful
- Synthesize information from multiple sources when available
- Always cite your sources naturally in the response
- If information conflicts, acknowledge different perspectives
- For time-sensitive information, emphasize the currency of data
- If you can't find current information, acknowledge limitations

Remember: Use tools strategically - not every question needs a search. Use your judgment to provide the most helpful response.`;

    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `${conversationHistory}Current question: ${query}

Please analyze this question and use appropriate tools if needed to provide a comprehensive answer.`
      }
    ];

    // Use the tool-enabled LLM
    const response = await toolEnabledLLM.invoke(messages);

    const duration = Date.now() - startTime;
    console.log(`✅ Intelligent tool search completed in ${duration}ms`);

    // Extract the final response content
    let finalResponse = response.content;

    // Log tool usage if any tools were called
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`🔧 Tools used: ${response.tool_calls.map(tc => tc.name).join(', ')}`);
    }

    return {
      content: finalResponse,
      toolCalls: response.tool_calls || [],
      duration: duration,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("❌ Error in intelligent tool search:", error);

    // Fallback to direct answer
    return {
      content: "I encountered an error while processing your request. Let me try to provide a direct answer based on my knowledge.",
      error: error.message,
      fallback: true
    };
  }
};

/**
 * Executes tool calls and returns results
 */
const executeToolCalls = async (toolCalls) => {
  const toolResults = [];
  const searchTools = [
    new TavilySearchTool(),
    new YouTubeSearchTool()
  ];

  for (const toolCall of toolCalls) {
    try {
      const tool = searchTools.find(t => t.name === toolCall.name);
      if (tool) {
        console.log(`🔧 Executing tool: ${toolCall.name} with args:`, toolCall.args);
        const result = await tool._call(toolCall.args);
        toolResults.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result: result
        });
      } else {
        console.warn(`⚠️ Tool not found: ${toolCall.name}`);
      }
    } catch (error) {
      console.error(`❌ Error executing tool ${toolCall.name}:`, error);
      toolResults.push({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        error: error.message
      });
    }
  }

  return toolResults;
};

/**
 * Enhanced search function that uses tool-enabled LLM for intelligent search decisions
 */
export const runIntelligentSearch = async (state, stream = false) => {
  try {
    console.log("🔍 Running intelligent search with tool-enabled LLM");

    const query = updateQueryWithCurrentYear(state.query) || updateQueryWithCurrentYear(state.originalQuery);
    const conversationContext = state.conversationContext || state.history || [];

    // Build conversation context
    let conversationHistory = "";
    if (Array.isArray(conversationContext) && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-5);
      conversationHistory = `Previous conversation:\n${recentMessages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n')}\n\n`;
    }

    // Get current date -1 context
    const currentDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const currentYear = currentDate.getFullYear();
    const currentDateString = currentDate.toDateString();

    const systemPrompt = `You are an intelligent research assistant that provides CONCISE, well-referenced answers.

CURRENT CONTEXT:
- Today's date: ${currentDateString}
- Current year: ${currentYear}

RESPONSE STYLE:
- Provide CONCISE, direct answers (1-4 sentences for simple questions)
- Always include source references when using search results
- If possible response in 1 sentence
- Use format: "According to [Source]..." or "Based on [Domain]..."
- Lead with the main answer, then add source attribution
- I want the answer in a structured JSON format with answer and references array i.e: "responseMessage": {
            "answer": "The next Detroit Tigers game is on September 25, 2025, at 6:40 PM against the Cleveland Guardians at Progressive Field in Cleveland",
            "reference": [{
                "title": "Detroit Tigers Schedule 2025",
                "url": "https://www.mlb.com/tigers/schedule/2025-09",
                "domain": "mlb.com",
            }],
            "citations": [],
            "citationMetadata": null
        }

TOOL USAGE:
- Use web search for: current events, news, facts, data, recent information, sports, prices
- Use video search for: tutorials, demonstrations when explicitly requested
- Don't search for general knowledge you already know
- Be specific in search queries for better results

CRITICAL: When you use search tools, always include source attribution in your final response.`;

    // Initial messages
    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `${conversationHistory}Current question: ${query}

Please analyze this question and use appropriate search tools if needed to provide a CONCISE answer with proper source references.`
      }
    ];

    // First LLM call to decide on tool usage
    const initialResponse = await toolEnabledLLM.invoke(messages);

    // Check if tools were called
    if (initialResponse.tool_calls && initialResponse.tool_calls.length > 0) {
      console.log(`🔧 ${initialResponse.tool_calls.length} tool(s) will be executed`);

      // Execute the tool calls
      const toolResults = await executeToolCalls(initialResponse.tool_calls);

      // Add tool results to conversation and get final response
      const toolMessages = [
        ...messages,
        {
          role: "assistant",
          content: initialResponse.content || "I'll search for current information to answer your question.",
          tool_calls: initialResponse.tool_calls
        }
      ];

      // Add tool results as messages
      toolResults.forEach(toolResult => {
        toolMessages.push({
          role: "tool",
          content: toolResult.result || toolResult.error,
          tool_call_id: toolResult.toolCallId,
          name: toolResult.toolName
        });
      });

      // Add instructions for synthesizing the response
      toolMessages.push({
        role: "user",
        content: `Based on the search results above, please provide a CONCISE, direct answer to the original question: "${query}"

CONCISE RESPONSE GUIDELINES:
- Provide a direct, focused answer (2-4 sentences max for simple questions)
- Lead with the key facts or main answer
- Be precise and avoid unnecessary elaboration
- Include specific data, numbers, dates when relevant

CITATION REQUIREMENTS:
- Always include source references in your response
- I want the references in an array format with title, url, domain, sourceName, publishedDate, publishedYear, citationFormat

STRUCTURE:
1. Direct answer first
2. Key supporting details (if needed)
3. Source attribution

Example: "responseMessage": {
            "answer": "The next Detroit Tigers game is on September 25, 2025, at 6:40 PM against the Cleveland Guardians at Progressive Field in Cleveland",
            "reference": [{
                "title": "Detroit Tigers Schedule 2025",
                "url": "https://www.mlb.com/tigers/schedule/2025-09",
                "domain": "mlb.com",
            }],
            "citations": [],
            "citationMetadata": null
        }`
      });

      // Get final response with tool results
      const finalResponse = await llm.invoke(toolMessages);
      console.log("✅ Final response with tool results obtained", finalResponse.content);
      // Extract references from tool results
      const match = finalResponse.content.match(/```json([\s\S]*?)```/);
      let result = {}
      if (match && match[1]) {
        const jsonOnly = match[1].trim();
        result = JSON.parse(jsonOnly);

        console.log(result); // ✅ now it's a JS object
      } else {
        console.error("No JSON found!");
      }
      // Return structured response with references array
      return {
        answer: result.responseMessage.answer,
        reference: result.responseMessage.reference,
        searchMethod: 'tool_based',
        timestamp: new Date().toISOString()
      };

    } else {
      // No tools needed, return direct response
      console.log("✅ Direct answer provided without external search");
      return {
        answer: initialResponse.content,
        references: [],
        searchMethod: 'direct',
        timestamp: new Date().toISOString()
      };
    }

  } catch (error) {
    console.error("❌ Error in intelligent search:", error);
    return {
      answer: "I encountered an error while processing your search request. Please try again.",
      references: [],
      searchMethod: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Performance monitoring utility
 */
export const performanceMonitor = {
  startTime: (label) => {
    const start = Date.now();
    console.log(`⏱️  Started: ${label}`);
    return start;
  },

  endTime: (label, startTime) => {
    const duration = Date.now() - startTime;
    console.log(`✅ Completed: ${label} in ${duration}ms`);
    return duration;
  },

  logOptimization: (query, fastTrack, classificationUsed, totalTime) => {
    console.log(`🚀 Query Optimization Summary:`);
    console.log(`   Query: "${query}"`);
    console.log(`   Fast Track: ${fastTrack ? '✅' : '❌'}`);
    console.log(`   Classification: ${classificationUsed}`);
    console.log(`   Total Time: ${totalTime}ms`);
    console.log(`   Expected Savings: ${fastTrack ? '60-80%' : '20-40%'}`);
  }
};

export const runSimpleSearchTask = async (state, stream = false) => {
  try {
    console.log("Running conversational search task with search results:", state.searchResults);

    // Format search results into a readable string with enhanced content (no citations)
    let formattedSearchResults = "";
    if (Array.isArray(state.searchResults)) {
      formattedSearchResults = state.searchResults.map((result, index) => {
        // Use detailed content if available, otherwise fall back to regular content
        const content = result.detailedContent || result.content || result.snippet || result.description || 'No content available';
        const domain = result.domain || 'Unknown domain';
        const isRecent = result.isRecent ? ' (Recent)' : '';
        const publishedDate = result.publishedDate ? ` (Published: ${result.publishedDate})` : '';

        // Handle YouTube results differently
        if (result.source === 'youtube') {
          return `🎥 ${result.title}
Channel: ${result.channelTitle}
URL: ${result.url}
Description: ${content}
Published: ${result.publishedAt}
Source: YouTube Video
---`;
        } else {
          // Regular web results
          return `${result.title}
Domain: ${domain}${isRecent}${publishedDate}
URL: ${result.url}
Content: ${content}
Relevance Score: ${result.score?.toFixed(3) || 'N/A'}
---`;
        }
      }).join('\n\n');
    } else {
      formattedSearchResults = JSON.stringify(state.searchResults, null, 2);
    }

    // Build conversation context from message history - defensive coding
    let conversationHistory = "";

    // Handle different formats of conversation context
    let contextMessages = [];
    if (state.conversationContext) {
      if (Array.isArray(state.conversationContext)) {
        contextMessages = state.conversationContext;
      } else if (typeof state.conversationContext === 'string') {
        // If it's a string, skip it and use history instead
        contextMessages = [];
      }
    }

    // Fallback to history if conversationContext is not available or empty
    if (contextMessages.length === 0 && state.history && Array.isArray(state.history)) {
      contextMessages = state.history;
    }

    // Build conversation history string
    if (contextMessages.length > 0) {
      const recentMessages = contextMessages.slice(-5);
      conversationHistory = `Previous conversation:\n${recentMessages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n')}\n\n`;
    }

    // Include original vs search query context
    let queryContext = "";
    if (state.originalQuery && state.searchQuery && state.originalQuery !== state.searchQuery) {
      queryContext = `User's original question: ${state.originalQuery}
Search query used: ${state.searchQuery}

`;
    }

    const messages = [
      {
        role: "system",
        content: `You are an intelligent research assistant that provides CONCISE, well-referenced responses.

CURRENT DATE: ${new Date().toDateString()} (${new Date().getFullYear()})

CONCISE RESPONSE RULES:
- Provide direct, focused answers (2-4 sentences for simple questions)
- Lead with the main answer or key facts
- Avoid unnecessary elaboration unless specifically requested
- Be precise and factual

CITATION REQUIREMENTS (CRITICAL):
- ALWAYS include source references in your response
- Use format: "According to [Source Name/Domain]..." or "Based on [Source]..."
- For multiple sources: "Sources: [Source1], [Source2]" at the end
- Include publication dates when available: "[Source] (2025)"
- For YouTube videos: "According to [Channel Name] on YouTube..."

ANSWER-ONLY FORMAT:
- IF user asks for "answer only" or "no explanations": respond with just the fact, no sources
- Example: "What is the capital of France? Answer only." → "Paris."

RESPONSE STRUCTURE:
1. Direct answer first
2. Key supporting details (if needed and space allows)
3. Source attribution

EXAMPLES:
- Question: "When is the next Detroit Tigers game?"
- Answer: "The Detroit Tigers' next game is October 1st at 7:30 PM against Cleveland at Comerica Park. According to MLB.com (September 2025)."

- Question: "What's the latest on AI developments?"
- Answer: "Recent AI developments include GPT-5 announcements and new robotics advances. Based on TechCrunch and Reuters (September 2025)."

CRITICAL: Always include source attribution with your answers unless specifically asked for "answer only" format.`
      },
      {
        role: "user",
        content: `${conversationHistory}${queryContext}Current question: ${state.query}

Search results:
${formattedSearchResults}

Please provide a CONCISE, well-referenced response based on the search results.

REQUIREMENTS:
- Lead with the direct answer (2-4 sentences max for simple questions)
- Include source attribution: "According to [Source]..." or "Based on [Domain]..."
- Add publication dates when available
- Be precise and factual

ANSWER-ONLY EXCEPTION: If user specifically asks for "answer only", "no details", etc., provide just the fact without sources.`
      }
    ];

    if (stream) {
      // For streaming responses
      const streamResponse = await llm.stream(messages);
      return streamResponse;
    } else {
      // For regular responses
      const response = await llm.invoke(messages);
      console.log("Gemini response received", response.content);

      // Extract references from search results
      const references = [];
      if (Array.isArray(state.searchResults)) {
        state.searchResults.forEach(result => {
          references.push({
            title: result.title,
            url: result.url,
            domain: result.domain || 'Unknown domain',
            sourceName: result.sourceName || result.domain || 'Unknown source',
            publishedDate: result.publishedDate,
            publishedYear: result.publishedYear || (result.publishedDate ? new Date(result.publishedDate).getFullYear() : new Date().getFullYear()),
            citationFormat: result.citationFormat || `${result.sourceName || result.domain} (${result.publishedYear || new Date().getFullYear()})`
          });
        });
      }

      return {
        answer: response.content,
        references: references,
        searchMethod: 'traditional',
        timestamp: new Date().toISOString()
      };
    }

  } catch (error) {
    console.error("Error in runSimpleSearchTask:", error);
    return {
      answer: "I encountered an error while processing your request. Please try again.",
      references: [],
      searchMethod: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

export const createBetterQueryFromMultipleQuestions = async (
  query,
  searchResults,
  conversationContext = []
) => {
  try {
    // Include conversation context for better query refinement
    let contextHistory = "";
    if (conversationContext && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-3);
      contextHistory = `Recent conversation:\n${recentMessages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n')}\n\n`;
    }

    // Format current search results
    let formattedResults = "";
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      formattedResults = searchResults.map((result, index) => {
        return `Result ${index + 1}: ${result.title} - ${result.content?.substring(0, 200)}...`;
      }).join('\n');
    }

    // Get current date information for context-aware queries
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
    const currentDay = currentDate.getDate();
    const currentDateString = `${currentMonth} ${currentDay - 1}, ${currentYear}`;
    const currentWeekday = currentDate.toLocaleString('default', { weekday: 'long' });

    const messages = [
      {
        role: "system",
        content: `You are a query optimization specialist. Your task is to improve search queries based on:
1. The original user question
2. Conversation context
3. Initial search results quality
4. Current date and time context

CURRENT DATE CONTEXT:
- Today is ${currentWeekday}, ${currentDateString}
- Current year: ${currentYear}
- When users ask about "next", "upcoming", "latest", or current events, use ${currentYear} and after ${currentDateString}.

OPTIMIZATION RULES:
- If results are relevant and comprehensive, keep the query simple
- If results are too broad, add specific keywords or constraints
- If results miss the user's intent, rephrase to capture the core need
- Consider conversation context to understand what the user really wants
- Make the query more specific if initial results are off-topic
- ALWAYS use the current year (${currentYear}) for time-sensitive queries
- Replace outdated years in queries with the current year (${currentYear})
- For sports schedules, events, news - ensure the year is ${currentYear}

DATE-AWARE EXAMPLES:
- "Detroit Tigers game 2023" → "Detroit Tigers game ${currentYear} and after ${currentDateString}"
- "Latest AI developments 2022" → "Latest AI developments ${currentYear}"
- "Upcoming events" → "Upcoming events ${currentYear}"

Output ONLY the improved search query, nothing else.`
      },
      {
        role: "user",
        content: `${contextHistory}Original query: "${query}"

Current search results:
${formattedResults}

Generate an improved search query that uses the current year (${currentYear}) when relevant:`
      }
    ];

    const response = await llm.invoke(messages);
    let improvedQuery = response.content.trim();

    // Apply additional year correction as a safety measure
    improvedQuery = updateQueryWithCurrentYear(improvedQuery);

    return improvedQuery;

  } catch (error) {
    console.error("Error generating improved query:", error);
    return query; // Return original query if improvement fails
  }
};

export const checkIfSearchNeededForTheQueryUsingAi = async (query, conversationContext = []) => {
  try {
    // Prepare conversation history for context
    const contextHistory = conversationContext.slice(-3).map(msg =>
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    // Get current date for better classification
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
    const currentDateString = `${currentMonth} ${currentDate.getDate()}, ${currentYear}`;

    const systemPrompt = `You are an intelligent query classifier with conversational awareness.

Your job is to decide if a user query needs an EXTERNAL SEARCH or can be ANSWERED DIRECTLY based on:
1. The query content
2. The conversation context
3. Whether recent information is required

CURRENT DATE CONTEXT:
- Today is ${currentDateString}
- Current year: ${currentYear}

CLASSIFICATION RULES:
- SEARCH: Time-sensitive data, current events, news, prices, recent developments, specific real-time information
- SEARCH: Follow-up questions that reference "latest", "recent", "current", "today", "now", "next", "upcoming"
- SEARCH: Queries about ongoing events, trending topics, or changing information
- SEARCH: Sports schedules, game times, upcoming matches (these change frequently)
- SEARCH: Weather, stock prices, cryptocurrency values, breaking news
- ANSWER: General knowledge, historical facts, definitions, explanations, calculations
- ANSWER: Follow-up clarifications about previously discussed topics
- ANSWER: Conversational responses, greetings, acknowledgments

CONVERSATIONAL AWARENESS:
- Consider if the query is continuing a previous topic
- If previous context provides sufficient information, lean toward ANSWER
- If query introduces new time-sensitive elements, choose SEARCH
- Sports schedules and "next game" queries always need SEARCH for current information

CRITICAL: Respond with ONLY "SEARCH" or "ANSWER" - no explanations, no thinking tags, no extra text.`;

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Conversation Context:
${contextHistory}

Current Query: "${query}"

Classification needed:`
      }
    ]

    const response = await llm.invoke(messages);
    let rawContent = response.content.trim();

    console.log("AI classification for query:", query, "→", rawContent);

    // Handle thinking tags - extract the actual decision after thinking
    let cleanedContent = rawContent;
    if (rawContent.includes('<THINK>') || rawContent.includes('<think>')) {
      // Remove everything between thinking tags (case insensitive)
      const regex = /<think>[\s\S]*?<\/think>/gi;
      cleanedContent = rawContent.replace(regex, '').trim();
    }

    // Extract the final decision
    const finalDecision = cleanedContent.toUpperCase().trim();
    console.log("Cleaned decision:", finalDecision);

    // Return the decision
    return finalDecision.includes("SEARCH") ? "SEARCH" : "ANSWER";

  } catch (error) {
    console.error("Error checking if search is needed:", error);
    return "ANSWER"; // Default to direct answer on error
  }
};

export const analyzeDirectAnswerQuality = async (answer, originalQuery, conversationContext = []) => {
  try {
    // Build conversation context for better analysis
    let conversationHistory = "";
    if (Array.isArray(conversationContext) && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-3);
      conversationHistory = `Previous conversation:\n${recentMessages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n')}\n\n`;
    }

    const systemPrompt = `You are an expert answer quality analyzer. Your task is to evaluate if a direct answer is adequate or if external search is needed.

ANALYSIS CRITERIA:
1. NEGATIVE INDICATORS (requires search):
   - Answer explicitly states "I don't know" or "I'm not sure"
   - Contains phrases like "I cannot provide", "I don't have access to", "I'm unable to"
   - Mentions outdated information or knowledge cutoff limitations
   - Provides vague or generic responses without specific details
   - Acknowledges lack of current/real-time information
   - Contains disclaimers about needing to search or verify

2. INADEQUATE RESPONSES (requires search):
   - Very short responses (less than 2 sentences) for complex questions
   - Generic advice without specific details when specifics are requested
   - Partial answers that only address part of the question
   - Responses that ask for clarification instead of attempting to answer

3. ADEQUATE RESPONSES (no search needed):
   - Provides specific, detailed information
   - Answers the question comprehensively
   - Shows confidence in the information provided
   - Includes relevant context and examples
   - Successfully builds on conversation history

IMPORTANT: Respond with ONLY "ADEQUATE" or "INADEQUATE" - no explanations, no thinking tags, no extra text.`;

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `${conversationHistory}Original question: "${originalQuery}"

Direct answer provided: "${answer}"

Analyze if this answer is ADEQUATE or INADEQUATE:`
      }
    ];

    const response = await llm.invoke(messages);
    let rawContent = response.content.trim();

    console.log("Answer quality analysis for query:", originalQuery, "→", rawContent);

    // Handle thinking tags - extract the actual decision
    let cleanedContent = rawContent;
    if (rawContent.includes('<THINK>') || rawContent.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/gi;
      cleanedContent = rawContent.replace(regex, '').trim();
    }

    const finalDecision = cleanedContent.toUpperCase().trim();
    console.log("Cleaned answer quality decision:", finalDecision);

    return finalDecision.includes("INADEQUATE") ? "INADEQUATE" : "ADEQUATE";

  } catch (error) {
    console.error("Error analyzing answer quality:", error);
    return "ADEQUATE"; // Default to adequate on error to avoid infinite loops
  }
};

export const giveAnswerWithoutSearch = async (query, conversationContext = []) => {
  try {
    // Build conversation context with defensive coding
    let conversationHistory = "";
    if (Array.isArray(conversationContext) && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-5);
      conversationHistory = `Previous conversation:\n${recentMessages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n')}\n\n`;
    }

    const systemPrompt = `You are an expert AI assistant providing direct answers without external search.
CRITICAL: IF the user explicitly wants an answer-only format (no explanations), provide a concise answer without additional context or references. For Example If someone asks "What is the capital of France? Answer only." you respond with "Paris." without any further elaboration.
Or if the user says "Just give me the answer, no details." you respond with the answer only.
Example: What is better tea or coffee? Answer only.

RESPONSE GUIDELINES:
- Be conversational and helpful
- Use your knowledge base to provide accurate information
- Consider the conversation context when responding
- If you don't have current/specific information, acknowledge limitations
- Build upon previous conversation naturally
- Be concise but comprehensive

CONVERSATION AWARENESS:
- Reference previous topics when relevant
- Maintain consistency with earlier responses
- Understand follow-up questions in context`;

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `${conversationHistory}Current question: ${query}

Please provide a direct answer based on your knowledge:`
      }
    ]

    const response = await llm.invoke(messages);
    return response.content;

  } catch (error) {
    console.error("Error giving answer without search:", error);
    return "Sorry, I encountered an error while processing your request. Please try again.";
  }
};

/**
 * Configuration for conversation context management
 */
const CONTEXT_CONFIG = {
  MAX_MESSAGES: 20, // Maximum number of messages to keep in active context
  TRIM_TO_MESSAGES: 10, // Number of recent messages to keep when trimming
  MIN_MESSAGES_FOR_SUMMARY: 8, // Minimum messages before creating summary
  MAX_TOKENS_ESTIMATE: 8000, // Rough token limit for context
};

/**
 * Estimates token count for conversation history
 */
const estimateTokenCount = (history) => {
  if (!Array.isArray(history)) return 0;

  let totalTokens = 0;
  history.forEach(msg => {
    // Rough estimation: 1 token per 4 characters
    const content = msg.content || '';
    totalTokens += Math.ceil(content.length / 4);
  });

  return totalTokens;
};

/**
 * Checks if conversation context needs trimming
 */
export const shouldTrimContext = (history, conversationSummary = null) => {
  if (!Array.isArray(history)) return false;

  const messageCount = history.length;
  const tokenCount = estimateTokenCount(history);

  // Trim if we exceed message limit or token limit
  const exceedsMessages = messageCount > CONTEXT_CONFIG.MAX_MESSAGES;
  const exceedsTokens = tokenCount > CONTEXT_CONFIG.MAX_TOKENS_ESTIMATE;

  console.log(`Context check: ${messageCount} messages, ~${tokenCount} tokens`);
  console.log(`Needs trim: ${exceedsMessages || exceedsTokens}`);

  return exceedsMessages || exceedsTokens;
};

/**
 * Creates a summary of older conversation messages
 */
export const summarizeConversation = async (messagesToSummarize) => {
  try {
    if (!Array.isArray(messagesToSummarize) || messagesToSummarize.length === 0) {
      return "";
    }

    // Format messages for summarization
    const conversationText = messagesToSummarize
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const systemPrompt = `You are an expert conversation summarizer. Create a concise but comprehensive summary of the conversation that captures:

1. KEY TOPICS DISCUSSED: Main subjects and themes
2. IMPORTANT DECISIONS OR CONCLUSIONS: Any decisions made or conclusions reached
3. CONTEXT THAT AFFECTS FUTURE RESPONSES: Information that would be relevant for continuing the conversation
4. USER PREFERENCES OR REQUIREMENTS: Any specific needs or preferences mentioned

GUIDELINES:
- Keep the summary under 300 words
- Focus on information that would be useful for continuing the conversation
- Maintain the chronological flow of important topics
- Include specific details that might be referenced later
- Use clear, structured format

Create a conversation summary:`;

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Conversation to summarize:\n\n${conversationText}`
      }
    ];

    const response = await llm.invoke(messages);
    const summary = response.content.trim();

    console.log(`Created conversation summary (${messagesToSummarize.length} messages)`);
    console.log(`Summary length: ${summary.length} characters`);

    return summary;

  } catch (error) {
    console.error("Error summarizing conversation:", error);
    return "Previous conversation context available but couldn't be summarized.";
  }
};

/**
 * Manages conversation context by trimming and summarizing when needed
 */
export const manageConversationContext = async (history, existingSummary = null) => {
  try {
    if (!Array.isArray(history)) {
      return {
        trimmedHistory: [],
        conversationSummary: existingSummary,
        contextManaged: false
      };
    }

    // Check if trimming is needed
    if (!shouldTrimContext(history, existingSummary)) {
      return {
        trimmedHistory: history,
        conversationSummary: existingSummary,
        contextManaged: false
      };
    }

    console.log(`Managing context: ${history.length} messages need trimming`);

    // Determine how many messages to keep and summarize
    const messagesToKeep = CONTEXT_CONFIG.TRIM_TO_MESSAGES;
    const recentMessages = history.slice(-messagesToKeep);
    const messagesToSummarize = history.slice(0, -messagesToKeep);

    // Only create summary if we have enough messages to summarize
    let newSummary = existingSummary;
    if (messagesToSummarize.length >= CONTEXT_CONFIG.MIN_MESSAGES_FOR_SUMMARY) {
      const oldConversationSummary = await summarizeConversation(messagesToSummarize);

      // Combine with existing summary if present
      if (existingSummary) {
        newSummary = `Previous context: ${existingSummary}\n\nRecent developments: ${oldConversationSummary}`;
      } else {
        newSummary = oldConversationSummary;
      }
    }

    console.log(`Context managed: Kept ${recentMessages.length} recent messages, summarized ${messagesToSummarize.length} older messages`);

    return {
      trimmedHistory: recentMessages,
      conversationSummary: newSummary,
      contextManaged: true,
      trimmedMessageCount: messagesToSummarize.length,
      keptMessageCount: recentMessages.length
    };

  } catch (error) {
    console.error("Error managing conversation context:", error);

    // Fallback: keep recent messages without summary
    const fallbackMessages = history.slice(-CONTEXT_CONFIG.TRIM_TO_MESSAGES);
    return {
      trimmedHistory: fallbackMessages,
      conversationSummary: existingSummary,
      contextManaged: false,
      error: "Context management failed, using fallback"
    };
  }
};

/**
 * Detects if the user is specifically asking for video content using LLM
 */
export const isVideoOnlyQuery = async (query, conversationContext = []) => {
  try {
    // Build conversation context for better classification
    let conversationHistory = "";
    if (Array.isArray(conversationContext) && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-3);
      conversationHistory = `Previous conversation:\n${recentMessages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n')}\n\n`;
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
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `${conversationHistory}Current query: "${query}"

Determine if this is a video-only query:`
      }
    ];

    const response = await llm.invoke(messages);
    let rawContent = response.content.trim();

    console.log("LLM video-only classification for query:", query, "→", rawContent);

    // Handle thinking tags - extract the actual decision
    let cleanedContent = rawContent;
    if (rawContent.includes('<THINK>') || rawContent.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/gi;
      cleanedContent = rawContent.replace(regex, '').trim();
    }

    const finalDecision = cleanedContent.toUpperCase().trim();
    console.log("Cleaned video-only decision:", finalDecision);

    const isNotVideoOnly = finalDecision.includes("NOT_VIDEO_ONLY");
    console.log(`Video-only query result: ${isNotVideoOnly}`);

    return isNotVideoOnly ? false : true;

  } catch (error) {
    console.error("Error detecting video-only query with LLM:", error);
    return false; // Default to not video-only on error
  }
};

/**
 * Extracts the number of videos requested from the query using LLM
 */
export const extractVideoCount = async (query, conversationContext = []) => {
  try {
    // Build conversation context for better analysis
    let conversationHistory = "";
    if (Array.isArray(conversationContext) && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-3);
      conversationHistory = `Previous conversation:\n${recentMessages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n')}\n\n`;
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
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `${conversationHistory}Current query: "${query}"

Extract the number of videos requested:`
      }
    ];

    const response = await llm.invoke(messages);
    let rawContent = response.content.trim();

    console.log("LLM video count extraction for query:", query, "→", rawContent);

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
    console.error("Error extracting video count with LLM:", error);
    return 1; // Default to 1 on error
  }
};

/**
 * Analyzes video query and extracts the requested count using LLM
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

    console.log(`LLM Video query analysis - Query: "${query}", IsVideoOnly: ${isVideoOnly}, Count: ${videoCount}`);

    return { isVideoOnly, videoCount };

  } catch (error) {
    console.error("Error analyzing video query with LLM:", error);
    return { isVideoOnly: false, videoCount: 1 };
  }
};

/**
 * Determines if YouTube search would be relevant for the given query
 */
export const shouldSearchYouTube = async (query, conversationContext = []) => {
  try {
    // Build conversation context for better classification
    let conversationHistory = "";
    if (Array.isArray(conversationContext) && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-3);
      conversationHistory = `Previous conversation:\n${recentMessages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n')}\n\n`;
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
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `${conversationHistory}Current query: "${query}"

Determine if YouTube search would be relevant:`
      }
    ];

    const response = await llm.invoke(messages);
    let rawContent = response.content.trim();

    console.log("YouTube relevance analysis for query:", query, "→", rawContent);

    // Handle thinking tags - extract the actual decision
    let cleanedContent = rawContent;
    if (rawContent.includes('<THINK>') || rawContent.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/gi;
      cleanedContent = rawContent.replace(regex, '').trim();
    }

    const finalDecision = cleanedContent.toUpperCase().trim();
    console.log("Cleaned YouTube relevance decision:", finalDecision);

    return !finalDecision.includes("NOT_RELEVANT");

  } catch (error) {
    console.error("Error checking YouTube relevance:", error);
    return false; // Default to no YouTube search on error
  }
};

/**
 * Creates an optimized YouTube search query from the original query and context
 */
export const createOptimizedYouTubeQuery = async (query, conversationContext = []) => {
  try {
    // Build conversation history
    let conversationHistory = "";
    if (conversationContext && conversationContext.length > 0) {
      const recentMessages = conversationContext.slice(-3);
      conversationHistory = `Recent conversation:\n${recentMessages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n')}\n\n`;
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
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `${conversationHistory}Original query: "${query}"

Create an optimized YouTube search query:`
      }
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
    console.error("Error optimizing YouTube query:", error);
    // Fallback to original query
    return query;
  }
};

/**
 * Performs YouTube search using YouTube Data API v3
 */
export const searchYouTube = async (query, maxResults = 5, conversationContext = []) => {
  try {
    const youtubeApiKey = config.youtube_api_key

    if (!youtubeApiKey) {
      console.warn("YouTube API key not configured, skipping YouTube search");
      return [];
    }

    // Optimize the query for better YouTube results
    const optimizedQuery = await createOptimizedYouTubeQuery(query, conversationContext);

    const searchUrl = `https://www.googleapis.com/youtube/v3/search`;
    console.log(`Performing YouTube search for: "${{
      part: 'snippet',
      q: optimizedQuery, // Use optimized query
      type: 'video',
      maxResults: maxResults.toString(),
      order: 'relevance',
      key: youtubeApiKey,
      safeSearch: 'moderate',
      relevanceLanguage: 'en'
    }}"`);

    const params = new URLSearchParams({
      part: 'snippet',
      q: optimizedQuery, // Use optimized query
      type: 'video',
      maxResults: maxResults.toString(),
      order: 'relevance',
      key: youtubeApiKey,
      safeSearch: 'moderate',
      relevanceLanguage: 'en'
    });

    console.log(`Searching YouTube for: "${optimizedQuery}" (original: "${query}")`);

    const response = await fetch(`${searchUrl}?${params}`);
    // console.log(`YouTube API response status: ${JSON.stringify(response.json())}`);

    if (!response.ok) {
      console.error(`YouTube API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.log("No YouTube results found");
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
        citationIndex: index + 1
      };
    });

    console.log(`Found ${youtubeResults.length} YouTube results`);
    return youtubeResults;

  } catch (error) {
    console.error("Error searching YouTube:", error);
    return [];
  }
};
