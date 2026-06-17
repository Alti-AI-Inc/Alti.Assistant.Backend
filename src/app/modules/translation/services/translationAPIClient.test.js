import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies at the top level
vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-api-key',
  },
}));

const {
  mockLogger,
  mockChatGoogleGenerativeAI
} = vi.hoisted(() => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };
  const mockChatGoogleGenerativeAI = vi.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  }));

  return {
    mockLogger,
    mockChatGoogleGenerativeAI
  };
});

vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../translation.constant.js', () => ({
  SUPPORTED_LANGUAGES: {
    ENGLISH: 'en',
    SPANISH: 'es',
    FRENCH: 'fr',
  },
  LANGUAGE_NAMES: {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
  },
  ERROR_MESSAGES: {
    LANGUAGE_DETECTION_FAILED: 'Language detection failed.',
    TRANSLATION_FAILED: 'Translation failed.',
    MISSING_TARGET_LANGUAGE: 'Target language is required.',
    INVALID_LANGUAGE: 'Invalid or unsupported language provided.',
  },
}));

// Mock the core dependency
const mockInvoke = vi.fn();
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI,
}));

describe('TranslationAPIClient', () => {
  let translationAPIClient;
  let TranslationAPIClientClass;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import the module to get a fresh instance with mocks
    const module = await import('./translationAPIClient.js');
    // The class is not exported, so we have to test the singleton.
    // To test private methods, we need access to the class prototype.
    // A common workaround is to get the constructor from the instance.
    translationAPIClient = module.translationAPIClient;
    TranslationAPIClientClass = module.translationAPIClient.constructor;
  });

  afterEach(() => {
    vi.resetModules(); // Ensure clean state for next test file
  });

  describe('Constructor', () => {
    it('should initialize Gemini models and log success', () => {
      expect(mockChatGoogleGenerativeAI).toHaveBeenCalledTimes(2);
      expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
        model: 'gemini-3.5-flash',
        apiKey: 'test-api-key',
        temperature: 0.3,
        maxOutputTokens: 32000,
      });
      expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
        model: 'gemini-3.5-flash',
        apiKey: 'test-api-key',
        temperature: 0.1,
        maxOutputTokens: 200,
      });
      expect(translationAPIClient.model).toBeDefined();
      expect(translationAPIClient.detectionModel).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Gemini LLM Translation API initialized');
    });

    it('should handle initialization failure', async () => {
      // Temporarily break the mock for this test
      mockChatGoogleGenerativeAI.mockImplementationOnce(() => {
        throw new Error('Initialization failed');
      });

      // Need to re-instantiate to trigger the constructor error
      const client = new TranslationAPIClientClass();

      expect(client.model).toBeNull();
      expect(client.detectionModel).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize Translation API:',
        expect.any(Error)
      );
    });
  });

  describe('Private Methods', () => {
    describe('_isValidLanguageCode', () => {
      it('should return true for a supported language code', () => {
        expect(translationAPIClient._isValidLanguageCode('en')).toBe(true);
      });

      it('should return true for a supported language code with different casing', () => {
        expect(translationAPIClient._isValidLanguageCode('ES')).toBe(true);
      });

      it('should return false for an unsupported language code', () => {
        expect(translationAPIClient._isValidLanguageCode('de')).toBe(false);
      });
    });

    describe('_chunkText', () => {
      it('should not chunk text smaller than maxChunkSize', () => {
        const text = 'This is a short text.';
        const chunks = translationAPIClient._chunkText(text, 100);
        expect(chunks).toEqual([text]);
      });

      it('should chunk text by paragraphs', () => {
        const text = 'Paragraph 1.\n\nParagraph 2.';
        const chunks = translationAPIClient._chunkText(text, 15);
        expect(chunks).toEqual(['Paragraph 1.', 'Paragraph 2.']);
      });

      it('should chunk a large paragraph by sentences', () => {
        const text = 'This is the first sentence. This is the second sentence. This is the third.';
        const chunks = translationAPIClient._chunkText(text, 40);
        expect(chunks).toEqual([
          'This is the first sentence. This is the second sentence.',
          'This is the third.',
        ]);
      });

      it('should handle a single sentence larger than maxChunkSize', () => {
        const longSentence = 'This is a very long single sentence that exceeds the chunk size.';
        const chunks = translationAPIClient._chunkText(longSentence, 40);
        // It will be split by the sentence splitter logic
        expect(chunks).toEqual([longSentence]);
      });

      it('should handle text with no clear sentence breaks correctly', () => {
        const longWord = 'a'.repeat(50);
        const chunks = translationAPIClient._chunkText(longWord, 40);
        expect(chunks).toEqual([longWord]);
      });
    });
  });

  describe('detectLanguage', () => {
    it('should successfully detect a supported language', async () => {
      const mockResponse = {
        content: `\`\`\`json
{
  "languageCode": "es",
  "languageName": "Spanish",
  "confidence": 0.98
}
\`\`\``,
      };
      mockInvoke.mockResolvedValue(mockResponse);

      const result = await translationAPIClient.detectLanguage('Hola, mundo');
      expect(result).toEqual({
        success: true,
        languageCode: 'es',
        languageName: 'Spanish',
        confidence: 0.98,
        isSupported: true,
      });
      expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining('Hola, mundo'));
    });

    it('should successfully detect an unsupported language', async () => {
      const mockResponse = {
        content: JSON.stringify({
          languageCode: 'de',
          languageName: 'German',
          confidence: 0.99,
        }),
      };
      mockInvoke.mockResolvedValue(mockResponse);

      const result = await translationAPIClient.detectLanguage('Hallo Welt');
      expect(result).toEqual({
        success: true,
        languageCode: 'de',
        languageName: 'German',
        confidence: 0.99,
        isSupported: false,
      });
    });

    it('should throw an error if text is empty', async () => {
      await expect(translationAPIClient.detectLanguage('')).rejects.toThrow(
        'Text is required for language detection'
      );
    });

    it('should throw a generic error if LLM response is not valid JSON', async () => {
      mockInvoke.mockResolvedValue({ content: 'This is not JSON' });
      await expect(translationAPIClient.detectLanguage('some text')).rejects.toThrow(
        'Language detection failed.'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Language detection failed:',
        expect.any(Error)
      );
    });

    it('should throw an error if the API is not initialized', async () => {
      translationAPIClient.detectionModel = null;
      await expect(translationAPIClient.detectLanguage('some text')).rejects.toThrow(
        'Translation API not initialized'
      );
    });
  });

  describe('translateText', () => {
    it('should translate text with a specified source language', async () => {
      mockInvoke.mockResolvedValue({ content: 'Hello world' });
      const result = await translationAPIClient.translateText('Hola mundo', 'en', 'es');

      expect(result).toEqual({
        success: true,
        originalText: 'Hola mundo',
        translatedText: 'Hello world',
        sourceLanguage: 'es',
        sourceLanguageName: 'Spanish',
        targetLanguage: 'en',
        targetLanguageName: 'English',
        characterCount: 10,
        method: 'llm',
      });
      expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining('Translate the following text from Spanish to English.'));
    });

    it('should auto-detect source language when set to "auto"', async () => {
      // First call for detection
      mockInvoke.mockResolvedValueOnce({
        content: JSON.stringify({ languageCode: 'es', languageName: 'Spanish', confidence: 0.99 }),
      });
      // Second call for translation
      mockInvoke.mockResolvedValueOnce({ content: 'Hello world' });

      const result = await translationAPIClient.translateText('Hola mundo', 'en', 'auto');

      expect(result.sourceLanguage).toBe('es');
      expect(result.translatedText).toBe('Hello world');
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });

    it('should throw an error for invalid target language', async () => {
      await expect(translationAPIClient.translateText('text', 'de')).rejects.toThrow(
        'Invalid or unsupported language provided.'
      );
    });

    it('should throw an error for invalid source language', async () => {
      await expect(translationAPIClient.translateText('text', 'en', 'de')).rejects.toThrow(
        'Invalid or unsupported language provided.'
      );
    });

    it('should throw an error if text is empty', async () => {
      await expect(translationAPIClient.translateText('', 'en')).rejects.toThrow(
        'Text is required for translation'
      );
    });

    it('should delegate to _translateLargeText for long texts', async () => {
      const longText = 'a'.repeat(80001);
      const translateLargeTextSpy = vi.spyOn(translationAPIClient, '_translateLargeText').mockResolvedValue({ success: true, translatedText: 'b' });

      await translationAPIClient.translateText(longText, 'es', 'en');

      expect(translateLargeTextSpy).toHaveBeenCalledWith(longText, 'es', 'en');
      translateLargeTextSpy.mockRestore();
    });

    it('should handle LLM translation failure', async () => {
      mockInvoke.mockRejectedValue(new Error('LLM Error'));
      await expect(translationAPIClient.translateText('Hola mundo', 'en', 'es')).rejects.toThrow('LLM Error');
      expect(mockLogger.error).toHaveBeenCalledWith('Translation failed:', expect.any(Error));
    });
  });

  describe('_translateLargeText', () => {
    it('should chunk and translate large text', async () => {
      const longText = 'Paragraph 1. Sentence 1. Sentence 2.\n\nParagraph 2. Sentence 3. Sentence 4.';

      // Mock _chunkText to return predictable chunks
      const chunkTextSpy = vi.spyOn(translationAPIClient, '_chunkText').mockReturnValue(['Chunk 1', 'Chunk 2']);

      // Mock language detection for the large text
      mockInvoke.mockResolvedValueOnce({
        content: JSON.stringify({ languageCode: 'en', languageName: 'English', confidence: 0.99 }),
      });
      // Mock translation for each chunk
      mockInvoke.mockResolvedValueOnce({ content: 'Trozo 1' });
      mockInvoke.mockResolvedValueOnce({ content: 'Trozo 2' });

      const result = await translationAPIClient._translateLargeText(longText, 'es', 'auto');

      expect(chunkTextSpy).toHaveBeenCalledWith(longText, 80000);
      expect(mockInvoke).toHaveBeenCalledTimes(3); // 1 for detection, 2 for translation
      expect(result).toEqual({
        success: true,
        originalText: longText,
        translatedText: 'Trozo 1\n\nTrozo 2',
        sourceLanguage: 'en',
        sourceLanguageName: 'English',
        targetLanguage: 'es',
        targetLanguageName: 'Spanish',
        characterCount: longText.length,
        method: 'llm-chunked',
        chunks: 2,
      });

      chunkTextSpy.mockRestore();
    });
  });

  describe('translateBatch', () => {
    it('should translate a batch of texts', async () => {
      const texts = ['Hello', 'Goodbye'];

      // Mock the internal calls to translateText
      const translateTextSpy = vi.spyOn(translationAPIClient, 'translateText')
        .mockResolvedValueOnce({ translatedText: 'Hola' })
        .mockResolvedValueOnce({ translatedText: 'Adiós' });

      const result = await translationAPIClient.translateBatch(texts, 'es', 'en');

      expect(translateTextSpy).toHaveBeenCalledTimes(2);
      expect(translateTextSpy).toHaveBeenCalledWith('Hello', 'es', 'en');
      expect(translateTextSpy).toHaveBeenCalledWith('Goodbye', 'es', 'en');

      expect(result).toEqual({
        success: true,
        translations: [
          { originalText: 'Hello', translatedText: 'Hola' },
          { originalText: 'Goodbye', translatedText: 'Adiós' },
        ],
        targetLanguage: 'es',
        targetLanguageName: 'Spanish',
        count: 2,
        method: 'llm',
      });
      translateTextSpy.mockRestore();
    });

    it('should throw an error if texts array is empty', async () => {
      await expect(translationAPIClient.translateBatch([], 'es')).rejects.toThrow(
        'Texts array is required for batch translation'
      );
    });

    it('should throw an error if target language is invalid', async () => {
      await expect(translationAPIClient.translateBatch(['text'], 'de')).rejects.toThrow(
        'Invalid or unsupported language provided.'
      );
    });

    it('should propagate errors from individual translations', async () => {
      const texts = ['Hello', 'Goodbye'];
      const translateTextSpy = vi.spyOn(translationAPIClient, 'translateText')
        .mockResolvedValueOnce({ translatedText: 'Hola' })
        .mockRejectedValueOnce(new Error('Individual translation failed'));

      await expect(translationAPIClient.translateBatch(texts, 'es', 'en')).rejects.toThrow(
        'Individual translation failed'
      );
      translateTextSpy.mockRestore();
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return the list of supported languages', async () => {
      const result = await translationAPIClient.getSupportedLanguages();
      expect(result).toEqual({
        success: true,
        languages: [
          { code: 'en', name: 'English' },
          { code: 'es', name: 'Spanish' },
          { code: 'fr', name: 'French' },
        ],
        count: 3,
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Retrieved supported languages', { count: 3 });
    });

    it('should throw an error if Object.entries fails', async () => {
      const originalEntries = Object.entries;
      Object.entries = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      await expect(translationAPIClient.getSupportedLanguages()).rejects.toThrow('Test error');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get supported languages:', expect.any(Error));

      Object.entries = originalEntries; // Restore original function
    });
  });
});