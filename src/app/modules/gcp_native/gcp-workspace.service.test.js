import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GcpWorkspaceService } from './gcp-workspace.service.js';
import { logger } from '../../../shared/logger.js';

const {
  mockDriveFilesCreate,
  mockDriveFilesGet,
  mockSheetsSpreadsheetsCreate,
  mockSheetsSpreadsheetsValuesAppend,
  mockSheetsSpreadsheetsValuesGet,
  mockDocsDocumentsBatchUpdate,
  mockCalendarEventsInsert,
  mockCalendarEventsList
} = vi.hoisted(() => {
  // Mock the entire 'googleapis' library
  const mockDriveFilesCreate = vi.fn();
  const mockDriveFilesGet = vi.fn();
  const mockSheetsSpreadsheetsCreate = vi.fn();
  const mockSheetsSpreadsheetsValuesAppend = vi.fn();
  const mockSheetsSpreadsheetsValuesGet = vi.fn();
  const mockDocsDocumentsBatchUpdate = vi.fn();
  const mockCalendarEventsInsert = vi.fn();
  const mockCalendarEventsList = vi.fn();

  return {
    mockDriveFilesCreate,
    mockDriveFilesGet,
    mockSheetsSpreadsheetsCreate,
    mockSheetsSpreadsheetsValuesAppend,
    mockSheetsSpreadsheetsValuesGet,
    mockDocsDocumentsBatchUpdate,
    mockCalendarEventsInsert,
    mockCalendarEventsList
  };
});

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({})),
    },
    drive: vi.fn().mockImplementation(() => ({
      files: {
        create: mockDriveFilesCreate,
        get: mockDriveFilesGet,
      },
    })),
    sheets: vi.fn().mockImplementation(() => ({
      spreadsheets: {
        create: mockSheetsSpreadsheetsCreate,
        values: {
          append: mockSheetsSpreadsheetsValuesAppend,
          get: mockSheetsSpreadsheetsValuesGet,
        },
      },
    })),
    docs: vi.fn().mockImplementation(() => ({
      documents: {
        batchUpdate: mockDocsDocumentsBatchUpdate,
      },
    })),
    calendar: vi.fn().mockImplementation(() => ({
      events: {
        insert: mockCalendarEventsInsert,
        list: mockCalendarEventsList,
      },
    })),
  },
}));

// Mock the logger
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the config
vi.mock('../../../../config/index.js', () => ({
  default: {
    google: {
      google_application_credentials: 'test_credentials.json',
    },
  },
}));

