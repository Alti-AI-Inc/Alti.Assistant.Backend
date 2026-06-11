import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Writable } from 'stream';

// Mock external dependencies
const mockGcsStream = new Writable();
mockGcsStream.write = vi.fn();
mockGcsStream.end = vi.fn((cb) => {
    mockGcsStream.emit('finish');
    if (cb) cb();
});
mockGcsStream.on = vi.fn(mockGcsStream.on.bind(mockGcsStream));
mockGcsStream.destroy = vi.fn();


const mockFile = {
  createWriteStream: vi.fn().mockReturnValue(mockGcsStream),
  getSignedUrl: vi.fn().mockResolvedValue(['https://fake-signed-url.com/report.pdf']),
};

const mockBucket = {
  file: vi.fn().mockReturnValue(mockFile),
};

const mockStorage = {
  bucket: vi.fn().mockReturnValue(mockBucket),
};

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(() => mockStorage),
}));

const mockPdfDoc = {
  pipe: vi.fn(),
  fontSize: vi.fn().mockReturnThis(),
  font: vi.fn().mockReturnThis(),
  text: vi.fn().mockReturnThis(),
  moveDown: vi.fn().mockReturnThis(),
  addPage: vi.fn().mockReturnThis(),
  end: vi.fn(),
};

vi.mock('pdfkit', () => ({
  default: vi.fn(() => mockPdfDoc),
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../report.constant.js', () => ({
  EXPORT_CONFIG: {
    gcsBucketName: 'test-bucket',
    signedUrlExpiresMinutes: 15,
    maxReportSizeBytes: 1024, // 1KB for testing
    PDF: {
      margins: { top: 50, bottom: 50, left: 72, right: 72 },
      fontSize: 12,
      lineHeight: 4,
    },
  },
}));

// Dynamically import the module to be tested after mocks are set up
const {
  exportReport,
  generatePDFReport,
  generateDOCXReport,
  generateCSVReport,
  generateXLSXReport,
  generateTXTReport,
  generateMDReport,
  generateHTMLReport,
  generateJSONReport,
} = await import('./reportExporter.js');

// Since usageService is not exported, we can't spy on it.
// We will test the logic in exportReport that *uses* it,
// acknowledging the placeholder always returns { allowed: true }.

