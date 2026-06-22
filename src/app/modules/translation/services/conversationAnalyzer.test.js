import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockInvoke = vi.fn();
const {
  mockChatGoogleGenerativeAI
} = vi.hoisted(() => {
  const mockChatGoogleGenerativeAI = vi.fn().mockImplementation(function() {
    return {
      invoke: mockInvoke,
    };
  });

  return {
    mockChatGoogleGenerativeAI
  };
});

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI,
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-api-key',
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Dynamically import the module to ensure mocks are applied before instantiation
const { conversationAnalyzer } = await import('./conversationAnalyzer.js');
const ConversationAnalyzer = conversationAnalyzer.constructor;

describe('ConversationAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize two ChatGoogleGenerativeAI models with correct configurations', () => {
      mockChatGoogleGenerativeAI.mockClear();
      new ConversationAnalyzer();
      expect(mockChatGoogleGenerativeAI).toHaveBeenCalledTimes(2);

      // Check the primary model config
      expect(mockChatGoogleGenerativeAI).toHaveBeenNthCalledWith(1, {
        model: 'gemini-3.5-flash',
        apiKey: 'test-api-key',
        temperature: 0.3,
        maxOutputTokens: 2048,
      });

      // Check the summarizer model config
      expect(mockChatGoogleGenerativeAI).toHaveBeenNthCalledWith(2, {
        model: 'gemini-3.5-flash',
        apiKey: 'test-api-key',
        temperature: 0.5,
        maxOutputTokens: 1000,
      });
    });
  });

  describe('analyzeIntent', () => {
    it('should correctly analyze a simple translation request', async () => {
      const mockResponse = {
        intent: 'translate_text',
        extractedParams: {
          text: 'hello world',
          targetLanguage: 'fr',
          sourceLanguage: 'en',
        },
        missingParams: [],
        needsMoreInfo: false,
        followUpQuestion: null,
        assistantResponse: 'Sure, I can translate that for you.',
        confidence: 0.95,
      };
      mockInvoke.mockResolvedValue({ content: JSON.stringify(mockResponse) });

      const result = await conversationAnalyzer.analyzeIntent("Translate 'hello world' to French");

      expect(result).toEqual(mockResponse);
      expect(mockInvoke).toHaveBeenCalledOnce();
      const prompt = mockInvoke.mock.calls[0][0];
      expect(prompt).toContain('Current user message: "Translate \'hello world\' to French"');
      expect(prompt).toContain('"intent": "translate_text|translate_file|detect_language|get_supported_languages|general_question"');
    });

    it('should normalize language codes in the response', async () => {
      const mockResponse = {
        intent: 'translate_text',
        extractedParams: {
          targetLanguage: 'Spanish',
          sourceLanguage: 'English',
        },
        missingParams: ['text'],
        needsMoreInfo: true,
        assistantResponse: 'What text would you like to translate to Spanish?',
        confidence: 0.9,
      };
      mockInvoke.mockResolvedValue({ content: JSON.stringify(mockResponse) });

      const result = await conversationAnalyzer.analyzeIntent('Translate to Spanish from English');

      expect(result.extractedParams.targetLanguage).toBe('es');
      expect(result.extractedParams.sourceLanguage).toBe('en');
    });

    it('should handle conversation history and existing parameters in the prompt', async () => {
      const conversationHistory = [{ role: 'user', content: 'I need a translation' }];
      const existingParams = { sourceLanguage: 'en' };
      const mockResponse = {
        intent: 'translate_text',
        extractedParams: { sourceLanguage: 'en', targetLanguage: 'de' },
        missingParams: ['text'],
        needsMoreInfo: true,
        assistantResponse: 'What text should I translate to German?',
        confidence: 0.88,
      };
      mockInvoke.mockResolvedValue({ content: JSON.stringify(mockResponse) });

      await conversationAnalyzer.analyzeIntent('to German', conversationHistory, existingParams);

      expect(mockInvoke).toHaveBeenCalledOnce();
      const prompt = mockInvoke.mock.calls[0][0];
      expect(prompt).toContain('Recent conversation:\nuser: I need a translation');
      expect(prompt).toContain('Parameters collected so far:');
      expect(prompt).toContain('"sourceLanguage": "en"');
      expect(prompt).toContain('Current user message: "to German"');
    });

    it('should use conversation summary if threshold is exceeded', async () => {
      const longContent = 'A'.repeat(21000); // ~5250 tokens, exceeding 5000 threshold
      const conversationHistory = [{ role: 'user', content: longContent }];
      const existingParams = {};
      
      // First call for summarizeConversation, second for analyzeIntent
      mockInvoke.mockResolvedValueOnce({ content: 'User wants to translate something.' });
      mockInvoke.mockResolvedValueOnce({ content: JSON.stringify({ intent: 'general_question' }) });

      await conversationAnalyzer.analyzeIntent('Okay, now what?', conversationHistory, existingParams);

      expect(mockInvoke).toHaveBeenCalledTimes(2);
      const analyzePrompt = mockInvoke.mock.calls[1][0];
      expect(analyzePrompt).toContain('Previous conversation summary:\nUser wants to translate something.');
      expect(analyzePrompt).not.toContain('Recent conversation:');
    });

    it('should return a fallback response if the model invocation fails', async () => {
      mockInvoke.mockRejectedValue(new Error('API Error'));

      const result = await conversationAnalyzer.analyzeIntent('Translate this');

      expect(result).toEqual({
        intent: 'general_question',
        extractedParams: {},
        missingParams: ['targetLanguage'],
        needsMoreInfo: true,
        followUpQuestion: 'What language would you like to translate to?',
        assistantResponse: 'I can help you translate text or documents. Please specify the target language.',
        confidence: 0.3,
      });
    });

    it('should return a fallback response if the model returns invalid JSON', async () => {
      mockInvoke.mockResolvedValue({ content: 'This is not a valid JSON response.' });

      const result = await conversationAnalyzer.analyzeIntent('Translate this');

      // The internal parser throws, which is caught by analyzeIntent, returning the fallback.
      expect(result).toEqual(
        conversationAnalyzer._getFallbackResponse('Translate this')
      );
    });
  });

  describe('summarizeConversation', () => {
    it('should generate a summary from conversation history', async () => {
      const conversationHistory = [
        { role: 'user', content: 'Translate to French' },
        { role: 'assistant', content: 'What text?' },
      ];
      const existingParams = { targetLanguage: 'fr' };
      const summaryText = 'User wants to translate text to French.';
      mockInvoke.mockResolvedValue({ content: summaryText });

      const result = await conversationAnalyzer.summarizeConversation(conversationHistory, existingParams);

      expect(result).toBe(summaryText);
      expect(mockInvoke).toHaveBeenCalledOnce();
      const prompt = mockInvoke.mock.calls[0][0];
      expect(prompt).toContain('Summarize this translation conversation.');
      expect(prompt).toContain('user: Translate to French');
      expect(prompt).toContain('assistant: What text?');
      expect(prompt).toContain('"targetLanguage": "fr"');
    });

    it('should return a fallback summary if the summarizer model fails', async () => {
      mockInvoke.mockRejectedValue(new Error('Summarizer API Error'));
      const existingParams = { targetLanguage: 'fr' };

      const result = await conversationAnalyzer.summarizeConversation([], existingParams);

      expect(result).toBe('Translation conversation. Parameters: {"targetLanguage":"fr"}');
    });
  });

  describe('selectFileFromMultiple', () => {
    const documents = [
      { id: '1', originalName: 'contract.pdf', uploadedAt: new Date('2023-01-01'), size: 1024 },
      { id: '2', originalName: 'invoice.docx', uploadedAt: new Date('2023-01-02'), size: 2048 },
      { id: '3', originalName: 'latest_report.pdf', uploadedAt: new Date('2023-01-03'), size: 3072 },
    ];

    it('should immediately select the document if only one is provided', async () => {
      const singleDoc = [documents[0]];
      const result = await conversationAnalyzer.selectFileFromMultiple('translate it', singleDoc);

      expect(result).toEqual({
        selectedDocument: singleDoc[0],
        selectedIndex: 0,
        confidence: 1.0,
        reason: 'Only one document was available for selection.',
      });
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('should select a file based on a valid LLM response', async () => {
      const mockResponse = {
        selectedIndex: 2,
        confidence: 0.98,
        reason: 'User mentioned "latest".',
      };
      mockInvoke.mockResolvedValue({ content: JSON.stringify(mockResponse) });

      const result = await conversationAnalyzer.selectFileFromMultiple('the latest one', documents);

      expect(result).toEqual({
        selectedDocument: documents[2],
        selectedIndex: 2,
        confidence: 0.98,
        reason: 'User mentioned "latest".',
      });
      expect(mockInvoke).toHaveBeenCalledOnce();
      const prompt = mockInvoke.mock.calls[0][0];
      expect(prompt).toContain('User\'s message: "the latest one"');
      expect(prompt).toContain('0. "contract.pdf"');
      expect(prompt).toContain('1. "invoice.docx"');
      expect(prompt).toContain('2. "latest_report.pdf"');
    });

    it('should fall back to the most recent file if the LLM response is not valid JSON', async () => {
      mockInvoke.mockResolvedValue({ content: 'I think it is the last one.' });

      const result = await conversationAnalyzer.selectFileFromMultiple('the last one', documents);

      expect(result).toEqual({
        selectedDocument: documents[2], // Most recent is the last one
        selectedIndex: 2,
        confidence: 0.5,
        reason: 'Fallback to most recent file due to parsing error',
      });
    });

    it('should fall back to the most recent file if the LLM response contains an invalid index', async () => {
      const mockResponse = { selectedIndex: 99, confidence: 0.9, reason: 'Mistake' };
      mockInvoke.mockResolvedValue({ content: JSON.stringify(mockResponse) });

      const result = await conversationAnalyzer.selectFileFromMultiple('any file', documents);

      expect(result).toEqual({
        selectedDocument: documents[2],
        selectedIndex: 2,
        confidence: 0.5,
        reason: 'Fallback to most recent file due to parsing error',
      });
    });

    it('should fall back to the most recent file if the LLM invocation fails', async () => {
      mockInvoke.mockRejectedValue(new Error('File Selection API Error'));

      const result = await conversationAnalyzer.selectFileFromMultiple('any file', documents);

      expect(result).toEqual({
        selectedDocument: documents[2],
        selectedIndex: 2,
        confidence: 0.3,
        reason: 'Fallback to most recent file due to error',
      });
    });
  });

  describe('_private methods', () => {
    it('_estimateTokens should return a reasonable estimate', () => {
      expect(conversationAnalyzer._estimateTokens('')).toBe(0);
      expect(conversationAnalyzer._estimateTokens(null)).toBe(0);
      expect(conversationAnalyzer._estimateTokens('hello')).toBe(2); // ceil(5/4)
      expect(conversationAnalyzer._estimateTokens('hello world')).toBe(3); // ceil(11/4)
    });

    it('_normalizeLanguageCode should handle various inputs', () => {
      // Valid codes
      expect(conversationAnalyzer._normalizeLanguageCode('en')).toBe('en');
      expect(conversationAnalyzer._normalizeLanguageCode('fr')).toBe('fr');

      // Valid names (case-insensitive, trimmed)
      expect(conversationAnalyzer._normalizeLanguageCode('Spanish')).toBe('es');
      expect(conversationAnalyzer._normalizeLanguageCode(' german ')).toBe('de');
      expect(conversationAnalyzer._normalizeLanguageCode('japanese')).toBe('ja');

      // Invalid/unknown inputs
      expect(conversationAnalyzer._normalizeLanguageCode('klingon')).toBe('klingon');
      expect(conversationAnalyzer._normalizeLanguageCode(null)).toBe(null);
      expect(conversationAnalyzer._normalizeLanguageCode('')).toBe('');
    });
  });
});