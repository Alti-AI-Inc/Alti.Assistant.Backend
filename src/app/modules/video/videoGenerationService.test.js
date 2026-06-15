import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateVideoClarifyingQuestions,
  isUserFinishedVideo,
  updateVideoRefinedPrompt,
  compileVideoFinalPrompt,
} from './videoGenerationService';

const {
  mockJsonOutputParserInstance,
  mockPromptTemplateInstance,
  mockLlm
} = vi.hoisted(() => {
  // Mock Langchain dependencies
  const mockJsonOutputParserInstance = {
    getFormatInstructions: vi.fn().mockImplementation(() => 'format instructions'),
  };

  const mockPromptTemplateInstance = {
    pipe: vi.fn().mockReturnThis(), // Allow chaining .pipe() calls
  };
  const mockLlm = {
    pipe: vi.fn().mockImplementation(() => ({
      invoke: mockLlmInvoke,
    })),
  };

  return {
    mockJsonOutputParserInstance,
    mockPromptTemplateInstance,
    mockLlm
  };
});

vi.mock('@langchain/core/output_parsers', () => ({
  JsonOutputParser: vi.fn().mockImplementation(() => mockJsonOutputParserInstance),
}));

vi.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    fromTemplate: vi.fn().mockImplementation(() => mockPromptTemplateInstance),
  },
}));

// Mock the LLM dependency
const mockLlmInvoke = vi.fn();
vi.mock('./llm.js', () => ({
  llm: mockLlm,
}));

