import { mcpToolboxService } from './mcp_toolbox.service.js';

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

export const mcpToolboxController = {
  connectController,
  queryController,
  disconnectController,
  statusController,
};
