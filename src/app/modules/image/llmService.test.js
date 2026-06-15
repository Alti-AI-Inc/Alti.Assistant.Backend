import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateClarifyingQuestions,
  isUserFinished,
  updateRefinedPrompt,
  compileFinalPrompt,
  getUrlFromUserInputUsingAi,
} from './llmService.js';

const {
  mockInvoke
} = vi.hoisted(() => {
  // This mock will represent the final `invoke` call on any LangChain chain.
  const mockInvoke = vi.fn();

  return {
    mockInvoke
  };
});

// Mock the dependencies to isolate our service logic.
vi.mock('./llm.js', () => ({
  llm: {}, // The llm object is just a placeholder in the chain now.
}));

// We mock the chain construction process to always end with our mockInvoke function.
// This allows us to control the "LLM's response" for every test.
vi.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    fromTemplate: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnThis(), // chain.pipe(step) returns the chain
      invoke: mockInvoke,
    }),
  },
}));

vi.mock('@langchain/core/output_parsers', () => ({
  JsonOutputParser: vi.fn().mockImplementation(() => ({
    getFormatInstructions: vi.fn().mockReturnValue('json_format_instructions'),
  })),
  StringOutputParser: vi.fn(),
}));

describe('llmService', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('generateClarifyingQuestions', () => {
    it('should return an array of questions on success', async () => {
      const mockQuestions = ['Question 1?', 'Question 2?'];
      mockInvoke.mockResolvedValue({ questions: mockQuestions });

      const result = await generateClarifyingQuestions('a cat');
      expect(result).toEqual(mockQuestions);
      expect(mockInvoke).toHaveBeenCalledWith({
        prompt: 'a cat',
        format_instructions: 'json_format_instructions',
      });
    });

    it('should return an empty array if the LLM result is malformed', async () => {
      mockInvoke.mockResolvedValue({ not_questions: [] });
      const result1 = await generateClarifyingQuestions('a dog');
      expect(result1).toEqual([]);

      mockInvoke.mockResolvedValue(null);
      const result2 = await generateClarifyingQuestions('a bird');
      expect(result2).toEqual([]);
    });

    it('should return default questions on LLM error', async () => {
      mockInvoke.mockRejectedValue(new Error('LLM failed'));
      const defaultQuestions = [
        'Can you describe the main subject of the image?',
        'What art style are you imagining (e.g., photorealistic, anime, abstract)?',
        'What is the overall mood or feeling you want to convey?',
      ];

      const result = await generateClarifyingQuestions('a fish');
      expect(result).toEqual(defaultQuestions);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error generating clarifying questions:',
        expect.any(Error)
      );
    });
  });

  describe('isUserFinished', () => {
    it('should return true if LLM response contains "YES"', async () => {
      mockInvoke.mockResolvedValue('YES, the user is finished.');
      const result = await isUserFinished("that's it");
      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith({ response: "that's it" });
    });

    it('should return true for case-insensitive "yes"', async () => {
      mockInvoke.mockResolvedValue('yes');
      const result = await isUserFinished('go ahead');
      expect(result).toBe(true);
    });

    it('should return false if LLM response does not contain "YES"', async () => {
      mockInvoke.mockResolvedValue('NO');
      const result = await isUserFinished('add more blue');
      expect(result).toBe(false);
    });

    it('should return false for empty or null user response without calling LLM', async () => {
      const result1 = await isUserFinished('');
      expect(result1).toBe(false);
      const result2 = await isUserFinished(null);
      expect(result2).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('should return false on LLM error', async () => {
      mockInvoke.mockRejectedValue(new Error('LLM failed'));
      const result = await isUserFinished('I am done');
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error determining if user is finished:',
        expect.any(Error)
      );
    });
  });

  describe('updateRefinedPrompt', () => {
    const currentPrompt = 'A cat sitting on a mat.';
    const userResponse = 'Make the cat orange.';
    const history = [
      { type: 'assistant', message: 'What color is the cat?' },
      { type: 'user', message: 'Make the cat orange.' },
    ];

    it('should return the updated prompt from the LLM', async () => {
      const updatedPrompt = 'An orange cat sitting on a mat.';
      mockInvoke.mockResolvedValue(updatedPrompt);

      const result = await updateRefinedPrompt(currentPrompt, userResponse, history);
      expect(result).toBe(updatedPrompt);
      expect(mockInvoke).toHaveBeenCalledWith({
        current_prompt: currentPrompt,
        user_response: userResponse,
        history: 'assistant: What color is the cat?\nuser: Make the cat orange.',
      });
    });

    it('should handle null or undefined history', async () => {
      const updatedPrompt = 'An orange cat sitting on a mat.';
      mockInvoke.mockResolvedValue(updatedPrompt);

      const result = await updateRefinedPrompt(currentPrompt, userResponse, null);
      expect(result).toBe(updatedPrompt);
      expect(mockInvoke).toHaveBeenCalledWith({
        current_prompt: currentPrompt,
        user_response: userResponse,
        history: '',
      });
    });

    it('should return the current prompt if LLM returns an empty string', async () => {
      mockInvoke.mockResolvedValue('');
      const result = await updateRefinedPrompt(currentPrompt, userResponse, history);
      expect(result).toBe(currentPrompt);
    });

    it('should return the current prompt on LLM error', async () => {
      mockInvoke.mockRejectedValue(new Error('LLM failed'));
      const result = await updateRefinedPrompt(currentPrompt, userResponse, history);
      expect(result).toBe(currentPrompt);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error updating refined prompt:',
        expect.any(Error)
      );
    });
  });

  describe('compileFinalPrompt', () => {
    it('should return the provided prompt directly', async () => {
      const finalPrompt = 'A final, polished, and detailed prompt.';
      const result = await compileFinalPrompt(finalPrompt);
      expect(result).toBe(finalPrompt);
    });
  });

  describe('getUrlFromUserInputUsingAi', () => {
    it('should extract a YouTube URL correctly', async () => {
      const mockResponse = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        isYoutubeUrl: true,
      };
      mockInvoke.mockResolvedValue(mockResponse);

      const result = await getUrlFromUserInputUsingAi(
        'check this video https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
      expect(result).toEqual(mockResponse);
      expect(mockInvoke).toHaveBeenCalledWith({
        user_input: 'check this video https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        format_instructions: 'json_format_instructions',
      });
    });

    it('should extract a non-YouTube URL correctly', async () => {
      const mockResponse = { url: 'https://example.com', isYoutubeUrl: false };
      mockInvoke.mockResolvedValue(mockResponse);

      const result = await getUrlFromUserInputUsingAi('my blog is at https://example.com');
      expect(result).toEqual(mockResponse);
    });

    it('should handle cases where no URL is found', async () => {
      const mockResponse = { url: null, isYoutubeUrl: false };
      mockInvoke.mockResolvedValue(mockResponse);

      const result = await getUrlFromUserInputUsingAi('Hello, how are you?');
      expect(result).toEqual(mockResponse);
    });

    it('should handle malformed LLM responses gracefully', async () => {
      mockInvoke.mockResolvedValue({ url: 'https://example.com' }); // isYoutubeUrl is missing
      let result = await getUrlFromUserInputUsingAi('input');
      expect(result).toEqual({ url: 'https://example.com', isYoutubeUrl: false });

      mockInvoke.mockResolvedValue({ isYoutubeUrl: true }); // url is missing
      result = await getUrlFromUserInputUsingAi('input');
      expect(result).toEqual({ url: null, isYoutubeUrl: true });

      mockInvoke.mockResolvedValue(null); // response is null
      result = await getUrlFromUserInputUsingAi('input');
      expect(result).toEqual({ url: null, isYoutubeUrl: false });
    });

    it('should return a default object on LLM error', async () => {
      mockInvoke.mockRejectedValue(new Error('LLM failed'));
      const result = await getUrlFromUserInputUsingAi('some input with a url');
      expect(result).toEqual({ url: null, isYoutubeUrl: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error extracting URL from user input:',
        expect.any(Error)
      );
    });
  });
});