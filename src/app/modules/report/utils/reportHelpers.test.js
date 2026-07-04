import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateTitleFromContent,
  extractCSVData,
  formatFileInfo,
  normalizeContent,
  estimateReadingTime,
  generateDataStats,
  validateReportParams,
  generateReportMetadata,
  splitContentIntoSections,
  formatReportDate,
  sanitizeFilename,
  calculateConfidenceScore,
} from './reportHelpers.js';
import { logger } from '../../../../shared/logger.js';

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('reportHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateTitleFromContent', () => {
    it('should return "Untitled Report" for null or empty content', () => {
      expect(generateTitleFromContent(null)).toBe('Untitled Report');
      expect(generateTitleFromContent(undefined)).toBe('Untitled Report');
      expect(generateTitleFromContent('')).toBe('Untitled Report');
    });

    it('should use the first line if it is short enough', () => {
      const content = 'This is a short title.\nThis is the rest of the content.';
      expect(generateTitleFromContent(content)).toBe('This is a short title.');
    });

    it('should truncate the first line if it is too long', () => {
      const longLine = 'This is a very long title that definitely exceeds the sixty character limit for sure.';
      const expected = 'This is a very long title that definitely exceeds the six...';
      expect(generateTitleFromContent(longLine)).toBe(expected);
    });

    it('should trim whitespace from the title', () => {
      const content = '  A title with whitespace  \nMore content.';
      expect(generateTitleFromContent(content)).toBe('A title with whitespace');
    });

    it('should return "Untitled Report" if the first line is only whitespace', () => {
      const content = '   \nContent starts on the second line.';
      expect(generateTitleFromContent(content)).toBe('Untitled Report');
    });
  });

  describe('extractCSVData', () => {
    it('should return empty arrays for empty or invalid content', () => {
      expect(extractCSVData('')).toEqual({ headers: [], data: [] });
      expect(extractCSVData(null)).toEqual({ headers: [], data: [] });
      expect(extractCSVData('  \n  ')).toEqual({ headers: [], data: [] });
    });

    it('should correctly parse valid CSV content', () => {
      const csvContent = 'name,age,city\nJohn,30,New York\nJane,25,London';
      const expected = {
        headers: ['name', 'age', 'city'],
        data: [
          { name: 'John', age: '30', city: 'New York' },
          { name: 'Jane', age: '25', city: 'London' },
        ],
      };
      expect(extractCSVData(csvContent)).toEqual(expected);
    });

    it('should handle CSV with extra whitespace', () => {
      const csvContent = ' name , age,city \n John ,30, New York ';
      const expected = {
        headers: ['name', 'age', 'city'],
        data: [{ name: 'John', age: '30', city: 'New York' }],
      };
      expect(extractCSVData(csvContent)).toEqual(expected);
    });

    it('should handle rows with missing values', () => {
      const csvContent = 'id,name,value\n1,A,100\n2,B,\n3,,300';
      const expected = {
        headers: ['id', 'name', 'value'],
        data: [
          { id: '1', name: 'A', value: '100' },
          { id: '2', name: 'B', value: '' },
          { id: '3', name: '', value: '300' },
        ],
      };
      expect(extractCSVData(csvContent)).toEqual(expected);
    });

    it('should log an error and return empty arrays if parsing fails', () => {
      const malformed = {
        split: vi.fn().mockImplementation(() => {
          throw new Error('Test error');
        }),
      };
      const result = extractCSVData(malformed);
      expect(logger.error).toHaveBeenCalledWith('Error extracting CSV data:', expect.any(Error));
      expect(result).toEqual({ headers: [], data: [] });
    });
  });

  describe('formatFileInfo', () => {
    it('should return an empty string for null or empty file array', () => {
      expect(formatFileInfo(null)).toBe('');
      expect(formatFileInfo([])).toBe('');
    });

    it('should format a single file correctly', () => {
      const files = [
        {
          filename: 'report.pdf',
          metadata: { type: 'pdf' },
          content: 'This is a test.',
        },
      ];
      expect(formatFileInfo(files)).toBe('File 1: report.pdf (pdf format, 15 characters)');
    });

    it('should format multiple files correctly, separated by newlines', () => {
      const files = [
        {
          filename: 'data.csv',
          metadata: { type: 'csv' },
          content: 'a,b,c',
        },
        {
          filename: 'notes.txt',
          metadata: { type: 'txt' },
          content: 'some notes',
        },
      ];
      const expected = 'File 1: data.csv (csv format, 5 characters)\nFile 2: notes.txt (txt format, 10 characters)';
      expect(formatFileInfo(files)).toBe(expected);
    });

    it('should handle missing metadata and content gracefully', () => {
      const files = [
        { filename: 'file1.zip' },
        { filename: 'file2.doc', metadata: {} },
      ];
      const expected = 'File 1: file1.zip (unknown format, 0 characters)\nFile 2: file2.doc (unknown format, 0 characters)';
      expect(formatFileInfo(files)).toBe(expected);
    });
  });

  describe('normalizeContent', () => {
    it('should return an empty string for null or undefined input', () => {
      expect(normalizeContent(null)).toBe('');
      expect(normalizeContent(undefined)).toBe('');
    });

    it('should normalize line endings from CRLF to LF', () => {
      expect(normalizeContent('line1\r\nline2')).toBe('line1\nline2');
    });

    it('should replace tabs with 4 spaces', () => {
      expect(normalizeContent('col1\tcol2')).toBe('col1    col2');
    });

    it('should limit consecutive newlines to a maximum of two', () => {
      expect(normalizeContent('para1\n\n\npara2\n\n\n\npara3')).toBe('para1\n\npara2\n\npara3');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeContent('  \n content \t ')).toBe('content');
    });

    it('should perform all normalizations together', () => {
      const raw = ' \r\n  First line.\tItem\r\n\r\n\r\n\r\nSecond line.  ';
      const expected = 'First line.    Item\n\nSecond line.';
      expect(normalizeContent(raw)).toBe(expected);
    });
  });

  describe('estimateReadingTime', () => {
    it('should return 0 for empty or null content', () => {
      expect(estimateReadingTime(null)).toBe(0);
      expect(estimateReadingTime('')).toBe(0);
    });

    it('should calculate reading time correctly, rounding up', () => {
      const text200words = Array(200).fill('word').join(' ');
      const text201words = Array(201).fill('word').join(' ');
      const text399words = Array(399).fill('word').join(' ');
      const text400words = Array(400).fill('word').join(' ');

      expect(estimateReadingTime('A short sentence.')).toBe(1);
      expect(estimateReadingTime(text200words)).toBe(1);
      expect(estimateReadingTime(text201words)).toBe(2);
      expect(estimateReadingTime(text399words)).toBe(2);
      expect(estimateReadingTime(text400words)).toBe(2);
    });
  });

  describe('generateDataStats', () => {
    it('should return null for invalid or empty data', () => {
      expect(generateDataStats(null)).toBeNull();
      expect(generateDataStats([])).toBeNull();
      expect(generateDataStats('not an array')).toBeNull();
    });

    it('should generate basic stats for any data', () => {
      const data = [
        { name: 'A', category: 'X' },
        { name: 'B', category: 'Y' },
      ];
      const stats = generateDataStats(data);
      expect(stats.rowCount).toBe(2);
      expect(stats.columnCount).toBe(2);
      expect(stats.columns).toEqual(['name', 'category']);
    });

    it('should generate detailed stats for numeric columns', () => {
      const data = [
        { id: '1', value: '10', score: '8.5' },
        { id: '2', value: '20', score: '9.5' },
        { id: '3', value: '5', score: '7.0' },
        { id: '4', value: '15', score: '8.0' },
      ];
      const stats = generateDataStats(data);
      expect(stats.id).toBeDefined();
      expect(stats.id.min).toBe(1);
      expect(stats.id.max).toBe(4);
      expect(stats.id.mean).toBe(2.5);
      expect(stats.id.median).toBe(2.5); // (2+3)/2
      expect(stats.id.count).toBe(4);

      expect(stats.value).toBeDefined();
      expect(stats.value.min).toBe(5);
      expect(stats.value.max).toBe(20);
      expect(stats.value.mean).toBe(12.5);
      expect(stats.value.median).toBe(12.5); // (10+15)/2
      expect(stats.value.count).toBe(4);
    });

    it('should ignore non-numeric values in numeric columns', () => {
      const data = [
        { value: '10' },
        { value: 'N/A' },
        { value: '30' },
        { value: null },
        { value: '20' },
      ];
      const stats = generateDataStats(data);
      expect(stats.value.min).toBe(10);
      expect(stats.value.max).toBe(30);
      expect(stats.value.mean).toBe(20);
      expect(stats.value.median).toBe(20); // sorted [10, 20, 30]
      expect(stats.value.count).toBe(3);
    });

    it('should not generate stats for purely non-numeric columns', () => {
      const data = [{ name: 'A' }, { name: 'B' }];
      const stats = generateDataStats(data);
      expect(stats.name).toBeUndefined();
    });
  });

  describe('validateReportParams', () => {
    it('should be valid if content is provided', () => {
      const { isValid, errors } = validateReportParams({ content: 'test' });
      expect(isValid).toBe(true);
      expect(errors).toEqual([]);
    });

    it('should be valid if files are provided', () => {
      const { isValid, errors } = validateReportParams({ files: [{}] });
      expect(isValid).toBe(true);
      expect(errors).toEqual([]);
    });

    it('should be invalid if neither content nor files are provided', () => {
      const { isValid, errors } = validateReportParams({});
      expect(isValid).toBe(false);
      expect(errors).toContain('Either content or files must be provided');
    });

    it('should be invalid for an unknown outputFormat', () => {
      const { isValid, errors } = validateReportParams({ content: 'c', outputFormat: 'xyz' });
      expect(isValid).toBe(false);
      expect(errors).toContain('Invalid output format');
    });

    it('should be valid for a known outputFormat (case-insensitive)', () => {
      const { isValid } = validateReportParams({ content: 'c', outputFormat: 'PDF' });
      expect(isValid).toBe(true);
    });

    it('should be invalid for an unknown reportType', () => {
      const { isValid, errors } = validateReportParams({ content: 'c', reportType: 'gossip' });
      expect(isValid).toBe(false);
      expect(errors).toContain('Invalid report type');
    });

    it('should be invalid for an unknown tone', () => {
      const { isValid, errors } = validateReportParams({ content: 'c', tone: 'sarcastic' });
      expect(isValid).toBe(false);
      expect(errors).toContain('Invalid tone');
    });

    it('should accumulate all errors', () => {
      const { isValid, errors } = validateReportParams({
        outputFormat: 'xyz',
        reportType: 'gossip',
        tone: 'sarcastic',
      });
      expect(isValid).toBe(false);
      expect(errors).toHaveLength(4);
      expect(errors).toEqual([
        'Either content or files must be provided',
        'Invalid output format',
        'Invalid report type',
        'Invalid tone',
      ]);
    });
  });

  describe('generateReportMetadata', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-10-27T10:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should use default values for missing params', () => {
      const metadata = generateReportMetadata({});
      expect(metadata.reportType).toBe('custom');
      expect(metadata.outputFormat).toBe('pdf');
      expect(metadata.tone).toBe('professional');
      expect(metadata.wordCount).toBe(0);
      expect(metadata.estimatedReadingTime).toBe(0);
    });

    it('should use provided params', () => {
      const params = {
        reportType: 'financial',
        outputFormat: 'xlsx',
        tone: 'formal',
        content: 'word '.repeat(300),
      };
      const metadata = generateReportMetadata(params);
      expect(metadata.reportType).toBe('financial');
      expect(metadata.outputFormat).toBe('xlsx');
      expect(metadata.tone).toBe('formal');
      expect(metadata.wordCount).toBe(300);
      expect(metadata.estimatedReadingTime).toBe(2);
    });

    it('should generate correct timestamp and generator info', () => {
      const metadata = generateReportMetadata({});
      expect(metadata.generatedAt).toBe('2023-10-27T10:00:00.000Z');
      expect(metadata.generator).toBe('Alti Assistant Report Generation Module');
      expect(metadata.version).toBe('1.0.0');
    });
  });

  describe('splitContentIntoSections', () => {
    const para1 = 'This is the first paragraph. It is quite long.';
    const para2 = 'This is the second paragraph. It is also quite long.';
    const para3 = 'This is the third paragraph, which is shorter.';

    it('should not split content shorter than the max length', () => {
      const content = 'Short content.';
      const sections = splitContentIntoSections(content, 100);
      expect(sections).toHaveLength(1);
      expect(sections[0].title).toBe('Content');
      expect(sections[0].content).toBe(content);
    });

    it('should return a single section for null content', () => {
        const sections = splitContentIntoSections(null, 100);
        expect(sections).toHaveLength(1);
        expect(sections[0].title).toBe('Content');
        expect(sections[0].content).toBe(null);
    });

    it('should split long content into multiple sections by paragraph', () => {
      const content = `${para1}\n\n${para2}\n\n${para3}`;
      const sections = splitContentIntoSections(content, 100);
      expect(sections).toHaveLength(2);
      expect(sections[0].title).toBe('Section 1');
      expect(sections[0].content).toBe(`${para1}\n\n${para2}`);
      expect(sections[1].title).toBe('Section 2');
      expect(sections[1].content).toBe(para3);
    });

    it('should handle a paragraph that itself exceeds the max length', () => {
      const longParagraph = 'word '.repeat(100);
      const content = `${longParagraph}\n\n${para2}`;
      const sections = splitContentIntoSections(content, 100);
      expect(sections).toHaveLength(2);
      expect(sections[0].title).toBe('Section 1');
      expect(sections[0].content).toBe(longParagraph);
      expect(sections[1].title).toBe('Section 2');
      expect(sections[1].content).toBe(para2);
    });

    it('should correctly handle the last paragraph', () => {
      const content = `${para1}\n\n${para2}`;
      const sections = splitContentIntoSections(content, 60);
      expect(sections).toHaveLength(2);
      expect(sections[0].content).toBe(para1);
      expect(sections[1].content).toBe(para2);
    });
  });

  describe('formatReportDate', () => {
    it('should format a given date correctly', () => {
      const date = new Date('2023-01-15T12:00:00.000Z');
      expect(formatReportDate(date)).toBe('January 15, 2023');
    });

    it('should format the current date if none is provided', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-07-26T10:00:00.000Z'));
      expect(formatReportDate()).toBe('July 26, 2024');
      vi.useRealTimers();
    });
  });

  describe('sanitizeFilename', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeFilename('MyReport.PDF')).toBe('myreport.pdf');
    });

    it('should replace invalid characters with underscores', () => {
      expect(sanitizeFilename('file/with?invalid*chars:1.txt')).toBe('file_with_invalid_chars_1.txt');
    });

    it('should replace multiple invalid characters with a single underscore', () => {
      expect(sanitizeFilename('file???name.txt')).toBe('file_name.txt');
    });

    it('should allow hyphens, underscores, and periods', () => {
      expect(sanitizeFilename('my_file-v1.2.json')).toBe('my_file-v1.2.json');
    });
  });

  describe('calculateConfidenceScore', () => {
    it('should return the base score for empty params', () => {
      expect(calculateConfidenceScore({})).toBe(0.5);
    });

    it('should increase score for long content', () => {
      const content = 'a'.repeat(501);
      expect(calculateConfidenceScore({ content })).toBe(0.6);
    });

    it('should not increase score for short content', () => {
      const content = 'a'.repeat(500);
      expect(calculateConfidenceScore({ content })).toBe(0.5);
    });

    it('should increase score for title', () => {
      expect(calculateConfidenceScore({ title: 'A Title' })).toBe(0.6);
    });

    it('should increase score for reportType', () => {
      expect(calculateConfidenceScore({ reportType: 'financial' })).toBe(0.6);
    });

    it('should increase score for sections', () => {
      expect(calculateConfidenceScore({ sections: [{}] })).toBe(0.6);
    });

    it('should increase score for customInstructions', () => {
      expect(calculateConfidenceScore({ customInstructions: 'Do this' })).toBe(0.6);
    });

    it('should accumulate scores correctly', () => {
      const params = {
        content: 'a'.repeat(501),
        title: 'A Title',
        reportType: 'financial',
      };
      expect(calculateConfidenceScore(params)).toBe(0.8);
    });

    it('should cap the score at 1.0', () => {
      const params = {
        content: 'a'.repeat(501),
        title: 'A Title',
        reportType: 'financial',
        sections: [{}],
        customInstructions: 'Do this',
      };
      expect(calculateConfidenceScore(params)).toBe(1.0);

      const extraParams = { ...params, another: 'param' };
      expect(calculateConfidenceScore(extraParams)).toBe(1.0);
    });
  });
});