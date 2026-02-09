import { Client } from '@microsoft/microsoft-graph-client';
import config from '../../../config/index.js';
import User from '../auth/auth.model.js';
import 'isomorphic-fetch';

const REDIRECT_URI = config.microsoft.redirect_uri;
const CLIENT_ID = config.microsoft.client_id;
const CLIENT_SECRET = config.microsoft.client_secret;

// Scopes for Enterprise Integration
const SCOPES = [
    'User.Read',
    'Files.ReadWrite',
    'Files.ReadWrite.All',
    'Mail.ReadWrite',
    'Calendars.ReadWrite',
    'Chat.ReadWrite',
    'Sites.ReadWrite.All',
    'offline_access'
];

const getAuthUrl = () => {
    // Construct the Microsoft OAuth2 Authorization URL
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        response_mode: 'query',
        scope: SCOPES.join(' '),
        state: '12345' // Should use proper state generation in prod
    });
    return `https://login.microsoftonline.com/${config.microsoft.tenant_id}/oauth2/v2.0/authorize?${params.toString()}`;
};

const getTokenFromCode = async (code) => {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        scope: SCOPES.join(' '),
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        client_secret: CLIENT_SECRET,
    });

    const response = await fetch(`https://login.microsoftonline.com/${config.microsoft.tenant_id}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString()
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get token: ${error}`);
    }

    return await response.json();
};

const getClient = async (userId) => {
    const user = await User.findById(userId);
    if (!user || !user.microsoftTokens) {
        throw new Error('User not connected to Microsoft 365');
    }

    // Basic Refresh Token Logic (In prod, check expiry and refresh if needed)
    let accessToken = user.microsoftTokens.access_token;

    return Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        }
    });
};

const getRecentFiles = async (userId) => {
    const client = await getClient(userId);
    const res = await client.api('/me/drive/recent').get();
    return res.value;
};

const getWordContent = async (userId, itemId) => {
    const client = await getClient(userId);
    // Get text content of a file
    // Note: Graph API for direct content might return stream
    return await client.api(`/me/drive/items/${itemId}/content`).get();
};

const sendTeamsMessage = async (userId, chatId, content) => {
    const client = await getClient(userId);
    await client.api(`/chats/${chatId}/messages`).post({
        body: {
            body: {
                content: content
            }
        }
    });
};

export const MicrosoftGraphService = {
    getAuthUrl,
    getTokenFromCode,
    getClient,
    getRecentFiles,
    getWordContent,
    sendTeamsMessage
};
