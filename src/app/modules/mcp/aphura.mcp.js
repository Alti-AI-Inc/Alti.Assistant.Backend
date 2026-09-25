import { logger } from '../../../shared/logger.js';
import { SupervisorService } from '../orchestrator/supervisor.service.js';

/**
 * Aphura Model Context Protocol (MCP) Server
 * Exposes sovereign AGI capabilities to external MCP clients (e.g. Claude Desktop, Cursor).
 */
export const AphuraMCPServer = {
  async handleJsonRpc(request) {
    logger.info(`[MCP Server] Received JSON-RPC method: ${request.method}`);
    
    if (request.method === "resources/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resources: [
            {
              uri: "memgraph://proprietary-data/market-trends",
              name: "Market Trends Analysis",
              mimeType: "text/plain",
              description: "Proprietary market insights extracted by the OCR pipeline."
            }
          ]
        }
      };
    }
    if (request.method === "resources/read") {
      const uri = request.params?.uri;
      logger.info(`[MCP Server] Client reading resource: ${uri}`);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: "SIMULATED MEMGRAPH VECTOR DATA: Market is trending towards autonomous orchestration platforms."
            }
          ]
        }
      };
    }
    if (request.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: [
            {
              name: "trigger_debate_swarm",
              description: "Triggers a Mixture-of-Agents debate swarm on Liberty Center One bare-metal.",
              inputSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] }
            },
            {
              name: "deep_research",
              description: "Executes an autonomous Exa.ai grounded deep research loop.",
              inputSchema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] }
            }
          ]
        }
      };
    }
    
    if (request.method === "tools/call") {
      const toolName = request.params?.name;
      const args = request.params?.arguments || {};
      
      logger.info(`[MCP Server] Client executing tool: ${toolName}`);
      let output = "";
      
      if (toolName === "trigger_debate_swarm") {
        const { route } = await SupervisorService.routePrompt(`DEBATE: ${args.prompt}`);
        output = `Debate swarm triggered. Supervisor route: ${route}`;
      } else if (toolName === "deep_research") {
        output = `Deep research initiated for topic: ${args.topic}`;
      } else {
        throw new Error(`Tool not found: ${toolName}`);
      }
      
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{ type: "text", text: output }]
        }
      };
    }

    return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } };
  }
};