describe('Video Generation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations for each test
    mockJsonOutputParserInstance.getFormatInstructions.mockReturnValue('format instructions');
    mockPromptTemplateInstance.pipe.mockReturnThis(); // Ensure pipe can be chained
    mockLlm.pipe.mockImplementation(() => ({ invoke: mockLlmInvoke })); // Reset LLM pipe chain
    mockLlmInvoke.mockResolvedValue({}); // Default empty resolved value, to be overridden per test
  });

  describe('generateVideoClarifyingQuestions', () => {
    it('should generate clarifying questions successfully', async () => {
      const initialPrompt = 'A cat playing with a ball.';
      const mockQuestions = ['Q1', 'Q2', 'Q3'];
      // The chain includes JsonOutputParser, so mockLlmInvoke should return the parsed result
      mockLlmInvoke.mockResolvedValue({ questions: mockQuestions });

      const result = await generateVideoClarifyingQuestions(initialPrompt);

      expect(result).toEqual(mockQuestions);
      // prompt.pipe(llm).pipe(parser) means two pipe calls
      expect(mockPromptTemplateInstance.pipe).toHaveBeenCalledTimes(2);
      expect(mockLlmInvoke).toHaveBeenCalledWith({
        prompt: initialPrompt,
        format_instructions: 'format instructions',
      });
      expect(mockJsonOutputParserInstance.getFormatInstructions).toHaveBeenCalled();
    });

    it('should return an empty array if LLM returns no questions key', async () => {
      const initialPrompt = 'A dog running.';
      mockLlmInvoke.mockResolvedValue({ otherKey: 'value' }); // No 'questions' key

      const result = await generateVideoClarifyingQuestions(initialPrompt);

      expect(result).toEqual([]);
    });

    it('should return fallback questions on LLM error', async () => {
      const initialPrompt = 'A bird flying.';
      const error = new Error('LLM failed');
      mockLlmInvoke.mockRejectedValue(error);

      // Mock console.error to prevent it from polluting test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await generateVideoClarifyingQuestions(initialPrompt);

      expect(result).toEqual([
        'What is the main subject or scene in your video?',
        'What visual style do you prefer (realistic, animated, cinematic, artistic)?',
        'How long should the video be (in seconds)?',
        'What kind of movement or action should happen in the video?',
        "What's the desired mood or atmosphere?",
        'Should there be any specific camera movements or angles?',
      ]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error generating video clarifying questions:',
        error
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('isUserFinishedVideo', () => {
    it('should return true if LLM indicates user is finished', async () => {
      const userResponse = 'Yes, I am done. Generate it.';
      // For this function, the LLM directly returns content
      mockLlmInvoke.mockResolvedValue({ content: 'true' });

      const result = await isUserFinishedVideo(userResponse);

      expect(result).toBe(true);
      expect(mockPromptTemplateInstance.pipe).toHaveBeenCalledTimes(1); // prompt.pipe(llm)
      expect(mockLlmInvoke).toHaveBeenCalledWith({ userResponse });
    });

    it('should return false if LLM indicates user is not finished', async () => {
      const userResponse = 'I want to add more details.';
      mockLlmInvoke.mockResolvedValue({ content: 'false' });

      const result = await isUserFinishedVideo(userResponse);

      expect(result).toBe(false);
      expect(mockLlmInvoke).toHaveBeenCalledWith({ userResponse });
    });

    it('should return false for an empty user response', async () => {
      const userResponse = '';
      const result = await isUserFinishedVideo(userResponse);

      expect(result).toBe(false);
      expect(mockLlmInvoke).not.toHaveBeenCalled(); // LLM should not be called for empty response
    });

    it('should return false on LLM error', async () => {
      const userResponse = 'Please generate.';
      const error = new Error('LLM failed');
      mockLlmInvoke.mockRejectedValue(error);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await isUserFinishedVideo(userResponse);

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error checking if user is finished with video:',
        error
      );
      consoleErrorSpy.mockRestore();
    });

    it('should handle direct string response from LLM (older Langchain versions)', async () => {
      const userResponse = 'Yes, generate.';
      mockLlmInvoke.mockResolvedValue('true'); // Direct string response

      const result = await isUserFinishedVideo(userResponse);

      expect(result).toBe(true);
    });

    it('should return false for malformed LLM response', async () => {
      const userResponse = 'Generate please.';
      mockLlmInvoke.mockResolvedValue({ content: 'maybe' }); // Malformed response

      const result = await isUserFinishedVideo(userResponse);

      expect(result).toBe(false);
    });
  });

  describe('updateVideoRefinedPrompt', () => {
    it('should update the refined prompt successfully', async () => {
      const currentPrompt = 'A video about a cat.';
      const userResponse = 'Make it a fluffy cat playing with a red ball.';
      const conversationHistory = [
        { role: 'user', content: 'cat video' },
        { role: 'assistant', content: 'What kind of cat?' },
      ];
      const expectedUpdatedPrompt = 'A video about a fluffy cat playing with a red ball.';
      mockLlmInvoke.mockResolvedValue({ content: expectedUpdatedPrompt });

      const result = await updateVideoRefinedPrompt(
        currentPrompt,
        userResponse,
        conversationHistory
      );

      expect(result).toBe(expectedUpdatedPrompt);
      expect(mockPromptTemplateInstance.pipe).toHaveBeenCalledTimes(1);
      expect(mockLlmInvoke).toHaveBeenCalledWith({
        currentPrompt,
        userResponse,
        conversationHistory: JSON.stringify(conversationHistory), // Only 2 messages, so slice(-6) is full array
      });
    });

    it('should handle conversation history slicing correctly', async () => {
      const currentPrompt = 'Current.';
      const userResponse = 'Response.';
      const longConversationHistory = Array(10)
        .fill(0)
        .map((_, i) => ({ role: 'user', content: `msg${i}` }));
      const expectedSlicedHistory = longConversationHistory.slice(-6);

      mockLlmInvoke.mockResolvedValue({ content: 'Updated prompt' });

      await updateVideoRefinedPrompt(currentPrompt, userResponse, longConversationHistory);

      expect(mockLlmInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationHistory: JSON.stringify(expectedSlicedHistory),
        })
      );
    });

    it('should return concatenated fallback on LLM error', async () => {
      const currentPrompt = 'A video about a dog.';
      const userResponse = 'Make it a golden retriever.';
      const conversationHistory = [];
      const error = new Error('LLM failed');
      mockLlmInvoke.mockRejectedValue(error);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await updateVideoRefinedPrompt(
        currentPrompt,
        userResponse,
        conversationHistory
      );

      expect(result).toBe(`${currentPrompt}. ${userResponse}`);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error updating video refined prompt:',
        error
      );
      consoleErrorSpy.mockRestore();
    });

    it('should handle direct string response from LLM (older Langchain versions)', async () => {
      const currentPrompt = 'Current.';
      const userResponse = 'Response.';
      const conversationHistory = [];
      const expectedUpdatedPrompt = 'Updated prompt string';
      mockLlmInvoke.mockResolvedValue(expectedUpdatedPrompt); // Direct string response

      const result = await updateVideoRefinedPrompt(
        currentPrompt,
        userResponse,
        conversationHistory
      );

      expect(result).toBe(expectedUpdatedPrompt);
    });
  });

  describe('compileVideoFinalPrompt', () => {
    it('should compile the final prompt successfully', async () => {
      const refinedPrompt = 'A detailed prompt about a cat playing with a red ball.';
      const expectedFinalPrompt =
        'FINAL: A highly optimized prompt for a fluffy cat playing with a red ball, cinematic style.';
      mockLlmInvoke.mockResolvedValue({ content: expectedFinalPrompt });

      const result = await compileVideoFinalPrompt(refinedPrompt);

      expect(result).toBe(expectedFinalPrompt);
      expect(mockPromptTemplateInstance.pipe).toHaveBeenCalledTimes(1);
      expect(mockLlmInvoke).toHaveBeenCalledWith({ refinedPrompt });
    });

    it('should return refined prompt as-is on LLM error', async () => {
      const refinedPrompt = 'A detailed prompt about a dog.';
      const error = new Error('LLM failed');
      mockLlmInvoke.mockRejectedValue(error);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await compileVideoFinalPrompt(refinedPrompt);

      expect(result).toBe(refinedPrompt);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error compiling final video prompt:',
        error
      );
      consoleErrorSpy.mockRestore();
    });

    it('should handle direct string response from LLM (older Langchain versions)', async () => {
      const refinedPrompt = 'Refined prompt.';
      const expectedFinalPrompt = 'Final prompt string.';
      mockLlmInvoke.mockResolvedValue(expectedFinalPrompt); // Direct string response

      const result = await compileVideoFinalPrompt(refinedPrompt);

      expect(result).toBe(expectedFinalPrompt);
    });
  });
});