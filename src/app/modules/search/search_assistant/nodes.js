import { generateOneQuestionFromMultipleQuestions, runSimpleGroqTask } from "../llm.js";
import { LinkupSearchTool } from "../tools.js";

/**
 * Node: Performs a search using the Tavily tool based on the user's query.
 */
export const searchNode = async (state) => {
    console.log("--- Node: searchNode ---");
    const { query, history, depth } = state;
    const researchTool = new LinkupSearchTool({
        apiKey: process.env.LINKUP_API_KEY, // Ensure the API key is set in your environment variables
        query: query,
    });
    const updatedQuery = history ? await createLinkupQueryFromHistory(history, query) : query;

    console.log("Updated Query for Linkup Search:", updatedQuery, history);
    
    
    try {
        const searchResults = await researchTool.invoke({query: updatedQuery, depth: depth, outputType: 'searchResults'});
        console.log("Search Results:", searchResults);
        
        return { searchResults, query: updatedQuery, history: history || [] };
    } catch (error) {
        console.error("Error in searchNode:", error);
        return { searchResults: "Error: Failed to perform the search." };
    }
};

export const convertTheSearchResultsToGenerativeAnswerUsingAI = async (state) => {
    console.log("--- Node: convertTheSearchResultsToGenerativeAnswerUsingAI ---");
    try {
        const response = await runSimpleGroqTask(state, true);
        // console.log("Synthesized Answer:", response);
        // Check if the response has <think> tags. Remove all text between <think> and </think> tags.
        let finalResponse = response;
        if (response.includes("<think>")) {
            console.log("Response contains <think> tags. Removing them...");
            const regex = /<think>.*?<\/think>/g;
            finalResponse = response.replace(/<think>[\s\S]*?<\/think>/, '').trim();
        }

        //If finalResponse is json, parse it or return it as is
        console.log("Synthesized Answer after removing <think> tags:", finalResponse);
        
        return { answer: finalResponse };
    } catch (error) {
        console.error("Error in convertTheSearchResultsToGenerativeAnswerUsingAI:", error);
        return "Error: Failed to synthesize the search results.";
    }
}

export const convertFollowUpSearchQueryByAi = async (state) => {
    console.log("--- Node: convertFollowUpSearchQueryByAi ---");
    const { query, history } = state;
    try {
        const followUpQuery = createLinkupQueryFromHistory(history, query);
        return { followUpQuery };
    } catch (error) {
        console.error("Error in convertFollowUpSearchQueryByAi:", error);
        return "Error: Failed to convert follow-up search query.";
    }
}


const createLinkupQueryFromHistory = async(history, query) => {
  //Filter out the user's query from the history
  const userQuery = history.filter(h => h.role === 'user').map(h => h
.content).join('\n');
  const updatedQuery = `Search for: "${userQuery}\n ${query}"`;
  const singleQuery = await generateOneQuestionFromMultipleQuestions(history.map(h => h.content));
  console.log("Single Query from History:", singleQuery);
  return updatedQuery;
}