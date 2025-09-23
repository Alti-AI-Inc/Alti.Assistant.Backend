import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import config from "../../../../config/index.js";

const llm = new ChatGroq({
  model: "deepseek-r1-distill-llama-70b",
  apiKey: config.groq_api_key,
  temperature: 0,
  maxTokens: undefined,
  maxRetries: 2,
  // other params...
});

/**
 * Helper function to update queries with current year for time-sensitive searches
 */
const updateQueryWithCurrentYear = (query) => {
  const currentYear = new Date().getFullYear();
  const previousYears = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4, currentYear - 5];

  let updatedQuery = query;

  // Replace previous years with current year in common contexts
  previousYears.forEach(year => {
    // Match year patterns that are likely outdated
    const patterns = [
      new RegExp(`\\b${year}\\b(?=\\s*(game|schedule|season|event|news|latest|upcoming))`, 'gi'),
      new RegExp(`\\b(schedule|game|season|event|news|latest|upcoming)\\s+${year}\\b`, 'gi'),
      new RegExp(`\\b${year}\\s+(schedule|game|season|event|news|latest|upcoming)\\b`, 'gi')
    ];

    patterns.forEach(pattern => {
      updatedQuery = updatedQuery.replace(pattern, (match) => {
        return match.replace(year.toString(), currentYear.toString());
      });
    });
  });

  return updatedQuery;
};

export const runSimpleGroqTask = async (state, stream = false) => {
  try {
    console.log("Running conversational Groq task with search results:", state.searchResults);

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
        content: `You are an intelligent research assistant that provides conversational, helpful responses.

CONTEXT AWARENESS:
- Consider the conversation history when formulating your response
- Build upon previous exchanges naturally
- Reference earlier topics when relevant

CONTENT UTILIZATION:
- You have access to detailed, high-quality content from both web search and YouTube video results
- Prioritize recent content when available (marked as "Recent")
- Use the full detailed content provided, not just titles or snippets
- Extract key insights from the comprehensive content available
- YouTube videos (marked with 🎥) provide visual/audio content - mention when video format adds value

RESPONSE GUIDELINES:
- Be conversational and engaging
- Provide comprehensive yet focused answers
- Use the search results as your primary information source
- If the search results don't fully address the question, acknowledge limitations
- Maintain consistency with previous conversation context
- Synthesize information from multiple sources when relevant
- When referencing YouTube videos, mention that they provide visual demonstrations or detailed explanations
- Provide clean, readable responses without citation numbers or reference sections

IMPORTANT: Focus on delivering clear, informative content without citations or numbered references.`
      },
      {
        role: "user",
        content: `${conversationHistory}${queryContext}Current question: ${state.query}

Search results:
${formattedSearchResults}

Please provide a conversational, well-researched response based on the search results and conversation context.`
      }
    ];

    if (stream) {
      // For streaming responses
      const streamResponse = await llm.stream(messages);
      return streamResponse;
    } else {
      // For regular responses
      const response = await llm.invoke(messages);
      console.log("Groq response received");
      return response.content;
    }

  } catch (error) {
    console.error("Error in runSimpleGroqTask:", error);
    return "I encountered an error while processing your request. Please try again.";
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

    return finalDecision.includes("RELEVANT");

  } catch (error) {
    console.error("Error checking YouTube relevance:", error);
    return false; // Default to no YouTube search on error
  }
};

/**
 * Performs YouTube search using YouTube Data API v3
 */
export const searchYouTube = async (query, maxResults = 5) => {
  try {
    const youtubeApiKey = config.youtube_api_key

    if (!youtubeApiKey) {
      console.warn("YouTube API key not configured, skipping YouTube search");
      return [];
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search`;
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: maxResults.toString(),
      order: 'relevance',
      key: youtubeApiKey,
      safeSearch: 'moderate',
      relevanceLanguage: 'en'
    });

    console.log(`Searching YouTube for: "${query}"`);

    const response = await fetch(`${searchUrl}?${params}`);

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
