import { vi } from 'vitest';

const {
  mockProcessDocument,
  mockConfig,
  mockLogger
} = vi.hoisted(() => {
  // Mock @google-cloud/documentai
  const mockProcessDocument = vi.fn();

  // Mock config
  const mockConfig = {
    gcp_project_id: 'test-gcp-project',
    gcp_document_ai_processor_id: 'test-processor-id',
  };

  // Mock logger
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockProcessDocument,
    mockConfig,
    mockLogger
  };
});

vi.mock('@google-cloud/documentai', () => ({
  DocumentProcessorServiceClient: vi.fn().mockImplementation(() => ({
    processDocument: mockProcessDocument,
  })),
}));

vi.mock('../../../../config/index.js', () => ({
  default: mockConfig,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Import the service after mocks are set up
import { GcpDocumentAiService } from './gcp-document-ai.service.js';
import { describe, it, expect, beforeEach } from 'vitest';

describe('GcpDocumentAiService', () => {
  const mockFileBuffer = Buffer.from('test content');
  const mockMimeType = 'application/pdf';
  const mockProcessorId = 'custom-processor-id';
  const mockLocation = 'eu';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars for each test
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    vi.stubEnv('GCLOUD_PROJECT', '');
    vi.stubEnv('GCP_DOCUMENT_AI_PROCESSOR_ID', '');
    // Reset config values if they were modified in a test
    mockConfig.gcp_project_id = 'test-gcp-project';
    mockConfig.gcp_document_ai_processor_id = 'test-processor-id';
  });

  // Helper function to create a mock Document AI response
  const createMockDocumentAiResponse = (overrides = {}) => {
    const defaultText = 'This is the full document text. Paragraph one. Paragraph two. Header 1 Header 2 Cell 1A Cell 1B Cell 2A Cell 2B. Key: Value.';
    return {
      document: {
        text: defaultText,
        mimeType: mockMimeType,
        pages: [
          {
            pageNumber: 1,
            paragraphs: [
              {
                layout: {
                  textAnchor: {
                    textSegments: [{ startIndex: '30', endIndex: '43' }], // "Paragraph one"
                  },
                },
              },
              {
                layout: {
                  textAnchor: {
                    textSegments: [{ startIndex: '45', endIndex: '58' }], // "Paragraph two"
                  },
                },
              },
            ],
            tables: [
              {
                headerRows: [
                  {
                    cells: [
                      { layout: { textAnchor: { textSegments: [{ startIndex: '60', endIndex: '68' }] } } }, // "Header 1"
                      { layout: { textAnchor: { textSegments: [{ startIndex: '69', endIndex: '77' }] } } }, // "Header 2"
                    ],
                  },
                ],
                bodyRows: [
                  {
                    cells: [
                      { layout: { textAnchor: { textSegments: [{ startIndex: '78', endIndex: '86' }] } } }, // "Cell 1A"
                      { layout: { textAnchor: { textSegments: [{ startIndex: '87', endIndex: '95' }] } } }, // "Cell 1B"
                    ],
                  },
                  {
                    cells: [
                      { layout: { textAnchor: { textSegments: [{ startIndex: '96', endIndex: '104' }] } } }, // "Cell 2A"
                      { layout: { textAnchor: { textSegments: [{ startIndex: '105', endIndex: '113' }] } } }, // "Cell 2B"
                    ],
                  },
                ],
              },
            ],
            formFields: [
              {
                fieldName: { layout: { textAnchor: { textSegments: [{ startIndex: '115', endIndex: '119' }] } } }, // "Key:"
                fieldValue: { layout: { textAnchor: { textSegments: [{ startIndex: '120', endIndex: '125' }] } } }, // "Value"
              },
              {
                fieldName: { layout: { textAnchor: { textSegments: [{ startIndex: '115', endIndex: '119' }] } } }, // "Key:"
                fieldValue: null, // Missing field value
              },
            ],
          },
        ],
        ...overrides,
      },
    };
  };

  describe('processDocument', () => {
    it('should successfully process a document and extract all data types', async () => {
      const mockResponse = createMockDocumentAiResponse();
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      const result = await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId,
        mockLocation
      );

      expect(mockProcessDocument).toHaveBeenCalledTimes(1);
      expect(mockProcessDocument).toHaveBeenCalledWith({
        name: `projects/${mockConfig.gcp_project_id}/locations/${mockLocation}/processors/${mockProcessorId}`,
        rawDocument: {
          content: mockFileBuffer.toString('base64'),
          mimeType: mockMimeType,
        },
      });

      expect(result).toEqual({
        success: true,
        text: mockResponse.document.text,
        paragraphs: ['Paragraph one', 'Paragraph two'],
        tables: [
          {
            headers: [['Header 1', 'Header 2']],
            rows: [
              ['Cell 1A', 'Cell 1B'],
              ['Cell 2A', 'Cell 2B'],
            ],
          },
        ],
        keyValues: [{ key: 'Key', value: 'Value' }, { key: 'Key', value: '' }],
        metadata: {
          pageCount: 1,
          mimeType: mockMimeType,
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Sending document of type "${mockMimeType}" to GCP Document AI processor:`)
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should use default location "us" if not provided', async () => {
      const mockResponse = createMockDocumentAiResponse();
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId
      ); // No location provided

      expect(mockProcessDocument).toHaveBeenCalledTimes(1);
      expect(mockProcessDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `projects/${mockConfig.gcp_project_id}/locations/us/processors/${mockProcessorId}`,
        })
      );
    });

    it('should use processorId from config if not provided as argument', async () => {
      const mockResponse = createMockDocumentAiResponse();
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        undefined, // processorId not provided
        mockLocation
      );

      expect(mockProcessDocument).toHaveBeenCalledTimes(1);
      expect(mockProcessDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `projects/${mockConfig.gcp_project_id}/locations/${mockLocation}/processors/${mockConfig.gcp_document_ai_processor_id}`,
        })
      );
    });

    it('should use processorId from env variable if not provided as argument or config', async () => {
      vi.stubEnv('GCP_DOCUMENT_AI_PROCESSOR_ID', 'env-processor-id');
      mockConfig.gcp_document_ai_processor_id = undefined; // Clear config value

      const mockResponse = createMockDocumentAiResponse();
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        undefined, // processorId not provided
        mockLocation
      );

      expect(mockProcessDocument).toHaveBeenCalledTimes(1);
      expect(mockProcessDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `projects/${mockConfig.gcp_project_id}/locations/${mockLocation}/processors/env-processor-id`,
        })
      );
    });

    it('should use gcpProjectId from env GOOGLE_CLOUD_PROJECT if config is missing', async () => {
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-gcp-project');
      mockConfig.gcp_project_id = undefined; // Clear config value

      const mockResponse = createMockDocumentAiResponse();
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId,
        mockLocation
      );

      expect(mockProcessDocument).toHaveBeenCalledTimes(1);
      expect(mockProcessDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `projects/env-gcp-project/locations/${mockLocation}/processors/${mockProcessorId}`,
        })
      );
    });

    it('should use gcpProjectId from env GCLOUD_PROJECT if config and GOOGLE_CLOUD_PROJECT are missing', async () => {
      vi.stubEnv('GCLOUD_PROJECT', 'env-gcloud-project');
      mockConfig.gcp_project_id = undefined; // Clear config value
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', ''); // Ensure this is also clear

      const mockResponse = createMockDocumentAiResponse();
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId,
        mockLocation
      );

      expect(mockProcessDocument).toHaveBeenCalledTimes(1);
      expect(mockProcessDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `projects/env-gcloud-project/locations/${mockLocation}/processors/${mockProcessorId}`,
        })
      );
    });

    it('should return empty arrays for paragraphs, tables, and keyValues if document has no pages', async () => {
      const mockResponse = createMockDocumentAiResponse({ pages: [] });
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      const result = await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId,
        mockLocation
      );

      expect(result.paragraphs).toEqual([]);
      expect(result.tables).toEqual([]);
      expect(result.keyValues).toEqual([]);
      expect(result.metadata.pageCount).toBe(0);
    });

    it('should return empty arrays for paragraphs, tables, and keyValues if document pages are missing respective fields', async () => {
      const mockResponse = createMockDocumentAiResponse({
        pages: [{ pageNumber: 1, paragraphs: [], tables: [], formFields: [] }],
      });
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      const result = await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId,
        mockLocation
      );

      expect(result.paragraphs).toEqual([]);
      expect(result.tables).toEqual([]);
      expect(result.keyValues).toEqual([]);
      expect(result.metadata.pageCount).toBe(1);
    });

    it('should handle document with only text and no structural elements', async () => {
      const mockResponse = createMockDocumentAiResponse({
        pages: [],
        text: 'Just some plain text here.',
      });
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      const result = await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId,
        mockLocation
      );

      expect(result.success).toBe(true);
      expect(result.text).toBe('Just some plain text here.');
      expect(result.paragraphs).toEqual([]);
      expect(result.tables).toEqual([]);
      expect(result.keyValues).toEqual([]);
      expect(result.metadata.pageCount).toBe(0);
    });

    it('should throw an error if GCP Project ID is not configured', async () => {
      mockConfig.gcp_project_id = undefined;
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
      vi.stubEnv('GCLOUD_PROJECT', '');

      await expect(
        GcpDocumentAiService.processDocument(mockFileBuffer, mockMimeType, mockProcessorId, mockLocation)
      ).rejects.toThrow('GCP Project ID is not configured. Please set GOOGLE_CLOUD_PROJECT in your environment.');
      expect(mockProcessDocument).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should throw an error if Document AI Processor ID is not provided or configured', async () => {
      mockConfig.gcp_document_ai_processor_id = undefined;
      vi.stubEnv('GCP_DOCUMENT_AI_PROCESSOR_ID', '');

      await expect(
        GcpDocumentAiService.processDocument(mockFileBuffer, mockMimeType, undefined, mockLocation)
      ).rejects.toThrow('Document AI Processor ID is not provided or configured in environment variables.');
      expect(mockProcessDocument).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should throw an error if client.processDocument fails', async () => {
      const errorMessage = 'API call failed';
      mockProcessDocument.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        GcpDocumentAiService.processDocument(mockFileBuffer, mockMimeType, mockProcessorId, mockLocation)
      ).rejects.toThrow(`GCP Document AI execution failed: ${errorMessage}`);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith('GCP Document AI Processing Error:', expect.any(Error));
    });

    it('should throw an error if GCP Document AI returns an empty document', async () => {
      mockProcessDocument.mockResolvedValueOnce([{ document: null }]);

      await expect(
        GcpDocumentAiService.processDocument(mockFileBuffer, mockMimeType, mockProcessorId, mockLocation)
      ).rejects.toThrow('GCP Document AI returned an empty response.');
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith('GCP Document AI Processing Error:', expect.any(Error));
    });

    it('should handle missing text in document gracefully', async () => {
      const mockResponse = createMockDocumentAiResponse({ text: undefined });
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      const result = await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId,
        mockLocation
      );

      expect(result.text).toBe('');
      expect(result.paragraphs).toEqual([]);
      expect(result.tables).toEqual([]);
      expect(result.keyValues).toEqual([]);
    });

    it('should handle missing mimeType in document metadata gracefully', async () => {
      const mockResponse = createMockDocumentAiResponse({ mimeType: undefined });
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      const result = await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId,
        mockLocation
      );

      expect(result.metadata.mimeType).toBeUndefined();
    });

    it('should correctly extract text from layout with valid and invalid segments', async () => {
      const mockText = '0123456789abcdefghij';
      const mockResponse = createMockDocumentAiResponse({
        text: mockText,
        pages: [{
          paragraphs: [
            { layout: { textAnchor: { textSegments: [{ startIndex: '0', endIndex: '3' }] } } }, // "012"
            { layout: { textAnchor: { textSegments: [{ startIndex: '5', endIndex: '8' }] } } }, // "567"
            { layout: { textAnchor: { textSegments: [{ startIndex: '100', endIndex: '104' }] } } }, // Out of bounds, ignored
            { layout: { textAnchor: { textSegments: [{ startIndex: '5', endIndex: '5' }] } } }, // Start >= End, ignored
            { layout: { textAnchor: { textSegments: [{ startIndex: '10', endIndex: '13' }] } } }, // "abc"
            { layout: { textAnchor: { textSegments: [{ startIndex: undefined, endIndex: '2' }] } } }, // "01" (startIndex defaults to 0)
            { layout: { textAnchor: { textSegments: [{ startIndex: '15', endIndex: null }] } } }, // Ignored (endIndex defaults to 0, so startIndex > endIndex)
          ],
          tables: [],
          formFields: [],
        }],
      });
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      const result = await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId,
        mockLocation
      );

      expect(result.paragraphs).toEqual(['012', '567', 'abc', '01']);
    });

    it('should handle form fields with empty fieldName or fieldValue layouts', async () => {
      const mockText = 'Field1: Value1. Field2: . Field3: Value3.';
      const mockResponse = createMockDocumentAiResponse({
        text: mockText,
        pages: [{
          formFields: [
            {
              fieldName: { layout: { textAnchor: { textSegments: [{ startIndex: '0', endIndex: '7' }] } } }, // "Field1:"
              fieldValue: { layout: { textAnchor: { textSegments: [{ startIndex: '8', endIndex: '14' }] } } }, // "Value1"
            },
            {
              fieldName: { layout: { textAnchor: { textSegments: [{ startIndex: '16', endIndex: '23' }] } } }, // "Field2:"
              fieldValue: { layout: { textAnchor: { textSegments: [] } } }, // Empty value layout
            },
            {
              fieldName: { layout: { textAnchor: { textSegments: [{ startIndex: '26', endIndex: '33' }] } } }, // "Field3:"
              fieldValue: null, // Null value layout
            },
            {
              fieldName: null, // Null field name layout
              fieldValue: { layout: { textAnchor: { textSegments: [{ startIndex: '34', endIndex: '40' }] } } }, // "Value3"
            },
          ],
          paragraphs: [],
          tables: [],
        }],
      });
      mockProcessDocument.mockResolvedValueOnce([mockResponse]);

      const result = await GcpDocumentAiService.processDocument(
        mockFileBuffer,
        mockMimeType,
        mockProcessorId,
        mockLocation
      );

      expect(result.keyValues).toEqual([
        { key: 'Field1', value: 'Value1' },
        { key: 'Field2', value: '' },
        { key: 'Field3', value: '' },
      ]);
    });
  });
});