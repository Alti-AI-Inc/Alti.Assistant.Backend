import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
  generateContentStream: mockGenerateContentStream,
}));
const mockGoogleGenerativeAI = vi.fn(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: mockGoogleGenerativeAI,
}));

// Initial mock for config, can be overridden with vi.doMock for specific tests
vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'TEST_GEMINI_API_KEY',
  },
}));

const mockLLMInvoke = vi.fn();
const mockLLMPipeInvoke = vi.fn(); // For the piped chain
const mockLLMPipe = vi.fn(() => ({
  invoke: mockLLMPipeInvoke,
}));
const mockLLM = {
  invoke: mockLLMInvoke,
  pipe: mockLLMPipe,
};

vi.mock('../llm.js', () => ({
  llm: mockLLM,
}));

const mockJsonOutputParser = vi.fn(() => ({
  parse: vi.fn(), // The parse method is not directly called in the current chain setup, but good to mock
}));

vi.mock('@langchain/core/output_parsers', () => ({
  JsonOutputParser: mockJsonOutputParser,
}));

// Import the functions to be tested AFTER mocks are set up
import {
  generateWritingQuestions,
  updateWritingBrief,
  generateFinalContent,
} from './writingService.js';

describe('writingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.env for API key tests
    delete process.env.GEMINI_API_KEY;
    // Ensure the default config mock is restored for each test
    vi.doMock('../../../../../config/index.js', () => ({
      default: {
        gemini_secret_key: 'TEST_GEMINI_API_KEY',
      },
    }));
  });

  describe('generateWritingQuestions', () => {
    it('should generate writing questions based on the topic', async () => {
      const topic = 'The future of AI in healthcare';
      const expectedQuestions = [
        'Who is the target audience for this piece?',
        'What format should the content take?',
        'What are the key points to emphasize?',
      ];

      mockLLMPipeInvoke.mockResolvedValueOnce({ questions: expectedQuestions });

      const result = await generateWritingQuestions(topic);

      expect(mockLLM.pipe).toHaveBeenCalledTimes(1);
      expect(mockJsonOutputParser).toHaveBeenCalledTimes(1);
      expect(mockLLMPipeInvoke).toHaveBeenCalledTimes(1);
      expect(mockLLMPipeInvoke).toHaveBeenCalledWith(expect.stringContaining(topic));
      expect(mockLLMPipeInvoke).toHaveBeenCalledWith(expect.stringContaining('Return ONLY a JSON object'));
      expect(result).toEqual(expectedQuestions);
    });

    it('should return an empty array if no questions are generated', async () => {
      const topic = 'A very simple topic';
      mockLLMPipeInvoke.mockResolvedValueOnce({ questions: [] });

      const result = await generateWritingQuestions(topic);

      expect(result).toEqual([]);
    });

    it('should return an empty array if the LLM response does not contain "questions" key', async () => {
      const topic = 'Another topic';
      mockLLMPipeInvoke.mockResolvedValueOnce({ someOtherKey: 'value' });

      const result = await generateWritingQuestions(topic);

      expect(result).toEqual([]);
    });
  });

  describe('updateWritingBrief', () => {
    it('should update the writing brief with new user information', async () => {
      const currentBrief = 'Initial brief about a blog post.';
      const userResponse = 'It should be for a technical audience and focus on new research.';
      const history = [
        { role: 'user', content: 'I want to write a blog post.' },
        { role: 'assistant', content: 'Okay, what is the topic?' },
      ];
      const expectedUpdatedBrief = 'Updated brief for a technical audience focusing on new research.';

      mockLLMInvoke.mockResolvedValueOnce({ content: expectedUpdatedBrief });

      const result = await updateWritingBrief(currentBrief, userResponse, history);

      expect(mockLLMInvoke).toHaveBeenCalledTimes(1);
      const expectedPrompt = expect.stringContaining(
        `The current brief is:\n    ---\n    ${currentBrief}\n    ---\n    The user has just provided new information: "${userResponse}".\n    Integrate this new information into the brief`
      );
      expect(mockLLMInvoke).toHaveBeenCalledWith(expectedPrompt);
      expect(mockLLMInvoke).toHaveBeenCalledWith(expect.stringContaining('user: I want to write a blog post.\nassistant: Okay, what is the topic?'));
      expect(result).toBe(expectedUpdatedBrief);
    });

    it('should handle empty history gracefully', async () => {
      const currentBrief = 'Initial brief.';
      const userResponse = 'New info.';
      const history = [];
      const expectedUpdatedBrief = 'Updated brief.';

      mockLLMInvoke.mockResolvedValueOnce({ content: expectedUpdatedBrief });

      const result = await updateWritingBrief(currentBrief, userResponse, history);

      expect(mockLLMInvoke).toHaveBeenCalledTimes(1);
      expect(mockLLMInvoke).toHaveBeenCalledWith(expect.stringContaining('Full Conversation History (for context):\n    ')); // Empty history string
      expect(result).toBe(expectedUpdatedBrief);
    });
  });

  describe('generateFinalContent (and internal runClaudeTask logic)', () => {
    const brief = 'Write a blog post about Vitest testing.';
    const systemPromptBase = `You are an expert writer. Your task is to write a high-quality piece of content based on the user's detailed brief.
    Adhere strictly to all instructions in the brief regarding format, tone, audience, and key points.
    
    The final, detailed brief is:
    ---
    ${brief}
    ---
    
    Now, write the final piece.`;

    it('should generate final content in non-streaming mode with a string message', async () => {
      const history = 'Initial user query.';
      const expectedContent = 'This is the generated blog post content.';

      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [{ content: { parts: [{ text: expectedContent }] } }],
        },
      });

      const result = await generateFinalContent(brief, history, false);

      expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('TEST_GEMINI_API_KEY');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        systemInstruction: systemPromptBase,
      });
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [{ role: 'user', parts: [{ text: history }] }],
      });
      expect(result).toBe(expectedContent);
    });

    it('should generate final content in non-streaming mode with an array of messages', async () => {
      const history = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'How can I help?' },
        { role: 'user', content: 'Write about Vitest.' },
      ];
      const expectedContent = 'This is the generated blog post content from history.';

      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [{ content: { parts: [{ text: expectedContent }] } }],
        },
      });

      const result = await generateFinalContent(brief, history, false);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'How can I help?' }] }, // assistant mapped to model
          { role: 'user', parts: [{ text: 'Write about Vitest.' }] },
        ],
      });
      expect(result).toBe(expectedContent);
    });

    it('should handle array of messages with mixed content types and empty parts', async () => {
      const history = [
        { role: 'user', content: 'First part.' },
        { role: 'user', content: [{ text: 'Second part.' }] }, // Should concatenate
        { role: 'assistant', content: 'Model response.' },
        { role: 'assistant', content: [{ text: 'Another model part.' }] }, // Should concatenate
        { role: 'user', content: [{ type: 'image', url: '...' }] }, // Should be ignored if no text
        { role: 'user', content: [{ text: '' }] }, // Should be ignored if empty text
        { role: 'unknown', content: 'Unknown role becomes user.' },
      ];
      const expectedContent = 'Combined content.';

      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [{ content: { parts: [{ text: expectedContent }] } }],
        },
      });

      await generateFinalContent(brief, history, false);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [
          { role: 'user', parts: [{ text: 'First part.' }, { text: 'Second part.' }] },
          { role: 'model', parts: [{ text: 'Model response.' }, { text: 'Another model part.' }] },
          { role: 'user', parts: [{ text: 'Unknown role becomes user.' }] },
        ],
      });
    });

    it('should prepend a user message if the first message in history is a model role', async () => {
      const history = [
        { role: 'assistant', content: 'How can I help?' },
        { role: 'user', content: 'Write about Vitest.' },
      ];
      const expectedContent = 'Prepended content.';

      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [{ content: { parts: [{ text: expectedContent }] } }],
        },
      });

      await generateFinalContent(brief, history, false);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] }, // Prepended
          { role: 'model', parts: [{ text: 'How can I help?' }] },
          { role: 'user', parts: [{ text: 'Write about Vitest.' }] },
        ],
      });
    });

    it('should use process.env.GEMINI_API_KEY if config.gemini_secret_key is not set', async () => {
      // Temporarily override the config mock for this test
      vi.doMock('../../../../../config/index.js', () => ({
        default: {
          gemini_secret_key: undefined,
        },
      }));
      process.env.GEMINI_API_KEY = 'ENV_GEMINI_KEY';

      // Re-import the module to pick up the new config mock
      const { generateFinalContent: generateFinalContentWithEnv } = await vi.importActual('./writingService.js');

      const history = 'Test message.';
      const expectedContent = 'Content from env key.';
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [{ content: { parts: [{ text: expectedContent }] } }],
        },
      });

      const result = await generateFinalContentWithEnv(brief, history, false);

      expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('ENV_GEMINI_KEY');
      expect(result).toBe(expectedContent);
    });

    it('should handle API errors gracefully in non-streaming mode', async () => {
      const history = 'Error test.';
      const errorMessage = 'API error occurred.';
      mockGenerateContent.mockRejectedValueOnce(new Error(errorMessage));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateFinalContent(brief, history, false);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error calling Gemini API in writing service:',
        expect.any(Error)
      );
      expect(result).toBe(
        'Sorry, I encountered an error while processing your request with the coding model. Please try again.'
      );

      consoleErrorSpy.mockRestore();
    });

    it('should generate final content in streaming mode', async () => {
      const history = 'Stream test.';
      const mockStreamChunks = [
        { text: () => 'First chunk ' },
        { text: () => 'second chunk' },
      ];

      // Mock the async generator for generateContentStream
      const mockAsyncGenerator = (async function* () {
        for (const chunk of mockStreamChunks) {
          yield chunk;
        }
      })();

      mockGenerateContentStream.mockResolvedValueOnce({
        stream: mockAsyncGenerator,
      });

      const resultStream = await generateFinalContent(brief, history, true);

      expect(mockGenerateContentStream).toHaveBeenCalledTimes(1);
      expect(mockGenerateContentStream).toHaveBeenCalledWith({
        contents: [{ role: 'user', parts: [{ text: history }] }],
      });

      const collectedChunks = [];
      for await (const chunk of resultStream) {
        collectedChunks.push(chunk);
      }

      expect(collectedChunks).toEqual([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'First chunk ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'second chunk' } },
      ]);
    });

    it('should handle API errors gracefully in streaming mode', async () => {
      const history = 'Stream error test.';
      const errorMessage = 'Streaming API error occurred.';
      mockGenerateContentStream.mockRejectedValueOnce(new Error(errorMessage));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateFinalContent(brief, history, true);

      // The error is caught before the stream is returned, so it should return the error message string
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error calling Gemini API in writing service:',
        expect.any(Error)
      );
      expect(result).toBe(
        'Sorry, I encountered an error while processing your request with the coding model. Please try again.'
      );

      consoleErrorSpy.mockRestore();
    });
  });
});