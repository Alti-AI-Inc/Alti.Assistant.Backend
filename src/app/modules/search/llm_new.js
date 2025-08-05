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

export const runSimpleGroqTask = async (state, stream = false) => {
  try {
    console.log("Running conversational Groq task with search results:", state.searchResults);
    
    // Format search results into a readable string
    let formattedSearchResults = "";
    if (Array.isArray(state.searchResults)) {
      formattedSearchResults = state.searchResults.map((result, index) => {
        return `Source ${index + 1}:
Title: ${result.title}
URL: ${result.url}
Content: ${result.content}
Score: ${result.score}
---`;
      }).join('\n\n');
    } else {
      formattedSearchResults = JSON.stringify(state.searchResults, null, 2);
    }

    // Build conversation context from message history
    let conversationHistory = "";
    if (state.conversationContext && state.conversationContext.length > 0) {
      // Show last 5 messages for context
      const recentMessages = state.conversationContext.slice(-5);
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

RESPONSE GUIDELINES:
- Be conversational and engaging
- Provide comprehensive yet focused answers
- Use the search results as your primary information source
- Include relevant citations with [1], [2], etc.
- If the search results don't fully address the question, acknowledge limitations
- Maintain consistency with previous conversation context

FORMAT:
- Write in a natural, conversational tone
- Structure information clearly with paragraphs
- End with citations: [1] URL, [2] URL, etc.
- Don't be overly formal or robotic`
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

    const messages = [
      {
        role: "system",
        content: `You are a query optimization specialist. Your task is to improve search queries based on:
1. The original user question
2. Conversation context
3. Initial search results quality

OPTIMIZATION RULES:
- If results are relevant and comprehensive, keep the query simple
- If results are too broad, add specific keywords or constraints
- If results miss the user's intent, rephrase to capture the core need
- Consider conversation context to understand what the user really wants
- Make the query more specific if initial results are off-topic

Output ONLY the improved search query, nothing else.`
      },
      {
        role: "user",
        content: `${contextHistory}Original query: "${query}"

Current search results:
${formattedResults}

Generate an improved search query:`
      }
    ];

    const response = await llm.invoke(messages);
    return response.content.trim();
    
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

    const systemPrompt = `You are an intelligent query classifier with conversational awareness.

Your job is to decide if a user query needs an EXTERNAL SEARCH or can be ANSWERED DIRECTLY based on:
1. The query content
2. The conversation context
3. Whether recent information is required

CLASSIFICATION RULES:
- SEARCH: Time-sensitive data, current events, news, prices, recent developments, specific real-time information
- SEARCH: Follow-up questions that reference "latest", "recent", "current", "today", "now"
- SEARCH: Queries about ongoing events, trending topics, or changing information
- ANSWER: General knowledge, historical facts, definitions, explanations, calculations
- ANSWER: Follow-up clarifications about previously discussed topics
- ANSWER: Conversational responses, greetings, acknowledgments

CONVERSATIONAL AWARENESS:
- Consider if the query is continuing a previous topic
- If previous context provides sufficient information, lean toward ANSWER
- If query introduces new time-sensitive elements, choose SEARCH

RESPONSE FORMAT: Respond with ONLY "SEARCH" or "ANSWER" - no explanations.`;

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
    const classification = response.content.trim().toUpperCase();
    console.log("AI classification for query:", query, "→", classification);
    
    return classification === "SEARCH" ? "SEARCH" : "ANSWER";
    
  } catch (error) {
    console.error("Error checking if search is needed:", error);
    return "ANSWER"; // Default to direct answer on error
  }
};

export const giveAnswerWithoutSearch = async (query, conversationContext = []) => {
  try {
    // Build conversation context
    let conversationHistory = "";
    if (conversationContext && conversationContext.length > 0) {
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