describe('reportExporter.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset PDF mock state
    Object.values(mockPdfDoc).forEach(mockFn => mockFn.mockClear());
  });

  describe('exportReport', () => {
    const mockReportData = { title: 'Test Report', content: 'Hello' };
    const mockUser = {
      id: 'user-123',
      role: 'manager',
      workspaceId: 'ws-abc',
      tenantId: 'tenant-xyz',
    };

    it('should throw an error if user context is incomplete', async () => {
      await expect(exportReport(mockReportData, 'pdf', 'test.pdf', { id: '123' })).rejects.toThrow(
        'A valid user context (including id, role, workspaceId, tenantId) must be provided.'
      );
    });
    
    it('should throw an error if user context IDs are invalid', async () => {
      const invalidUser = { id: '..', role: 'user', workspaceId: '__', tenantId: '$$' };
      await expect(exportReport(mockReportData, 'pdf', 'test.pdf', invalidUser)).rejects.toThrow(
        'Provided user context contains invalid IDs.'
      );
    });

    it('should throw an error if report data exceeds size limit', async () => {
      const largeReportData = { content: 'a'.repeat(2048) }; // EXPORT_CONFIG mock is 1024 bytes
      await expect(exportReport(largeReportData, 'pdf', 'large.pdf', mockUser)).rejects.toThrow(
        'Report data exceeds the maximum allowed size of 0MB.'
      );
    });

    it('should throw an error for an unsupported format', async () => {
      await expect(exportReport(mockReportData, 'unsupported', 'test.unsupported', mockUser)).rejects.toThrow(
        'Unsupported export format: unsupported'
      );
    });

    it('should construct the GCS object name correctly based on user context', async () => {
      await exportReport(mockReportData, 'txt', 'report.txt', mockUser);
      const expectedPath = 'reports/tenant-xyz/ws-abc/user-123/report.txt';
      expect(mockBucket.file).toHaveBeenCalledWith(expectedPath);
    });

    it('should sanitize the filename before constructing the GCS path', async () => {
      await expect(exportReport(mockReportData, 'txt', '../secret.txt', mockUser)).rejects.toThrow(
        `Invalid characters in file name: '..'. Directory traversal is not allowed.`
      );
    });

    it('should call the correct generator for each format alias', async () => {
      await exportReport(mockReportData, 'doc', 'report.doc', mockUser);
      expect(mockFile.createWriteStream).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      
      await exportReport({ data: [{a:1}] }, 'xls', 'report.xls', mockUser);
      // XLSX falls back to CSV in this implementation
      expect(mockBucket.file).toHaveBeenCalledWith(expect.stringContaining('.csv'));
    });

    it('should return a signed URL on successful generation', async () => {
      const url = await exportReport(mockReportData, 'pdf', 'report.pdf', mockUser);
      expect(url).toBe('https://fake-signed-url.com/report.pdf');
      expect(mockFile.getSignedUrl).toHaveBeenCalled();
    });

    it('should re-throw an error if the generator fails', async () => {
      const generationError = new Error('PDF generation failed');
      vi.mocked(mockPdfDoc.end).mockImplementation(() => {
        mockGcsStream.emit('error', generationError);
      });
      
      await expect(exportReport(mockReportData, 'pdf', 'fail.pdf', mockUser)).rejects.toThrow(generationError);
    });
  });

  describe('Report Generators', () => {
    const gcsObjectName = 'reports/tenant/ws/user/report';

    describe('generatePDFReport', () => {
      it('should generate a simple PDF', async () => {
        const reportData = { content: 'Simple content.' };
        generatePDFReport(reportData, `${gcsObjectName}.pdf`);
        expect(mockPdfDoc.pipe).toHaveBeenCalledWith(mockGcsStream);
        expect(mockPdfDoc.text).toHaveBeenCalledWith('Simple content.', expect.any(Object));
        expect(mockPdfDoc.end).toHaveBeenCalled();
      });

      it('should generate a PDF with title page, TOC, and sections', async () => {
        const reportData = {
          title: 'Main Title',
          subtitle: 'Sub Title',
          includeTitlePage: true,
          includeTableOfContents: true,
          sections: [
            { title: 'Section 1', content: 'Content 1' },
            { title: 'Section 2', content: 'Content 2' },
          ],
        };
        generatePDFReport(reportData, `${gcsObjectName}.pdf`);
        
        // Title Page
        expect(mockPdfDoc.text).toHaveBeenCalledWith('Main Title', { align: 'center' });
        expect(mockPdfDoc.text).toHaveBeenCalledWith('Sub Title', { align: 'center' });
        expect(mockPdfDoc.addPage).toHaveBeenCalledTimes(3); // After title, after TOC, after section 1

        // TOC
        expect(mockPdfDoc.text).toHaveBeenCalledWith('Table of Contents');
        expect(mockPdfDoc.text).toHaveBeenCalledWith('1. Section 1');
        expect(mockPdfDoc.text).toHaveBeenCalledWith('2. Section 2');

        // Sections
        expect(mockPdfDoc.text).toHaveBeenCalledWith('Section 1');
        expect(mockPdfDoc.text).toHaveBeenCalledWith('Content 1', expect.any(Object));
        expect(mockPdfDoc.text).toHaveBeenCalledWith('Section 2');
        expect(mockPdfDoc.text).toHaveBeenCalledWith('Content 2', expect.any(Object));
      });
    });

    describe('generateCSVReport', () => {
        it('should generate a valid CSV from data array', async () => {
            const reportData = {
                data: [
                    { id: 1, name: 'Test "User"', notes: 'Has, a comma', formula: '=A1+B1' },
                    { id: 2, name: 'Another User', notes: 'Line\nBreak', formula: '@evil' },
                ]
            };
            generateCSVReport(reportData, `${gcsObjectName}.csv`);
            
            const writeCalls = vi.mocked(mockGcsStream.write).mock.calls.map(c => c[0]);
            expect(writeCalls[0]).toBe('id,name,notes,formula\n');
            expect(writeCalls[1]).toBe('1,"Test ""User""","Has, a comma","\'=A1+B1"\n');
            expect(writeCalls[2]).toBe('2,"Another User","Line\nBreak","\'@evil"\n');
            expect(mockGcsStream.end).toHaveBeenCalled();
        });

        it('should handle empty or no data gracefully', () => {
            generateCSVReport({ data: [] }, `${gcsObjectName}.csv`);
            expect(mockGcsStream.write).not.toHaveBeenCalled();
            expect(mockGcsStream.end).toHaveBeenCalled();
        });
    });

    describe('generateXLSXReport', () => {
        it('should log a warning and fall back to generateCSVReport', async () => {
            const reportData = { data: [{ colA: 'val1' }] };
            await generateXLSXReport(reportData, `${gcsObjectName}.xlsx`);
            
            expect(vi.mocked(mockBucket.file)).toHaveBeenCalledWith(`${gcsObjectName}.csv`);
            expect(vi.mocked(mockGcsStream.write)).toHaveBeenCalledWith('colA\n');
            expect(vi.mocked(mockGcsStream.write)).toHaveBeenCalledWith('val1\n');
        });
    });

    describe('generateTXTReport', () => {
        it('should generate a plain text report with sections', () => {
            const reportData = {
                title: 'Title',
                sections: [{ title: 'Section 1', content: 'Content 1.' }]
            };
            generateTXTReport(reportData, `${gcsObjectName}.txt`);
            expect(mockGcsStream.write).toHaveBeenCalledWith("Title\n=====\n\n");
            expect(mockGcsStream.write).toHaveBeenCalledWith("Section 1\n---------\n\n");
            expect(mockGcsStream.write).toHaveBeenCalledWith("Content 1.\n\n");
            expect(mockGcsStream.end).toHaveBeenCalled();
        });
    });

    describe('generateMDReport', () => {
        it('should generate a markdown report with sections', () => {
            const reportData = {
                title: 'Title',
                subtitle: 'Subtitle',
                sections: [{ title: 'Section 1', content: 'Content 1.' }]
            };
            generateMDReport(reportData, `${gcsObjectName}.md`);
            expect(mockGcsStream.write).toHaveBeenCalledWith("# Title\n\n");
            expect(mockGcsStream.write).toHaveBeenCalledWith("## Subtitle\n\n");
            expect(mockGcsStream.write).toHaveBeenCalledWith("## Section 1\n\n");
            expect(mockGcsStream.write).toHaveBeenCalledWith("Content 1.\n\n");
            expect(mockGcsStream.end).toHaveBeenCalled();
        });
    });

    describe('generateHTMLReport', () => {
        it('should generate an HTML report with escaped content', () => {
            const reportData = {
                title: 'HTML <Report>',
                content: 'This is a <script>alert("XSS")</script> test.'
            };
            generateHTMLReport(reportData, `${gcsObjectName}.html`);
            const writeCalls = vi.mocked(mockGcsStream.write).mock.calls.map(c => c[0]).join('');
            
            expect(writeCalls).toContain('<title>HTML &lt;Report&gt;</title>');
            expect(writeCalls).toContain('<h1>HTML &lt;Report&gt;</h1>');
            expect(writeCalls).toContain('<p>This is a &lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; test.</p>');
        });
    });

    describe('generateJSONReport', () => {
        it('should generate a prettified JSON report', () => {
            const reportData = { key: 'value', nested: { array: [1, 2] } };
            generateJSONReport(reportData, `${gcsObjectName}.json`);
            expect(mockGcsStream.end).toHaveBeenCalledWith(JSON.stringify(reportData, null, 2));
        });
    });
    
    describe('generateDOCXReport', () => {
        it('should generate a simple text-based DOCX placeholder', () => {
            const reportData = {
                title: 'DOCX Title',
                content: 'DOCX content.'
            };
            generateDOCXReport(reportData, `${gcsObjectName}.docx`);
            expect(mockGcsStream.write).toHaveBeenCalledWith("DOCX Title\n\n");
            expect(mockGcsStream.write).toHaveBeenCalledWith("DOCX content.");
            expect(mockGcsStream.end).toHaveBeenCalled();
        });
    });
  });
});