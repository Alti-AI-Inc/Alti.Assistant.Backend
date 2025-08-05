import { composioService } from "./composio.service.js";

const composioInitiateController = async (req, res) => {
  const { auth_config_id, user_id } = req.body;

  try {
    const connectionUrl = await composioService.initiateComposioAuth({
      auth_config_id,
      user_id
    });
    res.status(200).json({ connectionUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to initiate authentication' });
  }
};

const composioWaitForConnectionController = async (req, res) => {
  const { connected_account_id } = req.body;

  try {
    const connection = await composioService.waitForConnection(connected_account_id);
    res.status(200).json({ connection });
  } catch (error) {
    res.status(500).json({ error: 'Failed to establish connection' });
  }
};

export const composioController = {
  composioInitiateController,
  composioWaitForConnectionController
};