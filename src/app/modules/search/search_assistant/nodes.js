import { runSimpleGroqTask } from "../llm.js";
import { LinkupSearchTool } from "../tools.js";

/**
 * Node: Performs a search using the Tavily tool based on the user's query.
 */
export const searchNode = async (state) => {
    console.log("--- Node: searchNode ---");
    const { query, history } = state;
    const researchTool = new LinkupSearchTool({
        apiKey: process.env.LINKUP_API_KEY, // Ensure the API key is set in your environment variables
        query: query,
    });
    const updatedQuery = history ? createLinkupQueryFromHistory(history, query) : query;

    console.log("Updated Query for Linkup Search:", updatedQuery, history);
    
    
    try {
        const searchResults = await researchTool.invoke({query: updatedQuery, depth: 'standard', outputType: 'searchResults'});
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
        console.log("Synthesized Answer after removing <think> tags:", finalResponse);
        
        return { answer: finalResponse };
    } catch (error) {
        console.error("Error in convertTheSearchResultsToGenerativeAnswerUsingAI:", error);
        return "Error: Failed to synthesize the search results.";
    }
}


const createLinkupQueryFromHistory = (history, query) => {
  //Filter out the user's query from the history
  const userQuery = history.filter(h => h.role === 'user').map(h => h
.content).join('\n');
  const updatedQuery = `Search for: "${userQuery}\n ${query}"`;
  return updatedQuery;
}