import { google } from 'googleapis';
import config from '../../../../config/index.js';
import User from '../auth/auth.model.js';

const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar'
];

const getAuthUrl = () => {
    const oauth2Client = new google.auth.OAuth2(
        config.google.client_id,
        config.google.client_secret,
        config.google.redirect_uri
    );
    return oauth2Client.generateAuthUrl({
        access_type: 'offline', // crucial for refresh token
        scope: SCOPES,
        prompt: 'consent' // force generation of refresh token
    });
};

const getTokenFromCode = async (code) => {
    const oauth2Client = new google.auth.OAuth2(
        config.google.client_id,
        config.google.client_secret,
        config.google.redirect_uri
    );
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
};

const getClient = async (userId) => {
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) {
        throw new Error('User not connected to Google Workspace');
    }

    const oauth2Client = new google.auth.OAuth2(
        config.google.client_id,
        config.google.client_secret,
        config.google.redirect_uri
    );

    oauth2Client.setCredentials(user.googleTokens);

    // Handle Refresh Token Logic if needed (googleapis handles it automatically if refresh_token is present)
    return oauth2Client;
};

const listFiles = async (userId) => {
    const auth = await getClient(userId);
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.list({
        pageSize: 10,
        fields: 'nextPageToken, files(id, name, mimeType)',
    });
    return res.data.files;
};

const getDocContent = async (userId, fileId) => {
    const auth = await getClient(userId);
    const docs = google.docs({ version: 'v1', auth });
    const res = await docs.documents.get({ documentId: fileId });
    // Parse structural elements to text
    let text = '';
    res.data.body.content.forEach(element => {
        if (element.paragraph) {
            element.paragraph.elements.forEach(el => {
                if (el.textRun) {
                    text += el.textRun.content;
                }
            });
        }
    });
    return text;
};

export const GoogleWorkspaceService = {
    getAuthUrl,
    getTokenFromCode,
    listFiles,
    getDocContent
};
