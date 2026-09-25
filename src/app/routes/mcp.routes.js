import { Router } from 'express';
import { AphuraMCPServer } from '../modules/mcp/aphura.mcp.js';
import { logger } from '../../shared/logger.js';

export const mcpRouter = Router();

mcpRouter.post('/v1/mcp', async (req, res) => {
  try {
    const response = await AphuraMCPServer.handleJsonRpc(req.body);
    res.status(200).json(response);
  } catch (err) {
    logger.error(`[MCP Route] Error handling MCP JSON-RPC: ${err.message}`);
    res.status(500).json({ jsonrpc: "2.0", id: req.body?.id, error: { code: -32000, message: err.message } });
  }
});
