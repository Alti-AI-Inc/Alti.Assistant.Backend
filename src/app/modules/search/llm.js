import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TavilySearch } from '@langchain/tavily';
import config from "../../../../config/index.js";
import { tavily } from "@tavily/core";
import { googleSearch, YouTubeSearchTool } from './tools.js';
import { GoogleCustomSearch } from "@langchain/community/tools/google_custom_search";
import Conversation from "../conversations/conversation.model.js";
import { WebBrowser } from "langchain/tools/webbrowser";
import e from "express";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { classifyQuery } from './services/queryClassifier.js';
import { ClaudeService } from './services/claudeService.js';

/**
 * Configuration for intelligent conversation history management
 */
const HISTORY_CONFIG = {
  MAX_TOKENS: 4000,           // Maximum tokens before triggering summarization
  SUMMARY_TARGET_TOKENS: 2500, // Target token count for summary
  MIN_MESSAGES_TO_KEEP: 4,    // Minimum recent messages to always keep
  MAX_MESSAGES_TO_KEEP: 8,    // Maximum recent messages to keep after summarization
  TOKEN_ESTIMATION_RATIO: 4,  // Rough estimation: 1 token ≈ 4 characters
  SUMMARIZATION_THRESHOLD: 0.6 // Start summarization when 60% of max tokens reached
};

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
    new YouTubeSearchTool(),
    googleSearch
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
    updatedQuery = `${updatedQuery} For context today is: ${currentDateFormatted}`;

    console.log(`Final contextualized query: "${updatedQuery}"`);

  }

  return updatedQuery;
};

/**
 * INTELLIGENT CONVERSATION HISTORY MANAGEMENT
 * Automatically manages conversation history with token-aware summarization
 */

/**
 * Estimates token count for conversation history
 * Uses character-to-token ratio for fast estimation
 */
export const estimateTokenCount = (history) => {
  if (!Array.isArray(history) || history.length === 0) return 0;
  console.log(`Estimating tokens for ${history.length} messages`);

  let totalCharacters = 0;
  history.forEach(msg => {
    if (msg && msg.content) {
      totalCharacters += msg.content.length;
      // Add overhead for role and formatting
      totalCharacters += 20;
    }
  });

  // Convert characters to estimated tokens
  const estimatedTokens = Math.ceil(totalCharacters / HISTORY_CONFIG.TOKEN_ESTIMATION_RATIO);

  console.log(`📊 Token estimation: ${totalCharacters} chars ≈ ${estimatedTokens} tokens`);
  return estimatedTokens;
};

/**
 * Checks if conversation history needs management
 */
export const needsHistoryManagement = (history, existingSummary = null) => {
  if (!Array.isArray(history) || history.length === 0) return false;

  const tokenCount = estimateTokenCount(history);
  const threshold = HISTORY_CONFIG.MAX_TOKENS * 0.7; // Summarize at 70% of max tokens (2800 tokens)

  const needsManagement = tokenCount > threshold;

  console.log(`🔍 History check: ${tokenCount} tokens (threshold: ${threshold})`);
  console.log(`📝 Needs management: ${needsManagement}`);

  return needsManagement;
};

/**
 * Creates an intelligent conversation summary using Gemini
 * Targets specific token count for optimal context retention
 */
export const createIntelligentSummary = async (messagesToSummarize, targetTokens = HISTORY_CONFIG.SUMMARY_TARGET_TOKENS) => {
  try {
    if (!Array.isArray(messagesToSummarize) || messagesToSummarize.length === 0) {
      return "";
    }

    console.log(`🧠 Creating intelligent summary for ${messagesToSummarize.length} messages`);
    console.log(`🎯 Target: ${targetTokens} tokens`);

    // Format messages for summarization
    const conversationText = messagesToSummarize
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const systemPrompt = `You are an expert conversation summarizer. Create an intelligent, contextual summary of this conversation.

TARGET: Create a summary of approximately ${targetTokens} tokens (roughly ${targetTokens * 4} characters).

SUMMARIZATION STRATEGY:
1. PRESERVE KEY CONTEXT: Maintain important topics, decisions, and ongoing discussions
2. CAPTURE USER INTENT: Remember user preferences, requests, and interests  
3. RETAIN FACTUAL DATA: Keep specific information, dates, names, and numbers
4. MAINTAIN CONVERSATION FLOW: Preserve the logical progression of topics
5. INCLUDE RECENT FOCUS: Emphasize more recent topics and developments

STRUCTURE YOUR SUMMARY:
- **Main Topics Discussed**: Key subjects and themes
- **Important Facts & Data**: Specific information mentioned
- **User Preferences & Requests**: What the user is looking for or interested in
- **Recent Context**: Latest developments in the conversation
- **Action Items**: Any pending questions or follow-ups

QUALITY REQUIREMENTS:
- Be comprehensive yet concise
- Use clear, structured formatting
- Include specific details that might be referenced later
- Maintain chronological context where relevant
- Ensure the summary provides sufficient context for future responses

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

    console.log(`🔄 Generating summary with Gemini...`);
    const startTime = Date.now();

    const response = await llm.invoke(messages);
    const summary = response.content.trim();

    const duration = Date.now() - startTime;
    const summaryTokens = estimateTokenCount([{ content: summary }]);

    console.log(`✅ Summary created in ${duration}ms`);
    console.log(`📏 Summary length: ${summary.length} chars ≈ ${summaryTokens} tokens`);
    console.log(`🎯 Target efficiency: ${((summaryTokens / targetTokens) * 100).toFixed(1)}%`);

    return summary;

  } catch (error) {
    console.error("❌ Error creating intelligent summary:", error);
    // Fallback to simple summary
    return `Previous conversation covered ${messagesToSummarize.length} messages with topics including search queries and responses. Context available but couldn't be fully summarized due to technical issues.`;
  }
};

/**
 * Intelligently manages conversation history with smart summarization and trimming
 * Automatically triggers when token limits are approached
 */
