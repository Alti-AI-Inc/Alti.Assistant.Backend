import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { LinkupClient } from 'linkup-sdk'; // Adjust to actual SDK import
import { StructuredTool } from '@langchain/core/tools';
import { tavily } from '@tavily/core';

export class LinkupSearchTool extends StructuredTool {
  name = 'linkup_search';
  description = 'Search data using Linkup SDK';

  async call({ query, depth }) {
    try {
      const client = new LinkupClient({
        apiKey: '6c4aee2e-6b7e-4e2d-a55d-e61241db2c94',
      }); // Adjust if SDK requires different initialization

      const result = await client.search({
        query: query,
        depth: depth,
        outputType: 'searchResults',
      }); // Adjust if SDK method differs
      return JSON.stringify(result, null, 2);
    } catch (error) {
      console.error('LinkupSearchTool Error:', error);
      return 'Failed to get results from Linkup.';
    }
  }
}

export class TavilySearchTool extends StructuredTool {
  name = 'tavily_search';
  description = 'Search the web using Tavily AI search engine';

  constructor({ apiKey }) {
    super();
    this.apiKey = apiKey;
    this.client = new tavily({ apiKey: this.apiKey });
  }

  async call({ query, depth = 'standard' }) {
    try {
      // Map depth parameter to numResults for Tavily
      let numResults = 5; // default
      if (depth === 'deep') {
        numResults = 10;
      } else if (depth === 'standard') {
        numResults = 5;
      }

      const response = await this.client.search({
        query,
        search_depth: 'basic', // OR "advanced"
        include_answer: true,
      });

      // Extract results safely
      const searchResults = response.results || [];

      const formattedResults = {
        answer: response.answer || null,
        results: searchResults.map((result, index) => ({
          title: result.title,
          url: result.url,
          content: result.content,
          score: result.score || index + 1,
        })),
        query,
        numResults: searchResults.length,
      };

      return JSON.stringify(formattedResults, null, 2);
    } catch (error) {
      console.error('TavilySearchTool Error:', error);
      return 'Failed to get results from Tavily.';
    }
  }
}
