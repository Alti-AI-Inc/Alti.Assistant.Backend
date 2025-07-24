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
    const messages = [
      {
        role: "system",
        content: `You are an expert research assistant. Your task is to synthesize the provided search results into a comprehensive, well-written answer for the user's query.
- Do not add any additional information or commentary.
- Write only the summary of the search results in a concise manner.
- Do not say "I am an AI language model" or similar phrases.
- Do not mention you are synthesizing search results.
- Do not mention you are actually summarizing search results.
- Just do summarization. Do not mention you are checking the sources. At the end of your answer, provide a "Sources" section listing the URLs corresponding to your citations.
- I want only the answer from the search results.
- Do not just list the search results. Weave them together into a coherent narrative.
- At the end of your answer, provide a "Sources" section listing the URLs corresponding to your citations
- Provide the result as an object with {answer: "Your synthesized answer here", reference: "Your reference url here"}. Do not include any other text or formatting.
`,
      }, 
      {
        role: "user",
        content: `state.searchResults: ${state.searchResults}\n\nQuery: ${state.query}`,
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