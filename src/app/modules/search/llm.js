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
    
    // Format search results into a readable string with enhanced content and citation numbers
    let formattedSearchResults = "";
    if (Array.isArray(state.searchResults)) {
      formattedSearchResults = state.searchResults.map((result, index) => {
        // Use detailed content if available, otherwise fall back to regular content
        const content = result.detailedContent || result.content || result.snippet || 'No content available';
        const domain = result.domain || 'Unknown domain';
        const isRecent = result.isRecent ? ' (Recent)' : '';
        const publishedDate = result.publishedDate ? ` (Published: ${result.publishedDate})` : '';
        const citationIndex = index + 1;
        
        return `[${citationIndex}] ${result.title}
Domain: ${domain}${isRecent}${publishedDate}
URL: ${result.url}
Content: ${content}
Relevance Score: ${result.score?.toFixed(3) || 'N/A'}
---`;
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
        content: `You are an intelligent research assistant that provides conversational, helpful responses with proper citations.

CONTEXT AWARENESS:
- Consider the conversation history when formulating your response
- Build upon previous exchanges naturally
- Reference earlier topics when relevant

CONTENT UTILIZATION:
- You have access to detailed, high-quality content from search results
- Prioritize recent content when available (marked as "Recent")
- Use the full detailed content provided, not just titles or snippets
- Extract key insights from the comprehensive content available

RESPONSE GUIDELINES:
- Be conversational and engaging
- Provide comprehensive yet focused answers
- Use the search results as your primary information source
- If the search results don't fully address the question, acknowledge limitations
- Maintain consistency with previous conversation context
- Synthesize information from multiple sources when relevant

CITATION REQUIREMENTS:
- Place citations at the end of relevant sentences or paragraphs
- ALWAYS include a "References:" section at the end listing all sources used
- Every fact, statistic, or specific information MUST be cited

CITATION FORMAT EXAMPLE:
"The Detroit Tigers' next game is scheduled for July 30th. They are currently performing well this season with a record of 65-64.

References:
[1] MLB.com - Detroit Tigers Schedule
[2] ESPN - Detroit Tigers Stats"

IMPORTANT: You MUST cite your sources. Do not provide information without proper citations.`
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
