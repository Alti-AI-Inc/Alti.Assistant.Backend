import { OpenAIToolSet } from 'composio-core';
import config from '../../../../config/index.js';
import {
    gmailIntegrationId,
    githubIntegrationId,
    calendarIntegrationId,
    twitterIntegrationId,
    youtubeIntegrationId,
    slackIntegrationId,
    googlemeetIntegrationId,
    notionIntegrationId,
    linkedInIntegrationId,
} from './composio.constant.js';

const toolset = new OpenAIToolSet({ apiKey: config.composio.apiKey });

/**
 * Maps frontend 'app_name' to backend Integration ID
 */
const getIntegrationId = (appName) => {
    const map = {
        'gmail': gmailIntegrationId,
        'github': githubIntegrationId,
        'google-calendar': calendarIntegrationId,
        'twitter': twitterIntegrationId,
        'youtube': youtubeIntegrationId,
        'slack': slackIntegrationId,
        'google-meet': googlemeetIntegrationId,
        'notion': notionIntegrationId,
        'linkedin': linkedInIntegrationId,
    };
    return map[appName] || null;
};

/**
 * Initiates a connection for a specific user and app.
 */
const initiateConnection = async (appName, userId, redirectUrl) => {
    const integrationId = getIntegrationId(appName);
    if (!integrationId) {
        throw new Error(`Integration ID not found for app: ${appName}`);
    }

    // Use the userId as the entityId for multi-tenancy
    const entityId = userId.toString();

    const connectionRequest = await toolset.connectedAccounts.initiate({
        integrationId,
        entityId,
        redirectUrl,
    });

    return {
        redirectUrl: connectionRequest.redirectUrl,
        connectedAccountId: connectionRequest.connectedAccountId,
        connectionStatus: connectionRequest.connectionStatus,
    };
};

/**
 * Retrieves all active connections for a user.
 */
const getUserConnections = async (userId) => {
    const entityId = userId.toString();

    try {
        const connections = await toolset.connectedAccounts.list({
            entityId,
        });

        // Map the SDK response to a cleaner format if necessary
        // for now returning as is, frontend actions/apps.ts types should match or adapt
        return connections;
    } catch (error) {
        console.error('Error fetching user connections:', error);
        return [];
    }
};

export const composioV2Service = {
    initiateConnection,
    getUserConnections,
};
