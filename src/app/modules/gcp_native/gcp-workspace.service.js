import { google } from 'googleapis';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// Setup scoped authentication for Workspace
const keyFile = config.google.google_application_credentials || 'alti_gcp.json';
const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/documents'
  ]
});

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });
const calendar = google.calendar({ version: 'v3', auth });
const docs = google.docs({ version: 'v1', auth });

/**
 * Uploads a text or binary payload as a file to Google Drive.
 * 
 * @param {string} fileName - Destination name
 * @param {string|Buffer} content - Content payload
 * @param {string} [folderId] - Parent folder ID
 * @param {string} [mimeType] - Mimetype (defaults to 'text/plain')
 * @returns {Promise<object>} Upload report
 */
const driveUpload = async (fileName, content, folderId = null, mimeType = 'text/plain') => {
  try {
    logger.info(`Workspace API: Uploading file "${fileName}" to Drive...`);
    const fileMetadata = { name: fileName };
    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    const media = {
      mimeType,
      body: content
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, webViewLink'
    });

    return {
      success: true,
      fileId: response.data.id,
      fileName: response.data.name,
      webViewLink: response.data.webViewLink,
      folderId
    };
  } catch (err) {
    logger.error('Workspace API Drive Upload Error:', err);
    throw new Error(`Google Drive Upload failed: ${err.message}`);
  }
};

/**
 * Downloads a file's content from Google Drive by ID.
 * 
 * @param {string} fileId - Google Drive file ID
 * @returns {Promise<object>} Download content
 */
const driveDownload = async (fileId) => {
  try {
    logger.info(`Workspace API: Downloading file "${fileId}" from Drive...`);
    const response = await drive.files.get({
      fileId,
      alt: 'media'
    });

    return {
      success: true,
      fileId,
      content: response.data
    };
  } catch (err) {
    logger.error('Workspace API Drive Download Error:', err);
    throw new Error(`Google Drive Download failed: ${err.message}`);
  }
};

/**
 * Creates a brand new Google Sheet spreadsheet.
 * 
 * @param {string} title - Sheet title
 * @returns {Promise<object>} Sheet info
 */
const sheetsCreate = async (title) => {
  try {
    logger.info(`Workspace API: Creating Google Spreadsheet "${title}"...`);
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title
        }
      }
    });

    return {
      success: true,
      spreadsheetId: response.data.spreadsheetId,
      spreadsheetUrl: response.data.spreadsheetUrl,
      title
    };
  } catch (err) {
    logger.error('Workspace API Sheets Create Error:', err);
    throw new Error(`Google Sheets creation failed: ${err.message}`);
  }
};

/**
 * Appends row values to a Google Sheet spreadsheet range.
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} range - Sheet range (e.g. 'Sheet1!A:C')
 * @param {Array|Array<Array>} values - Array of cells/values or double array of rows
 * @returns {Promise<object>} Sheets update report
 */
const sheetsAppend = async (spreadsheetId, range, values) => {
  try {
    logger.info(`Workspace API: Appending cells to Spreadsheet "${spreadsheetId}" range "${range}"...`);
    const valueInputOption = 'USER_ENTERED';
    const formattedValues = Array.isArray(values) ? (Array.isArray(values[0]) ? values : [values]) : [[values]];

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: {
        values: formattedValues
      }
    });

    return {
      success: true,
      spreadsheetId,
      updatedRange: response.data.updates?.updatedRange || range,
      rowsAppended: response.data.updates?.updatedRows || 0,
      columnsAppended: response.data.updates?.updatedColumns || 0
    };
  } catch (err) {
    logger.error('Workspace API Sheets Append Error:', err);
    throw new Error(`Google Sheets Append failed: ${err.message}`);
  }
};

/**
 * Reads cells from a Google Sheet spreadsheet range.
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} range - Sheet range (e.g. 'Sheet1!A1:D20')
 * @returns {Promise<object>} Read content
 */
