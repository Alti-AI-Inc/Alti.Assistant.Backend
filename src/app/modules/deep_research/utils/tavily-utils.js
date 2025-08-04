import { tavily } from "@tavily/core";
import { StructuredTool } from "@langchain/core/tools";

export class TavilySearchTool extends StructuredTool {
    name = "tavily_search";
    description = "Search the web using Tavily API for real-time information";

    constructor(options = {}) {
        super();
        this.apiKey = options.apiKey || process.env.TAVILY_API_KEY;
        this.maxResults = options.maxResults || 10;
        
        if (!this.apiKey) {
            throw new Error("Tavily API key is required");
        }
        
        this.client = tavily({ apiKey: this.apiKey });
    }

    async invoke(params) {
        const {
            query,
            searchDepth = "basic",
            includeAnswer = true,
            includeImages = false,
            includeDomains = [],
            excludeDomains = []
        } = params;

        try {
            console.log(`Searching with Tavily: "${query}"`);
            
            const searchParams = {
                search_depth: searchDepth,
                include_answer: includeAnswer,
                include_images: includeImages,
                max_results: this.maxResults
            };

            // Add domain filters if provided
            if (includeDomains.length > 0) {
                searchParams.include_domains = includeDomains;
            }
            
            if (excludeDomains.length > 0) {
                searchParams.exclude_domains = excludeDomains;
            }

            const results = await this.client.search(query, searchParams);
            
            console.log(`Tavily search completed: ${results.results?.length || 0} results found`);
            
            return {
                query,
                answer: results.answer || null,
                results: results.results || [],
                search_metadata: {
                    search_depth: searchDepth,
                    total_results: results.results?.length || 0,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error("Tavily Search Error:", error);
            throw new Error(`Failed to search with Tavily: ${error.message}`);
        }
    }

    async call(params) {
        return this.invoke(params);
    }
}
