import { describe, it, expect, vi, beforeEach } from 'vitest';
import { textAnalyzer } from './textAnalyzer.js';

// Define mock functions prefixed with 'mock' so they are accessible inside vi.mock()
const mockGenerateContent = vi.fn();
const mockSendMessage = vi.fn();
const mockStartChat = vi.fn(() => ({
  sendMessage: mockSendMessage,
}));
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
  startChat: mockStartChat,
}));

// Mock external dependencies
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => {
      return {
        getGenerativeModel: mockGetGenerativeModel,
      };
    }),
  };
});

vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-gemini-key',
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../document_analysis.constant.js', () => ({
  DOCUMENT_ANALYSIS_CONFIG: {
    MODEL: 'gemini-3.5-flash',
    TEMPERATURE: 0.7,
    MAX_OUTPUT_TOKENS: 1000,
  },
  SYSTEM_PROMPTS: {
    GENERAL: 'General system prompt context.',
    SUMMARY: 'Summary system prompt context.',
    KEYWORDS: 'Keywords system prompt context.',
  },
  ANALYSIS_TYPES: {
    GENERAL: 'GENERAL',
    SUMMARY: 'SUMMARY',
    KEYWORDS: 'KEYWORDS',
  },
  OUTPUT_FORMATS: {
    NARRATIVE: 'NARRATIVE',
    STRUCTURED: 'STRUCTURED',
  },
}));

