import { logger } from '../../../../shared/logger.js';

/**
 * Generate report title from content
 */
export const generateTitleFromContent = (content) => {
  if (!content) return 'Untitled Report';

  // Take first meaningful sentence or first 60 characters
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length > 60) {
    return firstLine.substring(0, 57) + '...';
  }
  return firstLine || 'Untitled Report';
};

/**
 * Extract structured data from CSV content
 */
export const extractCSVData = (csvContent) => {
  try {
    const lines = csvContent.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return { headers: [], data: [] };

    const headers = lines[0].split(',').map((h) => h.trim());
    const data = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    return { headers, data };
  } catch (error) {
    logger.error('Error extracting CSV data:', error);
    return { headers: [], data: [] };
  }
};

/**
 * Format file information for AI prompt
 */
export const formatFileInfo = (files) => {
  if (!files || files.length === 0) return '';

  return files
    .map((file, index) => {
      return `File ${index + 1}: ${file.filename} (${file.metadata?.type || 'unknown'} format, ${file.content?.length || 0} characters)`;
    })
    .join('\n');
};

/**
 * Clean and normalize text content
 */
export const normalizeContent = (content) => {
  if (!content) return '';

  return content
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\t/g, '    ') // Replace tabs with spaces
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();
};

/**
 * Estimate reading time for content
 */
export const estimateReadingTime = (content) => {
  if (!content) return 0;

  const wordsPerMinute = 200;
  const words = content.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
};

/**
 * Generate summary statistics for data
 */
export const generateDataStats = (data) => {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const stats = {
    rowCount: data.length,
    columnCount: Object.keys(data[0] || {}).length,
    columns: Object.keys(data[0] || {}),
  };

  // Calculate numeric column statistics
  stats.columns.forEach((col) => {
    const values = data
      .map((row) => row[col])
      .filter((v) => v && !isNaN(v))
      .map(Number);

    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      const sorted = [...values].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median =
        sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];

      stats[col] = { min, max, mean, median, count: values.length };
    }
  });

  return stats;
};

/**
 * Validate report parameters
 */
export const validateReportParams = (params) => {
  const errors = [];

  if (!params.content && !params.files) {
    errors.push('Either content or files must be provided');
  }

  if (
    params.outputFormat &&
    ![
      'pdf',
      'docx',
      'doc',
      'csv',
      'xlsx',
      'txt',
      'md',
      'html',
      'json',
    ].includes(params.outputFormat.toLowerCase())
  ) {
    errors.push('Invalid output format');
  }

  if (
    params.reportType &&
    ![
      'executive_summary',
      'analytical',
      'financial',
      'technical',
      'research',
      'business',
      'comparison',
      'custom',
    ].includes(params.reportType)
  ) {
    errors.push('Invalid report type');
  }

  if (
    params.tone &&
    ![
      'professional',
      'formal',
      'technical',
      'casual',
      'academic',
      'persuasive',
    ].includes(params.tone)
  ) {
    errors.push('Invalid tone');
  }

  return { isValid: errors.length === 0, errors };
};

/**
 * Generate report metadata
 */
export const generateReportMetadata = (params) => {
  return {
    generatedAt: new Date().toISOString(),
    generator: 'ASON Report Generation Module',
    version: '1.0.0',
    reportType: params.reportType || 'custom',
    outputFormat: params.outputFormat || 'pdf',
    tone: params.tone || 'professional',
    wordCount: params.content ? params.content.split(/\s+/).length : 0,
    estimatedReadingTime: estimateReadingTime(params.content || ''),
  };
};

/**
 * Split long content into sections
 */
export const splitContentIntoSections = (content, maxSectionLength = 5000) => {
  if (!content || content.length <= maxSectionLength) {
    return [{ title: 'Content', content }];
  }

  const sections = [];
  const paragraphs = content.split(/\n\n+/);
  let currentSection = '';
  let sectionIndex = 1;

  paragraphs.forEach((paragraph) => {
    if (
      currentSection.length + paragraph.length > maxSectionLength &&
      currentSection.length > 0
    ) {
      sections.push({
        title: `Section ${sectionIndex}`,
        content: currentSection.trim(),
      });
      currentSection = paragraph;
      sectionIndex++;
    } else {
      currentSection += (currentSection ? '\n\n' : '') + paragraph;
    }
  });

  if (currentSection) {
    sections.push({
      title: `Section ${sectionIndex}`,
      content: currentSection.trim(),
    });
  }

  return sections;
};

/**
 * Format date for report
 */
export const formatReportDate = (date = new Date()) => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Generate file-safe filename
 */
export const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-z0-9_\-.]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};

/**
 * Calculate confidence score for AI-generated content
 */
export const calculateConfidenceScore = (params) => {
  let score = 0.5; // Base score

  // Increase score based on available parameters
  if (params.content && params.content.length > 500) score += 0.1;
  if (params.title) score += 0.1;
  if (params.reportType) score += 0.1;
  if (params.sections && params.sections.length > 0) score += 0.1;
  if (params.customInstructions) score += 0.1;

  return Math.min(score, 1.0);
};

export default {
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
};
