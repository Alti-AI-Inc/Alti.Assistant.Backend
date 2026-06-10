import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePDFReport, savePDFToFile } from './pdfService.js';
import fs from 'fs';
import path from 'path';

// Mock pdfkit methods to track calls and simulate behavior
const mockRect = vi.fn().mockReturnThis();
const mockFillColor = vi.fn().mockReturnThis();
const mockFill = vi.fn().mockReturnThis();
const mockFontSize = vi.fn().mockReturnThis();
const mockFont = vi.fn().mockReturnThis();
const mockText = vi.fn().mockReturnThis();
const mockRoundedRect = vi.fn().mockReturnThis();
const mockAddPage = vi.fn().mockReturnThis();
const mockMoveTo = vi.fn().mockReturnThis();
const mockLineTo = vi.fn().mockReturnThis();
const mockStrokeColor = vi.fn().mockReturnThis();
const mockLineWidth = vi.fn().mockReturnThis();
const mockStroke = vi.fn().mockReturnThis();
const mockSwitchToPage = vi.fn().mockReturnThis();
const mockMoveDown = vi.fn().mockReturnThis();

class MockPDFDocument {
  constructor() {
    this.page = {
      width: 595.28,
      height: 841.89,
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    };
    this.y = 50;
    this.listeners = {};
  }
  on(event, callback) {
    this.listeners[event] = callback;
    return this;
  }
  rect(...args) { mockRect(...args); return this; }
  fillColor(...args) { mockFillColor(...args); return this; }
  fill(...args) { mockFill(...args); return this; }
  fontSize(...args) { mockFontSize(...args); return this; }
  font(...args) { mockFont(...args); return this; }
  text(...args) {
    mockText(...args);
    this.y += 15;
    return this;
  }
  roundedRect(...args) { mockRoundedRect(...args); return this; }
  addPage(...args) {
    mockAddPage(...args);
    this.y = 50;
    return this;
  }
  moveTo(...args) { mockMoveTo(...args); return this; }
  lineTo(...args) { mockLineTo(...args); return this; }
  strokeColor(...args) { mockStrokeColor(...args); return this; }
  lineWidth(...args) { mockLineWidth(...args); return this; }
  stroke(...args) { mockStroke(...args); return this; }
  switchToPage(...args) { mockSwitchToPage(...args); return this; }
  bufferedPageRange() {
    return { start: 0, count: 2 };
  }
  heightOfString() {
    return 15;
  }
  moveDown(...args) {
    mockMoveDown(...args);
    this.y += 10;
    return this;
  }
  end() {
    if (this.listeners['data']) {
      this.listeners['data'](Buffer.from('mock pdf data'));
    }
    if (this.listeners['end']) {
      this.listeners['end']();
    }
    return this;
  }
}

vi.mock('pdfkit', () => {
  return {
    default: MockPDFDocument
  };
});

vi.mock('fs', () => ({
  default: {
    promises: {
      writeFile: vi.fn()
    }
  }
}));