const sheetsRead = async (spreadsheetId, range) => {
  try {
    logger.info(`Workspace API: Reading from Spreadsheet "${spreadsheetId}" range "${range}"...`);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    return {
      success: true,
      spreadsheetId,
      range,
      values: response.data.values || []
    };
  } catch (err) {
    logger.error('Workspace API Sheets Read Error:', err);
    throw new Error(`Google Sheets Read failed: ${err.message}`);
  }
};

/**
 * Creates a formatted Google Document with structured headers and body content.
 * 
 * @param {string} title - Document title
 * @param {string} bodyText - Document text body
 * @returns {Promise<object>} Docs creation report
 */
const docsCreate = async (title, bodyText) => {
  try {
    logger.info(`Workspace API: Creating Google Doc "${title}"...`);
    
    // 1. Create empty doc first
    const createResponse = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: 'application/vnd.google-apps.document'
      },
      fields: 'id, name, webViewLink'
    });
    
    const docId = createResponse.data.id;

    // 2. Append body content
    const requests = [
      {
        insertText: {
          location: { index: 1 },
          text: `${bodyText}\n`
        }
      }
    ];

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests }
    });

    return {
      success: true,
      docId,
      title,
      webViewLink: createResponse.data.webViewLink
    };
  } catch (err) {
    logger.error('Workspace API Docs Create Error:', err);
    throw new Error(`Google Docs creation failed: ${err.message}`);
  }
};

/**
 * Creates an event on the Google Calendar.
 * 
 * @param {string} summary - Event name
 * @param {string} startTime - ISO datetime start (e.g. '2026-05-25T10:00:00-04:00')
 * @param {string} endTime - ISO datetime end (e.g. '2026-05-25T11:30:00-04:00')
 * @param {object} [details] - Optional descriptions, location, attendees
 * @returns {Promise<object>} Calendar event report
 */
const calendarCreateEvent = async (summary, startTime, endTime, details = {}) => {
  try {
    logger.info(`Workspace API: Creating Calendar Event "${summary}"...`);
    
    const event = {
      summary,
      location: details.location || '',
      description: details.description || '',
      start: {
        dateTime: startTime,
        timeZone: details.timeZone || 'UTC'
      },
      end: {
        dateTime: endTime,
        timeZone: details.timeZone || 'UTC'
      }
    };

    if (details.attendees && Array.isArray(details.attendees)) {
      event.attendees = details.attendees.map(email => ({ email }));
    }

    const response = await calendar.events.insert({
      calendarId: details.calendarId || 'primary',
      requestBody: event
    });

    return {
      success: true,
      eventId: response.data.id,
      summary,
      start: response.data.start,
      end: response.data.end,
      htmlLink: response.data.htmlLink
    };
  } catch (err) {
    logger.error('Workspace API Calendar Create Event Error:', err);
    throw new Error(`Google Calendar Event creation failed: ${err.message}`);
  }
};

/**
 * Lists upcoming Google Calendar events.
 * 
 * @param {object} [options] - Event query filters (maxResults, timeMin)
 * @returns {Promise<object>} Event list report
 */
const calendarListEvents = async (options = {}) => {
  try {
    const calendarId = options.calendarId || 'primary';
    const maxResults = options.maxResults || 10;
    const timeMin = options.timeMin || new Date().toISOString();

    logger.info(`Workspace API: Listing events for calendar "${calendarId}" from ${timeMin}...`);

    const response = await calendar.events.list({
      calendarId,
      timeMin,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = (response.data.items || []).map(event => ({
      id: event.id,
      summary: event.summary,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      htmlLink: event.htmlLink
    }));

    return {
      success: true,
      calendarId,
      events
    };
  } catch (err) {
    logger.error('Workspace API Calendar List Events Error:', err);
    throw new Error(`Google Calendar Listing failed: ${err.message}`);
  }
};

export const GcpWorkspaceService = {
  driveUpload,
  driveDownload,
  sheetsCreate,
  sheetsAppend,
  sheetsRead,
  docsCreate,
  calendarCreateEvent,
  calendarListEvents
};
