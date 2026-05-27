import { mcpToolboxService } from './mcp_toolbox.service.js';
import { mcpOrchestratorService } from './mcp_orchestrator.service.js';

// ==========================================
// A. Legacy Database MCP Toolbox Endpoints
// ==========================================

const connectController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { connectionDetails, customTools } = req.body;

    if (!connectionDetails || !connectionDetails.type) {
      return res.status(400).json({
        success: false,
        error: 'connectionDetails with type (e.g. postgres, bigquery) is required.',
      });
    }

    const result = await mcpToolboxService.startMcpServer(userId, connectionDetails, customTools || []);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const queryController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: 'query prompt is required.' });
    }

    const result = await mcpToolboxService.querySecureDatabase(userId, query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const disconnectController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await mcpToolboxService.stopMcpServer(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const statusController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = mcpToolboxService.getStatus(userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// B. New Universal Multi-Server Endpoints
// ==========================================

const connectServerController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { serverId } = req.body;

    if (!serverId) {
      return res.status(400).json({ success: false, error: 'serverId is required.' });
    }

    const result = await mcpOrchestratorService.startServer(userId, serverId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const stopServerController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { serverId } = req.body;

    if (!serverId) {
      return res.status(400).json({ success: false, error: 'serverId is required.' });
    }

    const result = await mcpOrchestratorService.stopServer(userId, serverId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const listToolsController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { serverId } = req.params;

    if (!serverId) {
      return res.status(400).json({ success: false, error: 'serverId parameter is required.' });
    }

    const userServers = mcpOrchestratorService.getUserServers(userId);
    const active = userServers.get(serverId);

    if (!active) {
      return res.status(404).json({ success: false, error: `MCP Server "${serverId}" is not active.` });
    }

    res.status(200).json({
      success: true,
      tools: active.tools
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const callToolController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { serverId, toolName, arguments: toolArgs } = req.body;

    if (!serverId || !toolName) {
      return res.status(400).json({ success: false, error: 'serverId and toolName are required.' });
    }

    const result = await mcpOrchestratorService.callTool(userId, serverId, toolName, toolArgs || {});
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const dashboardStatusController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const status = mcpOrchestratorService.getDashboardStatus(userId);
    res.status(200).json({ success: true, servers: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Server-Sent Events (SSE) dynamic connection bridge
 * Exposes full compatibility with SSE-based web transports
 */
const sseConnectionHandler = (req, res) => {
  const userId = req.user?.userId || req.user?.id || 'default_user';
  const serverId = req.query.serverId;

  if (!serverId) {
    return res.status(400).json({ success: false, error: 'serverId parameter is required for SSE transport.' });
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const userServers = mcpOrchestratorService.getUserServers(userId);
  const server = userServers.get(serverId);

  if (!server || !server.process) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Server is not running.' })}\n\n`);
    return res.end();
  }

  res.write(`event: endpoint\ndata: ${JSON.stringify({ message: 'SSE Connection Established.' })}\n\n`);

  // Handle standard stdout redirects straight into the open EventStream channel
  const onData = (data) => {
    res.write(`event: message\ndata: ${data.toString()}\n\n`);
  };

  server.process.stdout.on('data', onData);

  req.on('close', () => {
    if (server.process) {
      server.process.stdout.off('data', onData);
    }
  });
};

/**
 * Handles REST/HTTP Message Delivery directly to standard stdin streams
 */
const mcpMessageHandler = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { serverId, message } = req.body;

    if (!serverId || !message) {
      return res.status(400).json({ success: false, error: 'serverId and message payload are required.' });
    }

    const userServers = mcpOrchestratorService.getUserServers(userId);
    const server = userServers.get(serverId);

    if (!server || !server.initialized) {
      return res.status(404).json({ success: false, error: `MCP Server "${serverId}" is not running.` });
    }

    // Direct JSON-RPC delivery over stdio
    const response = await server.sendRequest(message.method, message.params || {});
    res.status(200).json({
      jsonrpc: '2.0',
      result: response,
      id: message.id
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const registerServerController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { serverId, serverConfig } = req.body;

    if (!serverId || !serverConfig) {
      return res.status(400).json({ success: false, error: 'serverId and serverConfig details are required.' });
    }

    const result = await mcpOrchestratorService.registerServer(userId, serverId, serverConfig);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const listUnifiedToolsController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const tools = await mcpOrchestratorService.getUnifiedTools(userId);
    res.status(200).json({ success: true, tools });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const callUnifiedToolController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { toolName, arguments: toolArgs } = req.body;

    if (!toolName) {
      return res.status(400).json({ success: false, error: 'toolName is required.' });
    }

    const result = await mcpOrchestratorService.callUnifiedTool(userId, toolName, toolArgs || {});
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const mcpToolboxController = {
  // Legacy
  connectController,
  queryController,
  disconnectController,
  statusController,
  // New Universal
  connectServerController,
  stopServerController,
  listToolsController,
  callToolController,
  dashboardStatusController,
  sseConnectionHandler,
  mcpMessageHandler,
  // Gateway & Registration
  registerServerController,
  listUnifiedToolsController,
  callUnifiedToolController
};