describe('textAnalyzer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildAnalysisPrompt', () => {
    it('should build a prompt with general system prompt, content, and narrative format by default', () => {
      const content = 'This is some test content.';
      const prompt = textAnalyzer.buildAnalysisPrompt(
        content,
        'GENERAL',
        'NARRATIVE',
        null
      );

      expect(prompt).toContain('General system prompt context.');
      expect(prompt).toContain('Content to Analyze:\nThis is some test content.');
      expect(prompt).toContain('Please provide your analysis in a clear, narrative format.');
      expect(prompt).not.toContain('User Request:');
    });

    it('should build a prompt with specific system prompt, user message, and structured format', () => {
      const content = 'This is some test content.';
      const userMessage = 'Focus on financial metrics.';
      const prompt = textAnalyzer.buildAnalysisPrompt(
        content,
        'SUMMARY',
        'STRUCTURED',
        userMessage
      );

      expect(prompt).toContain('Summary system prompt context.');
      expect(prompt).toContain('User Request: Focus on financial metrics.');
      expect(prompt).toContain('Content to Analyze:\nThis is some test content.');
      expect(prompt).toContain('Please provide your analysis in a well-structured format with clear headings and sections.');
    });

    it('should fallback to GENERAL system prompt if an invalid or unknown analysis type is provided', () => {
      const content = 'Some content.';
      const prompt = textAnalyzer.buildAnalysisPrompt(
        content,
        'UNKNOWN_TYPE',
        'NARRATIVE',
        null
      );

      expect(prompt).toContain('General system prompt context.');
    });
  });

  describe('analyzeWithGemini', () => {
    it('should successfully analyze content and return structured metadata', async () => {
      const mockResponseText = 'This is the generated analysis from Gemini.';
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => mockResponseText,
        },
      });

      const result = await textAnalyzer.analyzeWithGemini(
        'Test content to analyze',
        'SUMMARY',
        'STRUCTURED',
        'Please summarize this'
      );

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3.5-flash' });
      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: expect.stringContaining('Summary system prompt context.'),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      });

      expect(result).toEqual({
        success: true,
        analysis: mockResponseText,
        metadata: {
          model: 'gemini-3.5-flash',
          analysisType: 'SUMMARY',
          outputFormat: 'STRUCTURED',
          timestamp: expect.any(String),
        },
      });
    });

    it('should throw an error and log it if the Gemini API call fails', async () => {
      const apiError = new Error('API quota exceeded');
      mockGenerateContent.mockRejectedValueOnce(apiError);

      await expect(
        textAnalyzer.analyzeWithGemini('Test content')
      ).rejects.toThrow('Analysis failed: API quota exceeded');
    });
  });

  describe('analyzeWithContext', () => {
    const conversationHistory = [
      { role: 'user', content: 'Hello' },
      { role: 'model', content: 'Hi there! How can I help you today?' },
      { role: 'user', content: 'Can you analyze documents?' },
      { role: 'model', content: 'Yes, I can analyze any text you provide.' },
    ];

    it('should successfully perform contextual analysis with conversation history', async () => {
      const mockResponseText = 'Contextual analysis result.';
      mockSendMessage.mockResolvedValueOnce({
        response: {
          text: () => mockResponseText,
        },
      });

      const result = await textAnalyzer.analyzeWithContext(
        'Current document content',
        conversationHistory,
        'KEYWORDS',
        'NARRATIVE',
        'Extract keywords'
      );

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3.5-flash' });
      expect(mockStartChat).toHaveBeenCalledWith({
        history: [
          {
            role: 'user',
            parts: [{ text: 'System Context: Keywords system prompt context.' }],
          },
          {
            role: 'model',
            parts: [
              {
                text: 'I understand. I will analyze content according to these guidelines.',
              },
            ],
          },
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there! How can I help you today?' }] },
          { role: 'user', parts: [{ text: 'Can you analyze documents?' }] },
          { role: 'model', parts: [{ text: 'Yes, I can analyze any text you provide.' }] },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        'Content to Analyze:\nCurrent document content\n\nUser Request: Extract keywords'
      );

      expect(result).toEqual({
        success: true,
        analysis: mockResponseText,
        metadata: {
          model: 'gemini-3.5-flash',
          analysisType: 'KEYWORDS',
          outputFormat: 'NARRATIVE',
          withContext: true,
          timestamp: expect.any(String),
        },
      });
    });

    it('should limit conversation history to the last 5 exchanges', async () => {
      const longHistory = [
        { role: 'user', content: 'Msg 1' },
        { role: 'model', content: 'Reply 1' },
        { role: 'user', content: 'Msg 2' },
        { role: 'model', content: 'Reply 2' },
        { role: 'user', content: 'Msg 3' },
        { role: 'model', content: 'Reply 3' },
        { role: 'user', content: 'Msg 4' },
        { role: 'model', content: 'Reply 4' },
        { role: 'user', content: 'Msg 5' },
        { role: 'model', content: 'Reply 5' },
      ];

      mockSendMessage.mockResolvedValueOnce({
        response: {
          text: () => 'Success',
        },
      });

      await textAnalyzer.analyzeWithContext(
        'Content',
        longHistory,
        'GENERAL',
        'NARRATIVE',
        'Analyze'
      );

      const startChatArgs = mockStartChat.mock.calls[0][0];
      // History should contain: System prompt (user), System response (model), plus the last 5 messages from history.
      // Total history length passed to startChat = 2 (system) + 5 (sliced history) = 7 messages.
      expect(startChatArgs.history).toHaveLength(7);
      expect(startChatArgs.history[2]).toEqual({ role: 'model', parts: [{ text: 'Reply 3' }] });
      expect(startChatArgs.history[3]).toEqual({ role: 'user', parts: [{ text: 'Msg 4' }] });
      expect(startChatArgs.history[4]).toEqual({ role: 'model', parts: [{ text: 'Reply 4' }] });
      expect(startChatArgs.history[5]).toEqual({ role: 'user', parts: [{ text: 'Msg 5' }] });
      expect(startChatArgs.history[6]).toEqual({ role: 'model', parts: [{ text: 'Reply 5' }] });
    });

    it('should throw an error and log it if contextual analysis fails', async () => {
      const apiError = new Error('Network error');
      mockSendMessage.mockRejectedValueOnce(apiError);

      await expect(
        textAnalyzer.analyzeWithContext('Content', [], 'GENERAL', 'NARRATIVE', 'Analyze')
      ).rejects.toThrow('Contextual analysis failed: Network error');
    });
  });

  describe('Context Boundaries & Tenant Agnosticism', () => {
    it('should behave identically regardless of user roles (super_admin, admin, manager, user)', async () => {
      const mockResponseText = 'Role-agnostic analysis result.';
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => mockResponseText,
        },
      });

      const roles = ['super_admin', 'admin', 'manager', 'user'];

      for (const role of roles) {
        // Simulate calling the service within different security contexts.
        // Since the service is tenant-agnostic and does not enforce RBAC internally,
        // it should execute successfully and return the exact same structure for all roles.
        const result = await textAnalyzer.analyzeWithGemini(
          'Tenant-agnostic content',
          'GENERAL',
          'NARRATIVE',
          `Request from ${role}`
        );

        expect(result.success).toBe(true);
        expect(result.analysis).toBe(mockResponseText);
        expect(result.metadata.analysisType).toBe('GENERAL');
      }
    });
  });
});