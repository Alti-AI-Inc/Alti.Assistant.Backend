import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { LinkupClient } from "linkup-sdk"; // Adjust to actual SDK import
import { StructuredTool } from "@langchain/core/tools";

export class LinkupSearchTool extends StructuredTool {
  name = "linkup_search";
  description = "Search data using Linkup SDK";

  async call({query, depth}){
    try {
      const client = new LinkupClient({ apiKey: '6c4aee2e-6b7e-4e2d-a55d-e61241db2c94' }); // Adjust if SDK requires different initialization
      
      const result = await client.search({
        query: query,
        depth: depth,
        outputType: 'searchResults',
      }); // Adjust if SDK method differs
      return JSON.stringify(result, null, 2);
    } catch (error) {
      console.error("LinkupSearchTool Error:", error);
      return "Failed to get results from Linkup.";
    }
  }
}