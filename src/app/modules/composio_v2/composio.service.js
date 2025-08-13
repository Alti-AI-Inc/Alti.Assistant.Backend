import { Composio } from "@composio/core";
import config from "../../../../config/index.js";
import ComposionAuth from './composio.model.js'
import AuthConfig from "./authConfig.model.js";

const composio = new Composio({
  apiKey: config.composio.orgApiKey,
})

const initiateComposioAuth = async (body) => {
  const { app_name, user_id } = body;

  try {

    const auth_config = await AuthConfig.findOne({ app: app_name });
    console.log(`Found Auth Config for app ${app_name}:`, auth_config);

    const auth_config_id = auth_config ? auth_config.authConfigId : null;

    const connectionUrl = await composio.connectedAccounts.initiate(
      user_id,
      auth_config_id
    );
    // await connectionUrl.waitForConnection();
    const composioAuth = new ComposionAuth({
      userId: user_id,
      authConfigId: auth_config_id,
      connectedAccountId: connectionUrl.id,
      status: 'pending',
      integrationId: connectionUrl.integrationId,
      redirectUrl: connectionUrl.redirectUrl,
      toolkit: {}
    })
    await composioAuth.save();
    console.log('Composio connection initiated successfully', connectionUrl);
    return { connectionUrl };
  } catch (error) {
    console.error('Error initiating Composio auth:', error);
    throw new Error('Failed to initiate authentication');
  }
};

const waitForConnection = async (connectedAccountId) => {
  try {
    const connection = await composio.connectedAccounts.waitForConnection(connectedAccountId);
    console.log('Composio connection established successfully', connection);
    await ComposionAuth.updateOne(
      { connectedAccountId: connectedAccountId },
      { status: connection.data.status, accessToken: connection.data.accessToken, refreshToken: connection.data.refreshToken, idToken: connection.data.idToken, toolkit: connection.toolkit },
      { upsert: true }
    );
    // Return the connection details
    return { connection };
  } catch (error) {
    console.error('Error waiting for Composio connection:', error);
    throw new Error('Failed to establish connection');
  }
};

export const composioService = {
  initiateComposioAuth,
  waitForConnection
};