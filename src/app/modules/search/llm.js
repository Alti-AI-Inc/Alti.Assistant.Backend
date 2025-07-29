import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import config from "../../../../config/index.js";

const llm = new ChatGroq({
  model: "qwen/qwen3-32b",
  apiKey: config.groq_api_key,
  temperature: 0,
  maxTokens: undefined,
  maxRetries: 2,
  // other params...
});

export const runSimpleGroqTask = async (state, stream = false) => {
  try {
    console.log("Running Groq task with search results:", state.searchResults);
    
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
    
    const messages = [
      {
        role: "system",
        content: `You are an expert research assistant. Your task is to synthesize the provided search results into a comprehensive, well-written answer for the user's query.
- Do not add any additional information or commentary.
- Write only the summary of the search results in a concise manner.
- Do not say "I am an AI language model" or similar phrases.
- Do not mention you are synthesizing search results.
- Do not mention you are actually summarizing search results.
- I want only the answer from the search results.
- Do not just list the search results. Weave them together into a coherent narrative.
- If the search results contain JSON data, parse and interpret it naturally.
`,  
      }, 
      {
        role: "user",
        content: `Based on these search results, provide a comprehensive answer:

${formattedSearchResults}`,
      },
    ]
    const response = await llm.invoke(messages);
    return response.content;
  } catch (error) {
    console.error("Error calling Groq API:", error);
    return "Sorry, I encountered an error while processing your request with the coding model. Please try again.";
  }
}

export const runGroqTask = async (systemPrompt, messages, stream = false) => {
  try {
    // Convert messages to proper LangChain message format
    const formattedMessages = [
      new SystemMessage(systemPrompt),
      ...messages.map(msg => {
        if (msg.role === "user" || msg.role === "human") {
          return new HumanMessage(msg.content);
        } else if (msg.role === "assistant" || msg.role === "ai") {
          return new SystemMessage(msg.content); // or AIMessage if available
        } else {
          return new HumanMessage(msg.content); // fallback
        }
      })
    ];

    if (stream) {
      const response = await llm.stream(formattedMessages);
      console.log("Streaming response from Groq API...", response);
      return response; // Return the stream object directly
    } else {
      const response = await llm.invoke(formattedMessages);
      return response.content;
    }
  } catch (error) {
    console.error("Error calling Groq API:", error);
    return "Sorry, I encountered an error while processing your request with the coding model. Please try again.";
  }
}

export const generateOneQuestionFromMultipleQuestions = async (questions) => {
  try {
    const systemPrompt = `You are an expert AI assistant. Your task is to generate a single, 
    last question is the most recent and follow up questions of the user.
    so focus on the last question and generate a single,
    i.e: "How can I improve my coding skills?" and "What are the best resources for learning Python?" should become "What are the best resources for learning Python to improve my coding skills?".
    or "Who won the 2022 FIFA World Cup?" and "Who were the top scorers?" should become "Who were the top scorers in the 2022 FIFA World Cup?".
    concise question that captures the essence of the provided multiple questions. 
    The generated question should be clear, focused, and relevant to the context of the input questions.`;
    
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Here are the multiple questions:\n${questions.join("\n")}\n\nPlease generate a single question that encompasses the essence of these questions.`
      }
    ]

    const response = await llm.invoke(messages);
    return response.content;

    
  } catch (error) {
    console.error("Error generating question from multiple questions:", error);
    return "Sorry, I encountered an error while processing your request. Please try again.";
  }
}

export const checkIfSearchNeededForTheQueryUsingAi = async (query) => {
  try {
    const systemPrompt = `You are a query classifier.

Your job is to decide if a user query needs an EXTERNAL SEARCH or can be ANSWERED DIRECTLY.

RULES:
- If the query is time-sensitive, about real-time data, news, prices, current events, or anything likely to change, respond ONLY with "SEARCH".
- If the query is general knowledge, common facts, definitions, or something an AI model can answer without new information, respond ONLY with "ANSWER".
- NEVER explain your choice. NEVER add extra words.

Examples:
- "What is the capital of France?" → ANSWER
- "What is the weather in Dhaka right now?" → SEARCH
- "Who won the FIFA World Cup 2018?" → ANSWER
- "Who won the FIFA World Cup this year?" → SEARCH
- "What is quantum computing?" → ANSWER
- "Show me today’s stock price of Tesla" → SEARCH
`;

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Does this query require a search? "${query}"`
      }
    ]

    const response = await llm.invoke(messages);
    console.log("AI response for search necessity:", 'search', response.content.toLowerCase());
    return response.content;
    
  } catch (error) {
    console.error("Error checking if search is needed:", error);
    return false;
  }
} 

export const giveAnswerWithoutSearch = async (query) => {
  try {
    const systemPrompt = `You are an expert AI assistant. Your task is to provide a direct answer to the user's query without performing a search.
    The query is: "${query}"`;

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Please provide an answer to the following query without searching: "${query}"`
      }
    ]

    const response = await llm.invoke(messages);
    return response.content;

  } catch (error) {
    console.error("Error giving answer without search:", error);
    return "Sorry, I encountered an error while processing your request. Please try again.";
  }
}