export const manageConversationHistoryIntelligent = async (history, existingSummary = null, forceManagement = false) => {
  try {
    if (!Array.isArray(history)) {
      console.log("⚠️ Invalid history format, returning empty state");
      return {
        managedHistory: [],
        conversationSummary: existingSummary,
        historyManaged: false,
        tokenCount: 0
      };
    }

    const initialTokenCount = estimateTokenCount(history);
    console.log(`🔍 Starting history management - Initial tokens: ${initialTokenCount}`);

    // Check if management is needed
    if (!forceManagement && !needsHistoryManagement(history, existingSummary)) {
      console.log("✅ History within limits, no management needed");
      return {
        managedHistory: history,
        conversationSummary: existingSummary,
        historyManaged: false,
        tokenCount: initialTokenCount
      };
    }

    console.log(`🚀 History management triggered - Processing ${history.length} messages`);

    // Determine how many recent messages to keep
    const messagesToKeep = Math.min(
      Math.max(HISTORY_CONFIG.MIN_MESSAGES_TO_KEEP,
        Math.floor(history.length * 0.3)), // Keep at least 30% of messages
      HISTORY_CONFIG.MAX_MESSAGES_TO_KEEP
    );

    const recentMessages = history.slice(-messagesToKeep);
    const messagesToSummarize = history.slice(0, -messagesToKeep);

    console.log(`📊 Management plan:`);
    console.log(`   📝 Messages to summarize: ${messagesToSummarize.length}`);
    console.log(`   🔄 Recent messages to keep: ${recentMessages.length}`);

    // Create intelligent summary if we have enough messages to summarize
    let newSummary = existingSummary;
    if (messagesToSummarize.length >= 2) { // Need at least 2 messages to summarize
      const oldConversationSummary = await createIntelligentSummary(
        messagesToSummarize,
        HISTORY_CONFIG.SUMMARY_TARGET_TOKENS
      );

      // Combine with existing summary if present
      if (existingSummary && existingSummary.trim()) {
        newSummary = `## Previous Context:\n${existingSummary}\n\n## Recent Developments:\n${oldConversationSummary}`;

        // If combined summary is too long, recreate with both parts
        const combinedTokens = estimateTokenCount([{ content: newSummary }]);
        if (combinedTokens > HISTORY_CONFIG.SUMMARY_TARGET_TOKENS * 1.2) {
          console.log(`📏 Combined summary too long (${combinedTokens} tokens), recreating...`);
          // Recreate summary with all messages that would be summarized
          const allMessagesToSummarize = [
            { role: 'assistant', content: `Previous summary: ${existingSummary}` },
            ...messagesToSummarize
          ];
          newSummary = await createIntelligentSummary(allMessagesToSummarize, HISTORY_CONFIG.SUMMARY_TARGET_TOKENS);
        }
      } else {
        newSummary = oldConversationSummary;
      }
    }

    const finalTokenCount = estimateTokenCount(recentMessages) + estimateTokenCount([{ content: newSummary || '' }]);
    const tokenReduction = initialTokenCount - finalTokenCount;
    const reductionPercentage = ((tokenReduction / initialTokenCount) * 100).toFixed(1);

    console.log(`✅ History management completed:`);
    console.log(`   📉 Token reduction: ${tokenReduction} (${reductionPercentage}%)`);
    console.log(`   📊 Final token count: ${finalTokenCount}`);
    console.log(`   📝 Has summary: ${!!newSummary}`);
    console.log(`   🔄 Recent messages: ${recentMessages.length}`);

    return {
      managedHistory: recentMessages,
      conversationSummary: newSummary,
      historyManaged: true,
      tokenCount: finalTokenCount,
      tokenReduction: tokenReduction,
      reductionPercentage: parseFloat(reductionPercentage),
      summarizedMessages: messagesToSummarize.length,
      keptMessages: recentMessages.length
    };

  } catch (error) {
    console.error("❌ Error in intelligent history management:", error);

    // Fallback: keep recent messages without summary
    const fallbackMessages = history.slice(-HISTORY_CONFIG.MIN_MESSAGES_TO_KEEP);
    return {
      managedHistory: fallbackMessages,
      conversationSummary: existingSummary,
      historyManaged: false,
      tokenCount: estimateTokenCount(fallbackMessages),
      error: "History management failed, using fallback"
    };
  }
};

/**
 * Prepares conversation context with intelligent history management
 * This is the main function to call before processing any query
 */
export const prepareConversationContext = async (history, existingSummary = null, currentQuery = '') => {
  try {
    console.log(`🔧 Preparing conversation context for query: "${currentQuery}"`);

    // First, check if history management is needed
    const managementResult = await manageConversationHistoryIntelligent(history, existingSummary);

    // Build formatted conversation context
    let conversationContext = "";

    // Add summary if available
    if (managementResult.conversationSummary) {
      conversationContext += `## Previous Conversation Summary:\n${managementResult.conversationSummary}\n\n`;
    }

    // Add recent conversation history
    if (managementResult.managedHistory && managementResult.managedHistory.length > 0) {
      conversationContext += `## Recent Conversation:\n`;
      managementResult.managedHistory.forEach(msg => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const content = msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content;
        conversationContext += `**${role}**: ${content}\n\n`;
      });
    }

    const contextTokens = estimateTokenCount([{ content: conversationContext }]);

    console.log(`✅ Context prepared - ${contextTokens} tokens`);

    return {
      ...managementResult,
      formattedContext: conversationContext,
      contextTokens: contextTokens,
      isOptimized: managementResult.historyManaged
    };

  } catch (error) {
    console.error("❌ Error preparing conversation context:", error);
    return {
      managedHistory: history?.slice(-HISTORY_CONFIG.MIN_MESSAGES_TO_KEEP) || [],
      conversationSummary: existingSummary,
      formattedContext: "",
      historyManaged: false,
      tokenCount: 0,
      contextTokens: 0,
      error: error.message
    };
  }
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

const executeSingleToolCall = async (toolCall) => {
  try {
    console.log(`🔍 Preparing to execute tool: ${toolCall.name} with args:`, toolCall.args);
    const searchTools = [
      new YouTubeSearchTool(),
      googleSearch,
      new WebBrowser({
        model: llm, embeddings: new GoogleGenerativeAIEmbeddings({
          apiKey: config.gemini_secret_key,
        })
      })
    ];

    const tool = searchTools.find(t => t.name === toolCall.name);
    if (tool) {
      console.log(`🔧 Executing tool: ${toolCall.name} with args:`, toolCall.args);
      const result = await tool._call(toolCall.args);
      console.log(`✅ Tool executed successfully: ${toolCall.name}`, result);
      return result;
    } else {
      console.warn(`⚠️ Tool not found: ${toolCall.name}`);
      return { error: `Tool not found: ${toolCall.name}` };
    }
  } catch (error) {
    console.error(`❌ Error executing tool ${toolCall.name}:`, error);
    return { error: error.message };
  }
};