describe('GcpWorkspaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('driveUpload', () => {
    it('should upload a file successfully without a folderId', async () => {
      const mockResponse = {
        data: {
          id: 'file123',
          name: 'test.txt',
          webViewLink: 'https://drive.google.com/file/d/file123/view',
        },
      };
      mockDriveFilesCreate.mockResolvedValue(mockResponse);

      const result = await GcpWorkspaceService.driveUpload('test.txt', 'Hello World');

      expect(logger.info).toHaveBeenCalledWith('Workspace API: Uploading file "test.txt" to Drive...');
      expect(mockDriveFilesCreate).toHaveBeenCalledWith({
        requestBody: { name: 'test.txt' },
        media: { mimeType: 'text/plain', body: 'Hello World' },
        fields: 'id, name, webViewLink',
      });
      expect(result).toEqual({
        success: true,
        fileId: 'file123',
        fileName: 'test.txt',
        webViewLink: 'https://drive.google.com/file/d/file123/view',
        folderId: null,
      });
    });

    it('should upload a file successfully with a folderId and custom mimeType', async () => {
      const mockResponse = {
        data: {
          id: 'file456',
          name: 'image.png',
          webViewLink: 'https://drive.google.com/file/d/file456/view',
        },
      };
      mockDriveFilesCreate.mockResolvedValue(mockResponse);

      const content = Buffer.from('fake-image-data');
      const result = await GcpWorkspaceService.driveUpload('image.png', content, 'folder789', 'image/png');

      expect(mockDriveFilesCreate).toHaveBeenCalledWith({
        requestBody: { name: 'image.png', parents: ['folder789'] },
        media: { mimeType: 'image/png', body: content },
        fields: 'id, name, webViewLink',
      });
      expect(result).toEqual({
        success: true,
        fileId: 'file456',
        fileName: 'image.png',
        webViewLink: 'https://drive.google.com/file/d/file456/view',
        folderId: 'folder789',
      });
    });

    it('should throw an error if the upload fails', async () => {
      const error = new Error('API Error');
      mockDriveFilesCreate.mockRejectedValue(error);

      await expect(GcpWorkspaceService.driveUpload('test.txt', 'content')).rejects.toThrow('Google Drive Upload failed: API Error');
      expect(logger.error).toHaveBeenCalledWith('Workspace API Drive Upload Error:', error);
    });
  });

  describe('driveDownload', () => {
    it('should download a file successfully', async () => {
      const mockResponse = { data: 'file content' };
      mockDriveFilesGet.mockResolvedValue(mockResponse);

      const result = await GcpWorkspaceService.driveDownload('file123');

      expect(logger.info).toHaveBeenCalledWith('Workspace API: Downloading file "file123" from Drive...');
      expect(mockDriveFilesGet).toHaveBeenCalledWith({
        fileId: 'file123',
        alt: 'media',
      });
      expect(result).toEqual({
        success: true,
        fileId: 'file123',
        content: 'file content',
      });
    });

    it('should throw an error if the download fails', async () => {
      const error = new Error('API Error');
      mockDriveFilesGet.mockRejectedValue(error);

      await expect(GcpWorkspaceService.driveDownload('file123')).rejects.toThrow('Google Drive Download failed: API Error');
      expect(logger.error).toHaveBeenCalledWith('Workspace API Drive Download Error:', error);
    });
  });

  describe('sheetsCreate', () => {
    it('should create a spreadsheet successfully', async () => {
      const mockResponse = {
        data: {
          spreadsheetId: 'sheet123',
          spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet123/edit',
        },
      };
      mockSheetsSpreadsheetsCreate.mockResolvedValue(mockResponse);

      const result = await GcpWorkspaceService.sheetsCreate('My New Sheet');

      expect(logger.info).toHaveBeenCalledWith('Workspace API: Creating Google Spreadsheet "My New Sheet"...');
      expect(mockSheetsSpreadsheetsCreate).toHaveBeenCalledWith({
        requestBody: {
          properties: { title: 'My New Sheet' },
        },
      });
      expect(result).toEqual({
        success: true,
        spreadsheetId: 'sheet123',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet123/edit',
        title: 'My New Sheet',
      });
    });

    it('should throw an error if sheet creation fails', async () => {
      const error = new Error('API Error');
      mockSheetsSpreadsheetsCreate.mockRejectedValue(error);

      await expect(GcpWorkspaceService.sheetsCreate('My New Sheet')).rejects.toThrow('Google Sheets creation failed: API Error');
      expect(logger.error).toHaveBeenCalledWith('Workspace API Sheets Create Error:', error);
    });
  });

  describe('sheetsAppend', () => {
    it('should append a single row of values successfully', async () => {
      const mockResponse = {
        data: {
          updates: {
            updatedRange: 'Sheet1!A1:B1',
            updatedRows: 1,
            updatedColumns: 2,
          },
        },
      };
      mockSheetsSpreadsheetsValuesAppend.mockResolvedValue(mockResponse);

      const result = await GcpWorkspaceService.sheetsAppend('sheet123', 'Sheet1!A:B', ['A1', 'B1']);

      expect(logger.info).toHaveBeenCalledWith('Workspace API: Appending cells to Spreadsheet "sheet123" range "Sheet1!A:B"...');
      expect(mockSheetsSpreadsheetsValuesAppend).toHaveBeenCalledWith({
        spreadsheetId: 'sheet123',
        range: 'Sheet1!A:B',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['A1', 'B1']],
        },
      });
      expect(result).toEqual({
        success: true,
        spreadsheetId: 'sheet123',
        updatedRange: 'Sheet1!A1:B1',
        rowsAppended: 1,
        columnsAppended: 2,
      });
    });

    it('should append multiple rows of values successfully', async () => {
      mockSheetsSpreadsheetsValuesAppend.mockResolvedValue({ data: { updates: {} } });
      const values = [['A1', 'B1'], ['A2', 'B2']];
      await GcpWorkspaceService.sheetsAppend('sheet123', 'Sheet1!A:B', values);

      expect(mockSheetsSpreadsheetsValuesAppend).toHaveBeenCalledWith(expect.objectContaining({
        requestBody: { values },
      }));
    });

    it('should throw an error if appending fails', async () => {
      const error = new Error('API Error');
      mockSheetsSpreadsheetsValuesAppend.mockRejectedValue(error);

      await expect(GcpWorkspaceService.sheetsAppend('sheet123', 'Sheet1', [['val']])).rejects.toThrow('Google Sheets Append failed: API Error');
      expect(logger.error).toHaveBeenCalledWith('Workspace API Sheets Append Error:', error);
    });
  });

  describe('sheetsRead', () => {
    it('should read values from a sheet successfully', async () => {
      const mockValues = [['Header1', 'Header2'], ['Value1', 'Value2']];
      const mockResponse = { data: { values: mockValues } };
      mockSheetsSpreadsheetsValuesGet.mockResolvedValue(mockResponse);

      const result = await GcpWorkspaceService.sheetsRead('sheet123', 'Sheet1!A1:B2');

      expect(logger.info).toHaveBeenCalledWith('Workspace API: Reading from Spreadsheet "sheet123" range "Sheet1!A1:B2"...');
      expect(mockSheetsSpreadsheetsValuesGet).toHaveBeenCalledWith({
        spreadsheetId: 'sheet123',
        range: 'Sheet1!A1:B2',
      });
      expect(result).toEqual({
        success: true,
        spreadsheetId: 'sheet123',
        range: 'Sheet1!A1:B2',
        values: mockValues,
      });
    });

    it('should return an empty array if no values are found', async () => {
      mockSheetsSpreadsheetsValuesGet.mockResolvedValue({ data: {} });
      const result = await GcpWorkspaceService.sheetsRead('sheet123', 'Sheet1!A1:B2');
      expect(result.values).toEqual([]);
    });

    it('should throw an error if reading fails', async () => {
      const error = new Error('API Error');
      mockSheetsSpreadsheetsValuesGet.mockRejectedValue(error);

      await expect(GcpWorkspaceService.sheetsRead('sheet123', 'Sheet1')).rejects.toThrow('Google Sheets Read failed: API Error');
      expect(logger.error).toHaveBeenCalledWith('Workspace API Sheets Read Error:', error);
    });
  });

  describe('docsCreate', () => {
    it('should create a doc and append content successfully', async () => {
      const createResponse = {
        data: {
          id: 'doc123',
          name: 'My New Doc',
          webViewLink: 'https://docs.google.com/document/d/doc123/edit',
        },
      };
      mockDriveFilesCreate.mockResolvedValue(createResponse);
      mockDocsDocumentsBatchUpdate.mockResolvedValue({});

      const result = await GcpWorkspaceService.docsCreate('My New Doc', 'This is the body.');

      expect(logger.info).toHaveBeenCalledWith('Workspace API: Creating Google Doc "My New Doc"...');
      expect(mockDriveFilesCreate).toHaveBeenCalledWith({
        requestBody: {
          name: 'My New Doc',
          mimeType: 'application/vnd.google-apps.document',
        },
        fields: 'id, name, webViewLink',
      });
      expect(mockDocsDocumentsBatchUpdate).toHaveBeenCalledWith({
        documentId: 'doc123',
        requestBody: {
          requests: [{
            insertText: {
              location: { index: 1 },
              text: 'This is the body.\n',
            },
          }],
        },
      });
      expect(result).toEqual({
        success: true,
        docId: 'doc123',
        title: 'My New Doc',
        webViewLink: 'https://docs.google.com/document/d/doc123/edit',
      });
    });

    it('should throw an error if doc creation fails', async () => {
      const error = new Error('API Error');
      mockDriveFilesCreate.mockRejectedValue(error);

      await expect(GcpWorkspaceService.docsCreate('title', 'body')).rejects.toThrow('Google Docs creation failed: API Error');
      expect(logger.error).toHaveBeenCalledWith('Workspace API Docs Create Error:', error);
    });

    it('should throw an error if batch update fails', async () => {
        const createResponse = { data: { id: 'doc123' } };
        mockDriveFilesCreate.mockResolvedValue(createResponse);
        const error = new Error('Batch Update Error');
        mockDocsDocumentsBatchUpdate.mockRejectedValue(error);
  
        await expect(GcpWorkspaceService.docsCreate('title', 'body')).rejects.toThrow('Google Docs creation failed: Batch Update Error');
        expect(logger.error).toHaveBeenCalledWith('Workspace API Docs Create Error:', error);
      });
  });

  describe('calendarCreateEvent', () => {
    const startTime = '2026-05-25T10:00:00-04:00';
    const endTime = '2026-05-25T11:30:00-04:00';

    it('should create a calendar event with minimal details', async () => {
      const mockResponse = {
        data: {
          id: 'event123',
          start: { dateTime: startTime },
          end: { dateTime: endTime },
          htmlLink: 'https://calendar.google.com/event?eid=event123',
        },
      };
      mockCalendarEventsInsert.mockResolvedValue(mockResponse);

      const result = await GcpWorkspaceService.calendarCreateEvent('Team Meeting', startTime, endTime);

      expect(logger.info).toHaveBeenCalledWith('Workspace API: Creating Calendar Event "Team Meeting"...');
      expect(mockCalendarEventsInsert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: {
          summary: 'Team Meeting',
          location: '',
          description: '',
          start: { dateTime: startTime, timeZone: 'UTC' },
          end: { dateTime: endTime, timeZone: 'UTC' },
        },
      });
      expect(result).toEqual({
        success: true,
        eventId: 'event123',
        summary: 'Team Meeting',
        start: { dateTime: startTime },
        end: { dateTime: endTime },
        htmlLink: 'https://calendar.google.com/event?eid=event123',
      });
    });

    it('should create a calendar event with all details', async () => {
        mockCalendarEventsInsert.mockResolvedValue({ data: {} });
        const details = {
            location: 'Conference Room 1',
            description: 'Project discussion',
            timeZone: 'America/New_York',
            attendees: ['test1@example.com', 'test2@example.com'],
            calendarId: 'custom-calendar@google.com'
        };

        await GcpWorkspaceService.calendarCreateEvent('Project Sync', startTime, endTime, details);

        expect(mockCalendarEventsInsert).toHaveBeenCalledWith({
            calendarId: 'custom-calendar@google.com',
            requestBody: {
                summary: 'Project Sync',
                location: 'Conference Room 1',
                description: 'Project discussion',
                start: { dateTime: startTime, timeZone: 'America/New_York' },
                end: { dateTime: endTime, timeZone: 'America/New_York' },
                attendees: [{ email: 'test1@example.com' }, { email: 'test2@example.com' }]
            }
        });
    });

    it('should throw an error if event creation fails', async () => {
        const error = new Error('API Error');
        mockCalendarEventsInsert.mockRejectedValue(error);

        await expect(GcpWorkspaceService.calendarCreateEvent('Meeting', startTime, endTime)).rejects.toThrow('Google Calendar Event creation failed: API Error');
        expect(logger.error).toHaveBeenCalledWith('Workspace API Calendar Create Event Error:', error);
    });
  });

  describe('calendarListEvents', () => {
    let dateSpy;
    const fakeNow = '2026-01-01T00:00:00.000Z';

    beforeEach(() => {
        dateSpy = vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(fakeNow);
    });

    afterEach(() => {
        dateSpy.mockRestore();
    });

    it('should list events with default options', async () => {
        const mockResponse = {
            data: {
                items: [
                    { id: 'ev1', summary: 'Event 1', start: { dateTime: '2026-01-01T10:00:00Z' }, end: { date: '2026-01-02' }, htmlLink: 'link1' }
                ]
            }
        };
        mockCalendarEventsList.mockResolvedValue(mockResponse);

        const result = await GcpWorkspaceService.calendarListEvents();

        expect(logger.info).toHaveBeenCalledWith(`Workspace API: Listing events for calendar "primary" from ${fakeNow}...`);
        expect(mockCalendarEventsList).toHaveBeenCalledWith({
            calendarId: 'primary',
            timeMin: fakeNow,
            maxResults: 10,
            singleEvents: true,
            orderBy: 'startTime'
        });
        expect(result).toEqual({
            success: true,
            calendarId: 'primary',
            events: [
                { id: 'ev1', summary: 'Event 1', start: '2026-01-01T10:00:00Z', end: '2026-01-02', htmlLink: 'link1' }
            ]
        });
    });

    it('should list events with custom options', async () => {
        mockCalendarEventsList.mockResolvedValue({ data: { items: [] } });
        const options = {
            calendarId: 'custom@cal.com',
            maxResults: 5,
            timeMin: '2025-01-01T00:00:00.000Z'
        };

        await GcpWorkspaceService.calendarListEvents(options);

        expect(mockCalendarEventsList).toHaveBeenCalledWith({
            calendarId: 'custom@cal.com',
            timeMin: '2025-01-01T00:00:00.000Z',
            maxResults: 5,
            singleEvents: true,
            orderBy: 'startTime'
        });
    });

    it('should return an empty array if no events are found', async () => {
        mockCalendarEventsList.mockResolvedValue({ data: { items: [] } });
        const result = await GcpWorkspaceService.calendarListEvents();
        expect(result.events).toEqual([]);
    });

    it('should throw an error if listing fails', async () => {
        const error = new Error('API Error');
        mockCalendarEventsList.mockRejectedValue(error);

        await expect(GcpWorkspaceService.calendarListEvents()).rejects.toThrow('Google Calendar Listing failed: API Error');
        expect(logger.error).toHaveBeenCalledWith('Workspace API Calendar List Events Error:', error);
    });
  });
});