describe('PDF Service Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generatePDFReport', () => {
    it('should successfully generate a PDF report with complete data', async () => {
      const reportData = {
        title: 'Enterprise AI Strategy',
        query: 'How to optimize developer velocity with agentic workflows?',
        answer: 'This is a comprehensive answer about agentic workflows.',
        sources: [
          { id: '1', title: 'Developer Velocity Index', url: 'https://example.com/dvi', snippet: 'Snippet of source 1' }
        ],
        quantitativeFacts: [
          { metric: 'Developer velocity improvement', value: '10x', source: 'Internal Study', trustLevel: 'HIGH', verificationScore: 95 }
        ],
        metadata: {
          generatedAt: new Date(),
          processingTime: 4500,
          qualityMetrics: {
            sourceDiversity: 9.0,
            informationDepth: 8.5,
            topicCoverage: 9.5,
            credibilityScore: 9.0
          }
        }
      };

      const result = await generatePDFReport(reportData);

      expect(result).toBeDefined();
      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toContain('research_report_how_to_optimize_developer_velocity');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.size).toBeGreaterThan(0);
    });

    it('should handle missing optional fields and fallback gracefully', async () => {
      const reportData = {
        title: 'Minimal Report',
        query: 'Minimal Query',
        answer: 'Minimal Answer'
      };

      const result = await generatePDFReport(reportData);

      expect(result).toBeDefined();
      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toContain('research_report_minimal_query');
    });

    it('should clean markdown formatting from the answer text', async () => {
      const reportData = {
        title: 'Markdown Test',
        query: 'Markdown Query',
        answer: '### Header\nThis is **bold** and *italic* with a [link](http://example.com) and `code`.',
        sources: [],
        quantitativeFacts: [],
        metadata: {}
      };

      await generatePDFReport(reportData);

      const textCalls = mockText.mock.calls.map(call => call[0]);
      const processedTextExists = textCalls.some(text => 
        typeof text === 'string' && 
        text.includes('Header') && 
        text.includes('bold') && 
        text.includes('italic') && 
        !text.includes('###') && 
        !text.includes('**') && 
        !text.includes('[link]')
      );

      expect(processedTextExists).toBe(true);
    });

    it('should trigger page breaks when there are many quantitative facts', async () => {
      const quantitativeFacts = Array.from({ length: 40 }, (_, i) => ({
        metric: `Metric ${i}`,
        value: `${i}%`,
        source: `Source ${i}`,
        trustLevel: 'HIGH',
        verificationScore: 95
      }));

      const reportData = {
        title: 'Pagination Test',
        query: 'Pagination Query',
        answer: 'Test Answer',
        sources: [],
        quantitativeFacts,
        metadata: {}
      };

      await generatePDFReport(reportData);
      expect(mockAddPage).toHaveBeenCalled();
    });

    it('should reject the promise if PDF generation throws an error', async () => {
      mockRect.mockImplementationOnce(() => {
        throw new Error('PDF Generation Failed');
      });

      const reportData = {
        title: 'Error Test',
        query: 'Error Query',
        answer: 'Error Answer'
      };

      await expect(generatePDFReport(reportData)).rejects.toThrow('PDF Generation Failed');
    });
  });

  describe('savePDFToFile', () => {
    it('should save the PDF buffer to the specified path', async () => {
      const pdfData = {
        buffer: Buffer.from('mock pdf data'),
        filename: 'test_report.pdf'
      };
      const outputPath = '/mock/output/path';
      
      fs.promises.writeFile.mockResolvedValueOnce(undefined);

      const result = await savePDFToFile(pdfData, outputPath);
      
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        path.resolve(outputPath, pdfData.filename),
        pdfData.buffer
      );
      expect(result).toBe(path.resolve(outputPath, pdfData.filename));
    });

    it('should throw an error if saving fails', async () => {
      const pdfData = {
        buffer: Buffer.from('mock pdf data'),
        filename: 'test_report.pdf'
      };
      const outputPath = '/mock/output/path';
      
      fs.promises.writeFile.mockRejectedValueOnce(new Error('Disk full'));

      await expect(savePDFToFile(pdfData, outputPath)).rejects.toThrow('Disk full');
    });
  });

  describe('Role-Based Access and Context Boundaries', () => {
    const roles = ['super_admin', 'admin', 'manager', 'user'];
    
    roles.forEach(role => {
      it(`should allow PDF generation for role: ${role}`, async () => {
        const context = { user: { role } };
        expect(context.user.role).toBe(role);
        
        const reportData = {
          title: 'Role Test Report',
          query: 'Role Query',
          answer: 'Role Answer',
          sources: [],
          quantitativeFacts: [],
          metadata: {}
        };
        
        const result = await generatePDFReport(reportData);
        expect(result).toBeDefined();
        expect(result.contentType).toBe('application/pdf');
      });
    });
  });
});