const executeToolCalls = async (toolCalls) => {
  const toolResults = [];
  const searchTools = [
    new YouTubeSearchTool(),
    googleSearch
  ];

  for (const toolCall of toolCalls) {
    console.log(`🔍 Preparing to execute tool: ${toolCall.name} with args:`, toolCall.args);

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
    console.log("🔍 Running intelligent search with INTELLIGENT history management", state.conversationId);

    const query = updateQueryWithCurrentYear(state.currentQuery || state.query || "");

    // Handle test scenarios where conversationId might be null or we have direct context
    let conversationContext;
    let existingSummary = state.conversationSummary || null;

    if (state.conversationContext !== undefined) {
      // If conversationContext is explicitly provided (e.g., in tests), use it directly
      conversationContext = state.conversationContext;
      console.log("Using provided conversation context");
    } else if (state.conversationId) {
      // Otherwise, fetch from database if conversationId is provided
      const conversation = await Conversation.findOne({ conversationId: state.conversationId });
      conversationContext = conversation ? conversation.messages : [];
    } else {
      // No conversationId and no context provided - start fresh
      conversationContext = [];
      console.log("No conversation context available - starting fresh");
    }

    console.log("Length of conversation context:", conversationContext.length);

    conversationContext = conversationContext.filter((item, index, arr) => {
      if (index === 0) return true;
      const prev = arr[index - 1];
      return !(item.role === prev.role && item.content === prev.content);
    });
    // 🧠 INTELLIGENT HISTORY MANAGEMENT - Automatically handle token limits
    console.log(`📊 Processing conversation with ${conversationContext.length} messages`);
    const contextResult = await prepareConversationContext(conversationContext, existingSummary, query);


    // Use the intelligently managed conversation context
    const conversationHistory = contextResult.formattedContext;

    console.log(`✅ Context prepared: ${contextResult.contextTokens} tokens (managed: ${contextResult.isOptimized})`);
    if (contextResult.historyManaged) {
      console.log(`🔄 History optimized: ${contextResult.reductionPercentage}% token reduction`);
    }

    // 🎯 SMART ROUTING: Classify query to determine if it's code-related
    if (config.routing.enableSmartRouting) {
      console.log(`🎯 Smart Routing enabled - Classifying query...`);
      const classification = classifyQuery(query, conversationContext);

      console.log(`📊 Query Classification Result:`, {
        query: query.substring(0, 100),
        isCodeRelated: classification.isCodeRelated,
        confidence: classification.confidence,
        primaryCategory: classification.primaryCategory,
        matchedKeywords: classification.matchedKeywords?.slice(0, 5)
      });

      // Route to Claude if it's code-related and confidence is above threshold
      if (classification.isCodeRelated && classification.confidence >= config.routing.codeQueryThreshold) {
        console.log(`🚀 Routing to Claude Sonnet 4.5 (confidence: ${classification.confidence})`);
        console.log(`📌 Classification details:`, {
          primaryCategory: classification.primaryCategory,
          categories: classification.categories,
          reasoning: classification.reasoning
        });

        try {
          // Initialize Claude service
          const claudeService = new ClaudeService();
          await claudeService.initialize();

          // Prepare messages for Claude
          const claudeMessages = [];

          // Add conversation history if available
          if (conversationHistory && conversationHistory.length > 0) {
            claudeMessages.push({
              role: 'user',
              content: `Previous conversation context:\n${conversationHistory}\n\nCurrent question: ${query}`
            });
          } else {
            claudeMessages.push({
              role: 'user',
              content: query
            });
          }

          // Call Claude with code-optimized system prompt
          const codeSystemPrompt = `You are an expert software engineer and programming assistant. Provide clear, accurate, and well-explained code solutions.

CORE PRINCIPLES:
- Write clean, production-ready code with proper error handling
- Include detailed comments explaining complex logic
- Follow language-specific best practices and conventions
- Provide working, tested code examples
- Explain your reasoning and approach

RESPONSE FORMAT:
1. Brief explanation of the approach
2. Complete, working code with comments
3. Key points and considerations
4. Potential gotchas or edge cases

QUALITY STANDARDS:
- Code should be copy-paste ready and functional
- Use modern language features and idioms
- Consider performance and scalability
- Include type hints/annotations where applicable
- Suggest testing approaches when relevant`;

          console.log(`📤 Sending query to Claude...`);
          const startTime = Date.now();

          const claudeResponse = await claudeService.callClaude(claudeMessages, {
            system: codeSystemPrompt,
            maxTokens: config.claude.maxTokens || 4096,
            temperature: config.claude.temperature || 0.7
          });

          const duration = Date.now() - startTime;
          console.log(`✅ Claude response received in ${duration}ms`);
          console.log(`📝 Response length: ${claudeResponse.length} characters`);

          return {
            answer: claudeResponse,
            modelUsed: 'claude-sonnet-4.5',
            classification: {
              isCodeRelated: true,
              confidence: classification.confidence,
              primaryCategory: classification.primaryCategory
            },
            references: [],
            searchMethod: 'claude_direct',
            timestamp: new Date().toISOString(),
            responseTime: duration
          };

        } catch (error) {
          console.error(`❌ Error routing to Claude:`, error);
          console.log(`⚠️ Falling back to Gemini due to Claude error`);
          // Fall through to Gemini if Claude fails
        }
      } else {
        console.log(`📍 Routing to Gemini (not code-related or low confidence: ${classification.confidence})`);
        console.log(`📊 Classification: ${classification.primaryCategory} | Code-related: ${classification.isCodeRelated}`);
      }
    }

    // Get current date -1 context
    const currentDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const currentYear = currentDate.getFullYear();
    const currentDateString = currentDate.toDateString();

    const systemPrompt = `You are an intelligent research assistant that provides CONCRETE, specific answers with complete details.

CURRENT CONTEXT:
- Today's date: ${currentDateString}
- Current year: ${currentYear}

CORE PRINCIPLE: PROVIDE DIRECT, ESSENTIAL INFORMATION ONLY
- For direct questions (sports schedules, dates, times, facts), provide ONLY the essential details
- NO unnecessary context or date qualifiers like "after [current date]" or "next game after today is"
- NO vague responses like "please refer to official schedule" or "search results indicate"
- If information is incomplete, state it simply: "The exact date and time is not scheduled"
- NEVER mention "search results" or reference the search process in your answer
- State facts directly and concisely - just the core information requested

**"ANSWER ONLY" DIRECTIVE:**
When user explicitly requests "answer only" or similar phrases (e.g., "just answer", "one answer only", "short answer"):
- Provide ONLY the single most definitive answer
- NO multiple options, alternatives, or "it depends" responses
- NO explanations, context, or additional details unless absolutely necessary
- NO lists of providers or platforms - choose THE BEST one based on data
- **CRITICAL: Distinguish between different types of solutions** (e.g., databases vs data providers, tools vs platforms)
- **Understand what the user is ACTUALLY asking for** - if they ask for "data provider", don't give them a database
- Format: Single direct statement answering the question
- Examples:
  ❌ BAD: "Based on current market analysis, key providers include: Pinecone, Zyre, K2view..."
  ❌ BAD: "Pinecone provides the best real-time cryptocurrency data for AI and RAG applications." (Pinecone is a database, not a data provider)
  ✅ GOOD: "CoinGecko provides the best real-time cryptocurrency data for AI and RAG applications." (Actual data provider)

RESPONSE FORMATS (CONCISE):
- Sports/Event Schedules: MUST include date + time + opponent (e.g., "November 7, 2025 at 7:00 PM against the New York Rangers")
- **CRITICAL: Understand HOME vs AWAY games**
  - "next home game" = game at team's home venue ONLY
  - "next away game" = game at opponent's venue ONLY (usually indicated with @)
  - "next game" = closest game regardless of location
  - Always return the CLOSEST matching game after current date
- NEVER provide just a date alone - always include time and opponent for sports
- Weather: Temperature, conditions (skip verbose details unless asked)
- News/Facts: Core information without unnecessary context
- Business/Investment: Key findings and actionable insights

CONCRETE ANSWER EXAMPLES:
❌ BAD: "The next Detroit Red Wings home game after October 23, 2025, is on Friday, November 7, 2025, at 7:00 PM against the New York Rangers. The game will be broadcast on NHL Net."
❌ BAD: "October 25, 2025"
✅ GOOD: "November 7, 2025 at 7:00 PM against the New York Rangers"

❌ BAD: "The Detroit Red Wings' next home game after today's date is scheduled for October 15, 2025 at 7:30 PM against the Toronto Maple Leafs at Little Caesars Arena."
✅ GOOD: "October 15, 2025 at 7:30 PM against the Toronto Maple Leafs"

❌ BAD: "Based on the search results, today's weather in Detroit is 72°F with partly cloudy skies and a 20% chance of rain throughout the day."
✅ GOOD: "72°F, partly cloudy, 20% chance of rain"

FOR "NEXT GAME" QUERIES:
- User asks: "When is the next Detroit Red Wings home game?"
- ❌ BAD: Just the date "October 25, 2025"
- ✅ GOOD: "November 7, 2025 at 7:00 PM against the New York Rangers"
- MUST INCLUDE: date, time, AND opponent

STRUCTURED JSON FORMAT:
{
    "responseMessage": {
        "answer": "Direct answer with only essential details - no fluff or unnecessary context",
        "reference": [{
            "url": "source_url",
            "domain": "domain.com"
        }],
        "citations": [],
        "citationMetadata": null
    }
}

SEARCH STRATEGY:
- Use multiple specific search queries to find complete information
- Search for current schedules, dates, times, and specific details
- For sports: search team schedules, upcoming games, specific dates
- **IMPORTANT FOR SPORTS:** Use site-specific searches (site:nhl.com, site:espn.com) to get accurate data
- **VERIFY sports information** by running 2-3 different search queries with specific site restrictions
- Always verify information is current and accurate for ${currentDateString}
- Combine information from multiple sources for complete answers
- For sports, cross-check dates and opponents across multiple official sources before responding
- **ANALYZE SEARCH RESULTS CAREFULLY:** Distinguish between different types of solutions:
  * Data Providers (APIs that provide raw data): CoinGecko, CoinMarketCap, Binance API, Kraken API, etc.
  * Databases (storage/query systems): Pinecone, Weaviate, ChromaDB, etc.
  * Platforms (complete solutions): Zyre, K2view, etc.
  * Tools (libraries/frameworks): LangChain, LlamaIndex, etc.
  When user asks for "data provider", only mention actual data API providers, NOT databases or platforms

FORBIDDEN PHRASES:
- "after [date]" or "next game after today"
- "Search results indicate..."
- "Please refer to..."
- "Check the official..."
- "According to search results..."
- "Based on the information found..."
- "I cannot provide predictions..." or "I cannot predict..."
- "I cannot provide financial advice..."
- Any unnecessary date context or qualifiers
- Any generic refusal to answer analytical questions

REQUIRED APPROACH:
- For sports queries, ALWAYS provide: date + time + opponent (all three required)
- NEVER provide just a date by itself for sports/game queries
- If user asks "when is next game", give full details: "November 7, 2025 at 7:00 PM against the New York Rangers"
- Provide essential details concisely but completely
- NO extra context, venue, or broadcast info unless specifically asked
- Use minimal, direct language
- Include what was directly asked for plus necessary context (time + opponent for games)

For business/financial/investment questions:
- MUST use search tools to gather current market data and expert analysis
- Provide data-driven insights based on current market conditions
- Include specific metrics, trends, and expert opinions from search results
- Give balanced analysis with both opportunities and risks
- NO generic disclaimers like "I cannot provide financial advice" - instead provide informational analysis
- Present findings objectively: "Based on current market analysis..." or "According to recent data..."
- Cite all sources used in your analysis

For sports, weather, news, or factual queries, provide exact details:
- Exact dates, times, opponents for events (skip venue unless asked)
- **CRITICAL FOR SPORTS:** Always verify information using multiple searches with site-specific queries
- Use site restrictions in searches: "site:nhl.com", "site:espn.com", "site:[team website]"
- Cross-reference information from at least 2 official sources before providing the answer
- If sources conflict, state: "Sources show conflicting information" and list what each source says
- Current conditions and forecasts (concise)
- Latest updates and facts (core info only)
- If exact details are not available, state it simply: "The exact date and time is not scheduled"
- If asks for schedules, provide only the schedule data
- For sports search on espn.com, nhl.com, www.viagogo.com, team site, or trusted sports sources

TOOL USAGE - SEARCH FOR:
✅ Current sports schedules and upcoming games
✅ Specific dates, times, and opponent information
✅ Weather forecasts and current conditions
✅ News updates and current events
✅ Market data and financial information - ALWAYS search for investment/crypto queries
✅ Business trends and analysis
✅ Technology developments
✅ Any factual, time-sensitive information

FOR INVESTMENT/FINANCIAL QUERIES:
- ALWAYS use search tools to gather current market data
- Search for: price trends, technical analysis, expert opinions, market sentiment
- Provide data-driven analysis, NOT generic disclaimers
- Present information objectively: "Current market analysis shows..." or "Recent data indicates..."
- Include specific metrics, predictions, and expert viewpoints from sources
- Balance opportunities with risks using actual market data
- **MUST provide a clear conclusion that synthesizes the data into actionable insights**
- Structure: [Data & Analysis] → [Key Factors] → **[Clear Conclusion/Bottom Line]**
- Answer the user's specific question (e.g., "Should I invest?") with a direct synthesis like: "**Bottom Line:** Current data suggests [bullish/bearish/neutral] signals. Key considerations: [1-3 specific points]."
- **IF "answer only" is requested:** Provide ONLY the single best/top recommendation with no alternatives or explanations

CRITICAL: Provide minimal, direct answers with only essential details. Remove all fluff and unnecessary context.`;

    // Initial messages
    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `This is the current conversation history: ${conversationHistory}Current question: ${query}

ANALYSIS REQUIRED: For business, investment, market, or analytical questions, conduct comprehensive research using search tools to gather:
- Current market data and trends (${currentDateString})
- Technical analysis and price predictions
- Expert opinions and recent reports from credible sources
- Financial metrics and performance data
- Risk factors and market conditions
- Sentiment analysis and market indicators
- IMPORTANT: Provide data-driven analysis WITH A CLEAR CONCLUSION, NOT disclaimers. Present findings objectively.
- Format: "Based on current market analysis from [sources], Bitcoin shows [data]... **Bottom Line: [Clear actionable synthesis of whether signals are bullish/bearish/neutral and why]**"
- Structure your answer: [Current Data] → [Expert Opinions] → [Technical Analysis] → **[Clear Conclusion/Recommendation]**

FOR SPORTS PREDICTIONS/ANALYSIS (e.g., "Who has a better chance to win?" or "Who will win?"):
- NEVER refuse to answer with "I cannot provide predictions"
- ALWAYS use search tools to gather data and provide analysis
- Search for:
  1. Current team/player statistics and performance (${currentDateString})
  2. Head-to-head records and recent matchups
  3. Current form, win/loss streaks, injuries
  4. Expert predictions and betting odds from sports analysts
  5. Home/away performance if applicable
- Provide data-driven analysis based on search results
- Structure: [Current Stats] → [Recent Performance] → [Expert Analysis] → **[Assessment/Prediction]**
- Example format: "Based on current data: [Team A] has [stats/record], while [Team B] has [stats/record]. Recent matchups show [data]. Expert analysis indicates [findings]. **Assessment:** [Team A/B] appears to have the edge because [2-3 specific data points]."
- Be clear this is analysis based on data, not a guarantee: "Based on available data..." or "Analysis suggests..."
- NEVER give generic refusals - ALWAYS search and provide analytical insights

For sports/event schedules, weather, news, or factual queries, use search tools to find:
- Current sports schedules and upcoming games. Current date is ${currentDateString}.
- For sports/games: MUST provide date + time + opponent (e.g., "November 7, 2025 at 7:00 PM against the New York Rangers")
- NEVER provide just a date alone for sports queries
- **CRITICAL FOR SPORTS QUERIES:** Use MULTIPLE specific search queries to verify information:
  1. Search: "site:nhl.com [team name] schedule 2025-2026" 
  2. Search: "site:espn.com [team name] schedule October 2025"
  3. Search: "[team name] official schedule [current month] 2025"
  4. Always cross-reference results from at least 2-3 sources before providing the answer
  5. Prioritize official sources (nhl.com, espn.com, team official website)
- Exact dates, times, opponents, and venues for events
- Current weather conditions and forecasts
- Latest news updates and factual information
- Session mostly requires up-to-date information
- Session declares like 2025/2026 season, next game, upcoming events.
- **CRITICAL FOR SPORTS:** Understand what user is asking:
  - "next HOME game" = ONLY games at team's home venue (filter out @ games)
  - "next AWAY game" = ONLY games at opponent's venue (look for @ indicator)
  - "next game" = closest upcoming game (home OR away)
  - Always return the CLOSEST game that matches the criteria after ${currentDateString}
- **SEARCH QUERY CONSTRUCTION FOR SPORTS:**
  - If user asks for HOME game: Include "home" keyword in search (e.g., "site:nhl.com Detroit Red Wings home schedule")
  - If user asks for AWAY game: Include "away" or "road" keyword in search (e.g., "site:nhl.com Detroit Red Wings away schedule")
  - Use multiple searches: official site, espn.com, nhl.com/mlb.com/nba.com depending on sport
- If asked for next game or schedule, provide exact date, time, opponent when available. Also search from ${currentDateString} onwards.
- For sports search on espn.com, nhl.com, www.viagogo.com, team site, or trusted sports sources
- Search top 20 results for best info
- **VERIFY accuracy by using multiple search queries with specific site restrictions**
- **DOUBLE-CHECK venue/location to ensure HOME vs AWAY is correct before answering**
- **PARSING RESULTS:** When you see search results, actively filter:
  - HOME game request → SKIP any result with "@" symbol or opponent's venue
  - AWAY game request → ONLY include results with "@" symbol or opponent's venue
  - If multiple games found, select the CLOSEST date after ${currentDateString}

SYNTHESIS: After gathering information, synthesize it into a clear, specific answer that includes all relevant details.

For investment/financial questions:
- Present current market analysis with specific data points
- Include expert opinions and predictions from credible sources
- Discuss technical indicators, trends, and price movements
- Analyze risks and opportunities based on current data
- Provide balanced perspective using multiple sources
- NO generic disclaimers - give informational analysis instead
- **CRITICAL: Provide a CLEAR CONCLUSION/SUMMARY at the end that synthesizes all the data into actionable insights**
- Example format: "Based on current market analysis (October 2025), Bitcoin is trading at $X with analysts predicting... Key factors include... **Conclusion: The data suggests [bullish/bearish/neutral] sentiment due to [key reasons]. Consider [specific actionable insights].**"
- End with a clear "**Bottom Line:**" or "**Key Takeaway:**" section that answers the user's question directly

For analytical/business questions, provide a detailed analysis covering:
- Market trends and data points
- Competitive landscape overview
- Strategic recommendations based on findings
- Risk assessment and mitigation strategies
- Cite all sources used in your analysis

Provide a well-researched, detailed response with proper source references. Use multiple search queries if needed to build a complete analysis.`
      }
    ];
    const startTime = Date.now();
    const searchResult = await executeToolBasedConversation(messages);

    const duration = Date.now() - startTime;
    console.log(`✅ Intelligent search process completed in ${duration}ms`);
    console.log(`Search Result:`, searchResult.responseMessage);

    return {
      ...searchResult?.responseMessage
    };

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

async function executeToolBasedConversation(messages) {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const toolBasedLlm = llm.bindTools([
    new GoogleCustomSearch({ apiKey: config.google_search_api_key, googleCSEId: config.google_engine_id }),
    new WebBrowser({
      model: llm,
      embeddings: new GoogleGenerativeAIEmbeddings({
        apiKey: config.gemini_secret_key,
      }),
      textSplitter
    })
  ]);

  // Add ReAct agent instructions to the system message
  const reactSystemPrompt = `${messages[0].content}

REACT AGENT MODE - REASONING AND ACTION:
You are now operating as a ReAct (Reasoning and Action) agent. This means you should:

1. **THINK**: Reason about what information you need to answer the user's question
2. **ACT**: Use tools to gather that information
3. **OBSERVE**: Analyze the results from your tools
4. **REASON**: Decide if you have enough information or need more
5. **REPEAT**: Continue until you have sufficient information to provide a complete answer

REASONING PROCESS FOR EACH TOOL CALL:
Before using any tool, internally ask yourself:
- What specific information do I need?
- Which tool is best suited for this?
- What search query will give me the most accurate results?
- Do I need to verify this information with multiple searches?

FOR SPORTS QUERIES - CRITICAL UNDERSTANDING:
**UNDERSTAND THE USER'S SPECIFIC REQUEST:**
- "next HOME game" = game played at team's home arena (look for @ indicators or venue)
- "next AWAY game" = game played at opponent's arena
- "next game" (no qualifier) = closest upcoming game regardless of location
- HOME games are typically indicated by: team name listed first, or venue is team's home arena
- AWAY games are typically indicated by: @ symbol, or "at [opponent's venue]"

**EXAMPLE: "When is the next Detroit Red Wings home game?" (Asked on Oct 23, 2025):**
- THOUGHT: "User specifically wants HOME game. I need Detroit Red Wings schedule after Oct 23, 2025, filtering for HOME games only"
- ACTION 1: Search "site:nhl.com Detroit Red Wings home schedule 2025-2026 after October"
- OBSERVE: Look for games at Little Caesars Arena (home venue) or without @ symbol
- FILTER: Only consider games WHERE Detroit is the home team (not @ opponent)
- ACTION 2: Search "site:espn.com Detroit Red Wings home games October November 2025"
- OBSERVE: Cross-reference - ensure it's a HOME game, not away
- REASON: "Is this definitely a HOME game? Is this the CLOSEST upcoming home game after Oct 23?"
- VERIFY: Check venue or @ indicator to confirm it's at Detroit's home arena
- FINAL: Provide the CLOSEST home game with date + time + opponent

**FILTERING RULES:**
1. If user asks for "home game" - ONLY return games at team's home venue
2. If user asks for "away game" - ONLY return games at opponent's venue (with @)
3. If user asks for "next game" - return the CLOSEST upcoming game (home or away)
4. Always return the CLOSEST matching game after the current date
5. Double-check the venue/location before finalizing answer

**HOW TO IDENTIFY HOME VS AWAY GAMES IN SEARCH RESULTS:**
When analyzing search results, look for these indicators:

HOME GAME INDICATORS:
✓ NO "@" symbol before opponent name
✓ Format: "Team vs Opponent" or "Team - Opponent"
✓ Venue matches team's home arena (e.g., Little Caesars Arena for Detroit Red Wings)
✓ Listed as "HOME" in schedule
✓ Team name appears first in matchup

AWAY GAME INDICATORS:
✗ "@" symbol present (e.g., "@ New York Rangers")
✗ Format: "Team @ Opponent" or "Team at Opponent"
✗ Venue is opponent's arena (e.g., game at Madison Square Garden when it's not your team's home)
✗ Listed as "AWAY" or "ROAD" in schedule
✗ Opponent name appears first with "vs" (e.g., "Rangers vs Red Wings" = away for Red Wings)

CRITICAL: When user asks for HOME game, you MUST:
1. Search specifically for "home game" or "home schedule"
2. Parse results and REJECT any games with @ symbol
3. Verify venue matches team's home arena
4. If first result is away game, continue searching for home game
5. NEVER return an away game when user asks for home game

**FINAL VERIFICATION CHECKLIST (Before providing answer):**
For HOME game queries, ask yourself:
☐ Did I search with "home" keyword explicitly?
☐ Does the result have NO "@" symbol?
☐ Is the venue the team's home arena?
☐ Is this the CLOSEST home game after the current date?
☐ Did I verify with at least 2 sources?

For AWAY game queries, ask yourself:
☐ Did I search with "away" or "road" keyword?
☐ Does the result have "@" symbol OR opponent's venue?
☐ Is this the CLOSEST away game after the current date?
☐ Did I verify with at least 2 sources?

If ANY checkbox is NO, continue searching. Do NOT provide answer until ALL checkboxes are YES.

FOR INVESTMENT QUERIES (e.g., "Should I invest in Bitcoin?"):
- THOUGHT: "I need current price, trends, expert predictions, and risk factors"
- ACTION 1: Search for current Bitcoin price and technical analysis
- OBSERVE: Note current price and trend indicators
- ACTION 2: Search for expert predictions for late 2025
- OBSERVE: Gather price predictions and timeframes
- ACTION 3: Search for current market sentiment and risks
- OBSERVE: Understand market conditions and risks
- REASON: Can I synthesize this into a clear conclusion?
- FINAL: Provide data-driven analysis with clear bottom line

FOR SPORTS PREDICTIONS (e.g., "Who has a better chance to win the [Team A] vs [Team B] game?"):
- THOUGHT: "User wants prediction. I need current stats, recent form, head-to-head, and expert analysis"
- ACTION 1: Search "Team A vs Team B current statistics 2025 season"
- OBSERVE: Gather win/loss records, scoring averages, defensive stats
- ACTION 2: Search "Team A vs Team B head to head history recent games"
- OBSERVE: Analyze recent matchup results and patterns
- ACTION 3: Search "Team A vs Team B expert predictions betting odds"
- OBSERVE: Collect expert opinions and betting line insights
- ACTION 4: Search "Team A Team B injuries lineup news October 2025"
- OBSERVE: Check for key player injuries or absences
- REASON: "Do I have enough data to provide an informed analysis?"
- SYNTHESIZE: Compare all data points (stats, form, H2H, expert views, injuries)
- FINAL: Provide analysis with clear assessment - "Based on available data: [Team A] appears to have the edge because [specific reasons with data]"
- NEVER say "I cannot predict" - ALWAYS provide data-driven analysis

CRITICAL REASONING GUIDELINES:
- Always use MULTIPLE searches for verification, especially for sports schedules
- Use site-specific searches (site:nhl.com, site:espn.com) for authoritative sources
- If information conflicts between sources, continue searching until clarity
- Don't stop at first result - verify with 2-3 sources
- Reason about whether you have COMPLETE information before answering`;

  // Update the first message with ReAct instructions
  const reactMessages = [
    {
      role: "system",
      content: reactSystemPrompt
    },
    ...messages.slice(1)
  ];

  let currentMessages = [...reactMessages];
  let iterationCount = 0;
  const maxIterations = 8; // Increased for ReAct reasoning cycles
  let usedUrls = new Set(); // Track URLs used for references
  let reasoningLog = []; // Track reasoning steps

  while (iterationCount < maxIterations) {
    iterationCount++;
    console.log(`\n=== ReAct Agent Iteration ${iterationCount}/${maxIterations} ===`);

    const res = await toolBasedLlm.invoke(currentMessages);
    console.log("Response tool_calls:", res.tool_calls?.length || 0);

    // Log reasoning if present in the response
    if (res.content && typeof res.content === 'string' && res.content.length > 0) {
      console.log(`💭 Agent Reasoning: ${res.content.substring(0, 200)}...`);
      reasoningLog.push({
        iteration: iterationCount,
        reasoning: res.content,
        toolCalls: res.tool_calls?.length || 0
      });
    }

    // If no tool calls, we have a final answer
    if (!res.tool_calls || res.tool_calls.length === 0) {
      console.log("=== Final Answer ===");
      console.log(res.content);

      // Format the response in the requested structure
      // Limit references to 3-5 items
      const allReferences = Array.from(usedUrls).map(url => {
        try {
          const domain = new URL(url).hostname.replace('www.', '');
          return { url, domain };
        } catch {
          return { url, domain: 'unknown' };
        }
      });

      // Take only first 5 references
      const references = allReferences.slice(0, 5);

      const citations = references.map((ref, index) => ({
        index: index + 1,
        url: ref.url,
        domain: ref.domain
      }));

      // Clean the answer by removing URLs and source sections
      // Handle both string and array content (concatenate all text blocks if array)
      let cleanAnswer;
      if (typeof res.content === 'string') {
        cleanAnswer = res.content;
      } else if (Array.isArray(res.content)) {
        // Concatenate all text blocks from the array
        cleanAnswer = res.content
          .filter(block => block.type === 'text' && block.text)
          .map(block => block.text)
          .join('');
      } else {
        cleanAnswer = 'No answer provided';
      }

      // Check if the answer is already in JSON format and extract just the answer
      try {
        // Try to parse as direct JSON first
        const directJson = JSON.parse(cleanAnswer);
        if (directJson.responseMessage && directJson.responseMessage.answer) {
          cleanAnswer = directJson.responseMessage.answer;
        }
      } catch (e) {
        // Try to find JSON in code blocks
        try {
          const jsonMatch = cleanAnswer.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            const jsonContent = JSON.parse(jsonMatch[1]);
            if (jsonContent.responseMessage && jsonContent.responseMessage.answer) {
              cleanAnswer = jsonContent.responseMessage.answer;
            }
          }
        } catch (e2) {
          // If parsing fails, continue with original answer
        }
      }

      // Remove URLs from the answer
      cleanAnswer = cleanAnswer.replace(/https?:\/\/[^\s\n\r]*/g, '');

      // Remove **Sources:** section and everything after it
      cleanAnswer = cleanAnswer.replace(/\*\*Sources?\*\*:[\s\S]*$/, '');

      // Remove bullet point lists that contain URLs
      cleanAnswer = cleanAnswer.replace(/\*\s+[^\n]*https?:\/\/[^\n]*/g, '');

      // Clean up extra whitespace and newlines
      cleanAnswer = cleanAnswer.replace(/\n{3,}/g, '\n\n').trim();

      const formattedResponse = {
        responseMessage: {
          answer: cleanAnswer,
          reference: references,
          citations: citations,
          citationMetadata: null
        }
      };

      console.log("\n=== ReAct Agent Summary ===");
      console.log(`Total iterations: ${iterationCount}`);
      console.log(`Total tool calls: ${reasoningLog.reduce((sum, log) => sum + log.toolCalls, 0)}`);
      console.log(`Sources verified: ${usedUrls.size}`);
      console.log("\n=== Formatted Response ===");
      console.log(JSON.stringify(formattedResponse, null, 2));
      return formattedResponse;
    }

    // Add the assistant's message with tool calls
    currentMessages.push({
      role: "assistant",
      content: res.content,
      tool_calls: res.tool_calls
    });

    // Execute each tool call and add results
    for (const toolCall of res.tool_calls) {
      console.log(`🔧 ReAct ACTION: Executing tool: ${toolCall.name}`);
      console.log(`📝 Search Query:`, toolCall.args.input);

      try {
        // Execute the tool based on its name
        let toolResult;
        if (toolCall.name === "google-custom-search") {
          const googleSearch = new GoogleCustomSearch({
            apiKey: config.google_search_api_key,
            googleCSEId: config.google_engine_id
          });

          const startTime = Date.now();
          toolResult = await googleSearch.invoke(toolCall.args.input);
          const duration = Date.now() - startTime;

          console.log(`✅ Search completed in ${duration}ms`);

          // Extract URLs from Google search results for references
          try {
            const searchResults = JSON.parse(toolResult);
            if (Array.isArray(searchResults)) {
              console.log(`📊 ReAct OBSERVE: Found ${searchResults.length} search results`);
              searchResults.forEach(result => {
                if (result.link) {
                  usedUrls.add(result.link);
                }
              });
            }
          } catch (e) {
            // If not JSON, try to extract URLs with regex
            const urlRegex = /https?:\/\/[^\s"]+/g;
            const urls = toolResult.match(urlRegex) || [];
            console.log(`📊 ReAct OBSERVE: Extracted ${urls.length} URLs from results`);
            urls.forEach(url => usedUrls.add(url));
          }

        } else if (toolCall.name === "web-browser") {
          const browser = new WebBrowser({
            model: llm,
            embeddings: new GoogleGenerativeAIEmbeddings({
              apiKey: config.gemini_secret_key,
            }),
            textSplitter
          });
          toolResult = await browser.invoke(toolCall.args.input);

          // Extract URL from web browser input
          const urlMatch = toolCall.args.input.match(/https?:\/\/[^\s,"]+/);
          if (urlMatch) {
            usedUrls.add(urlMatch[0]);
          }
        }

        console.log(`Tool result preview:`, toolResult.substring(0, 400) + "...");

        // Add tool result to messages
        currentMessages.push({
          role: "tool",
          content: toolResult,
          tool_call_id: toolCall.id,
          name: toolCall.name
        });

      } catch (error) {
        console.error(`Error executing tool ${toolCall.name}:`, error.message);
        currentMessages.push({
          role: "tool",
          content: `Error: ${error.message}`,
          tool_call_id: toolCall.id,
          name: toolCall.name
        });
      }
    }
  }

  console.log("Max iterations reached, returning last result");

  // If we reach max iterations, still format the response
  // Limit references to 3-5 items
  const allReferences = Array.from(usedUrls).map(url => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return { url, domain };
    } catch {
      return { url, domain: 'unknown' };
    }
  });

  // Take only first 5 references
  const references = allReferences.slice(0, 5);

  const citations = references.map((ref, index) => ({
    index: index + 1,
    url: ref.url,
    domain: ref.domain
  }));

  const formattedResponse = {
    responseMessage: {
      answer: "Max iterations reached without final answer",
      reference: references,
      citations: citations,
      citationMetadata: null
    }
  };

  console.log("\n=== Formatted Response (Max Iterations) ===");
  console.log(JSON.stringify(formattedResponse, null, 2));
  return formattedResponse;
}

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
        content: `You are an intelligent research assistant that provides CONCRETE, specific answers with complete details.

CURRENT DATE: ${new Date().toDateString()} (${new Date().getFullYear()})

CORE PRINCIPLE: PROVIDE EXACT, CONCRETE ANSWERS
- For direct questions, provide SPECIFIC details (dates, times, locations, names)
- NO vague responses or references to "search results"
- State facts directly as if you know them definitively
- NEVER mention the search process in your response

CONCRETE RESPONSE RULES:
- Sports schedules: Exact date, time, opponent, venue
- Weather: Specific temperature, conditions, forecast
- Events: Complete details with all relevant information
- Facts: Direct, specific information

FORBIDDEN PHRASES:
- "Search results indicate..."
- "According to search results..."
- "Based on the information found..."
- "Please refer to official..."
- "Check the official..."

CITATION REQUIREMENTS:
- Include source attribution naturally: "According to [Source Name]..." 
- Use format: "Based on [Domain]..." for website sources
- For multiple sources: "Sources: [Source1], [Source2]" at end
- Include publication dates when available: "[Source] (2025)"

ANSWER-ONLY FORMAT:
- IF user asks for "answer only" or "no explanations": respond with just the fact, no sources
- Example: "What is the capital of France? Answer only." → "Paris."

EXAMPLES OF GOOD RESPONSES:
❌ BAD: "Search results show a game occurred. Please check the official schedule."
✅ GOOD: "The Detroit Red Wings' next home game is October 15, 2025 at 7:30 PM against the Toronto Maple Leafs at Little Caesars Arena."

❌ BAD: "Weather information indicates varying conditions."
✅ GOOD: "Detroit's weather today is 72°F with partly cloudy skies and a 20% chance of rain."

CRITICAL: Always provide complete, specific information. Never reference the search process or tell users to check elsewhere.`
      },
      {
        role: "user",
        content: `${conversationHistory}${queryContext}Current question: ${state.query}

Available information:
${formattedSearchResults}

Provide a CONCRETE, specific answer with complete details.

REQUIREMENTS:
- State the exact information requested (dates, times, locations, opponents)
- NO references to "search results" or "information found"
- Provide complete details in a natural, conversational way
- Include source attribution naturally without mentioning the search process
- For sports: exact date, time, opponent, venue
- Use current date context: ${new Date().toDateString()}

FORBIDDEN: Do not mention "search results", "information indicates", or "please refer to"

ANSWER-ONLY EXCEPTION: If user asks for "answer only", provide just the fact without sources.`
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

// OLD CONTEXT MANAGEMENT SYSTEM REMOVED - Using new intelligent system above

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

/**
 * DEDICATED CODE GENERATION ENDPOINT
 * Always uses Claude Sonnet 4.5 for code generation with optional internet search
 */
export const runCodeGeneration = async (state, stream = false) => {
  try {
    console.log("🔧 Running dedicated code generation with Claude Sonnet 4.5");

    const query = state.currentQuery || state.query || "";

    // Handle conversation context
    let conversationContext;
    let existingSummary = state.conversationSummary || null;

    if (state.conversationContext !== undefined) {
      conversationContext = state.conversationContext;
    } else if (state.conversationId) {
      const conversation = await Conversation.findOne({ conversationId: state.conversationId })
        .select('messages conversationSummary')
        .lean();
      conversationContext = conversation?.messages || [];
      existingSummary = conversation?.conversationSummary || existingSummary;
    } else {
      conversationContext = [];
    }

    console.log("Length of conversation context:", conversationContext.length);

    // Filter and prepare context
    conversationContext = conversationContext.filter((item, index, arr) => {
      if (item.role === 'user') return index === 0 || arr[index - 1]?.role !== 'user';
      return true;
    });

    // Manage conversation history
    const contextResult = await prepareConversationContext(conversationContext, existingSummary, query);
    const conversationHistory = contextResult.formattedContext;

    console.log(`✅ Context prepared: ${contextResult.contextTokens} tokens (managed: ${contextResult.isOptimized})`);

    // Get current date context
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentDateString = currentDate.toDateString();

    // System prompt for code generation with search capability
    const systemPrompt = `You are an expert code generation assistant powered by Claude Sonnet 4.5. Your primary task is to generate high-quality, production-ready code based on user requests.

CURRENT CONTEXT:
- Today's date: ${currentDateString}
- Current year: ${currentYear}

CORE PRINCIPLES FOR CODE GENERATION:
1. **GENERATE ACTUAL CODE** - Provide complete, working code implementations
2. **BEST PRACTICES** - Follow language-specific best practices and conventions
3. **DOCUMENTATION** - Include clear comments explaining complex logic
4. **ERROR HANDLING** - Implement proper error handling and validation
5. **SECURITY** - Follow security best practices (no hardcoded secrets, proper input validation)
6. **MODERN SYNTAX** - Use modern language features and up-to-date patterns

SEARCH CAPABILITY (OPTIONAL - USE ONLY WHEN NECESSARY):
You have access to web search tools (google-custom-search, web-browser). These are OPTIONAL tools.

⚠️ IMPORTANT: Only use search when you genuinely need external information. Most code generation requests can be handled directly from your knowledge base.

**When to USE search:**
- You need documentation for a very recent library/framework (released in last 6 months)
- You're unsure about current API syntax for a specific library
- The request involves bleeding-edge technologies you're not confident about
- You need to verify a specific security vulnerability or recent best practice change
- The user explicitly asks for "latest", "current", or "most recent" approaches

**When to NOT use search (generate directly):**
- Standard, well-established patterns (Express.js setup, JWT auth, etc.)
- Common frameworks and libraries (React, Node.js, Python, etc.)
- General programming concepts and algorithms
- Database queries and ORMs (MongoDB, SQL, etc.)
- Authentication patterns, REST APIs, CRUD operations
- File operations, data processing, validation logic
- Testing frameworks and patterns
- Most web development tasks with established patterns

**DEFAULT BEHAVIOR: Generate code directly without search unless you have a specific reason to search.**

RESPONSE FORMAT:
1. **Brief Introduction** (1-2 lines): State what you're creating
2. **Code Implementation**: Complete, working code with comments
3. **Usage Example**: Show how to use the code
4. **Setup Instructions** (if needed): Dependencies, environment setup
5. **Important Notes** (if relevant): Security considerations, limitations, etc.

CODE QUALITY REQUIREMENTS:
- ✅ Complete implementations (not pseudo-code)
- ✅ Proper error handling
- ✅ Input validation
- ✅ Clear variable and function names
- ✅ Inline comments for complex logic
- ✅ Follow DRY principles
- ✅ Modular and maintainable
- ✅ Production-ready (no TODOs or placeholders)

LANGUAGE-SPECIFIC GUIDELINES:
**JavaScript/Node.js:**
- Use ES6+ syntax (const/let, arrow functions, async/await)
- Proper error handling with try-catch
- Use modern libraries and frameworks
- Include JSDoc comments for functions

**Python:**
- Follow PEP 8 style guide
- Use type hints where appropriate
- Proper exception handling
- Include docstrings

**TypeScript:**
- Use proper type annotations
- Interface definitions when needed
- Generic types where appropriate

**Other Languages:**
- Follow community-standard style guides
- Use idiomatic patterns
- Modern best practices

SECURITY BEST PRACTICES:
- Never hardcode API keys, passwords, or secrets
- Use environment variables for sensitive data
- Implement input validation and sanitization
- Follow OWASP guidelines for web applications
- Use parameterized queries for databases
- Implement proper authentication and authorization

DECISION FRAMEWORK - SEARCH VS DIRECT GENERATION:

**Generate Directly (95% of cases):**
Most code requests should be handled directly without search:
- ✅ Node.js scripts (Express, authentication, APIs)
- ✅ Python scripts (data processing, automation, web scraping)
- ✅ Database operations (MongoDB, PostgreSQL, MySQL)
- ✅ Common web development patterns
- ✅ Authentication systems (JWT, OAuth, sessions)
- ✅ CRUD operations and REST APIs
- ✅ Testing code (Jest, Pytest, Mocha)
- ✅ File operations and data manipulation
- ✅ Validation and error handling
- ✅ Common algorithms and data structures

**Search Only When Necessary (5% of cases):**
- ⚠️ Very new frameworks/libraries (< 6 months old)
- ⚠️ Specific API changes you're uncertain about
- ⚠️ Emerging technologies with evolving best practices
- ⚠️ When user explicitly requests "latest" or "most recent" approach
- ⚠️ Verify specific security vulnerabilities or CVEs

**CRITICAL RULE: Default to generating code directly. Only search if you have a compelling reason.**

EXAMPLES OF GOOD RESPONSES:

User: "Write a Node.js function for JWT authentication"
✅ GOOD: Provide complete code with:
- JWT signing function
- Token verification middleware
- Error handling
- Environment variable usage
- Clear comments
- Usage example

User: "Create a Python script for data validation"
✅ GOOD: Provide complete code with:
- Validation class/functions
- Multiple validation methods
- Type hints
- Docstrings
- Usage examples
- Error handling

❌ BAD RESPONSES:
- Providing pseudo-code or incomplete implementations
- Missing error handling
- No comments or documentation
- Hardcoded sensitive values
- Outdated syntax or deprecated methods
- Generic "TODO" comments without implementation

REACT AGENT MODE - REASONING AND ACTION (SEARCH IS OPTIONAL):
You are operating as a ReAct (Reasoning and Action) agent with **optional** tool usage.

**DEFAULT APPROACH: Generate code directly from your knowledge base.**

Only if you determine that you genuinely need external information, follow this process:
1. **THINK**: "Do I truly need external information, or can I generate this from my knowledge?"
2. **ACT**: Only if absolutely necessary, use search tools
3. **OBSERVE**: Analyze the search results
4. **GENERATE**: Create the code implementation

REASONING PROCESS (Before considering search):
Ask yourself these questions:
1. ❓ Is this a well-established technology/pattern I'm familiar with? → **Generate directly**
2. ❓ Is this using standard, documented APIs? → **Generate directly**
3. ❓ Do I know the current best practices for this? → **Generate directly**
4. ❓ Is this a bleeding-edge technology I'm uncertain about? → **Consider search**
5. ❓ Did the user explicitly ask for "latest" or "most recent"? → **Consider search**

**IMPORTANT: If you answer "Generate directly" to questions 1-3, do NOT use search tools.**

TOOL USAGE - RARE CASES ONLY:
Only use search tools if ALL of these are true:
- ✅ You're genuinely uncertain about the implementation
- ✅ The technology is very recent or rapidly changing
- ✅ You need to verify a specific, recent change
- ✅ The user explicitly requested the "latest" approach

For 95% of code generation requests, generate directly without search.

Always provide the COMPLETE, WORKING implementation with proper documentation.`;

    // Prepare messages for code generation
    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `${conversationHistory}

Current request: ${query}

⚠️ IMPORTANT INSTRUCTION: Generate code directly unless you have a compelling reason to search.

DECISION PROCESS:
1. **First, assess if you can generate directly** (95% of cases - JWT auth, Express apps, Python scripts, etc.)
2. **Only search if truly necessary** (5% of cases - bleeding-edge tech, explicit "latest" requests, genuine uncertainty)

Generate high-quality, production-ready code with:
- Complete implementation (no pseudo-code)
- Proper error handling and validation
- Clear comments and documentation
- Security best practices
- Modern syntax and patterns
- Usage examples

**DEFAULT: Generate code directly. Only use search tools if you have a specific, compelling reason.**`
      }
    ];

    const startTime = Date.now();
    console.log("🚀 Starting code generation with tool-based conversation...");

    const codeResult = await executeToolBasedConversation(messages);

    const duration = Date.now() - startTime;
    console.log(`✅ Code generation process completed in ${duration}ms`);
    console.log(`Code Result:`, codeResult.responseMessage);

    return {
      ...codeResult?.responseMessage
    };

  } catch (error) {
    console.error("❌ Error in code generation:", error);

    // Fallback response
    return {
      answer: `I apologize, but I encountered an error while generating code: ${error.message}. Please try rephrasing your request or providing more specific details about what you need.`,
      reference: [],
      citations: [],
      citationMetadata: {
        error: true,
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      }
    };
  }
};
