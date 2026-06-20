import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-api-key',
  },
}));

vi.mock('@google-cloud/aiplatform', () => ({
  PredictionServiceClient: vi.fn(),
}));

const {
  mockPipe,
  mockInvoke
} = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const mockPipe = vi.fn().mockReturnValue({
    invoke: mockInvoke,
  });

  return {
    mockPipe,
    mockInvoke
  };
});

vi.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    fromTemplate: vi.fn().mockReturnValue({
      pipe: mockPipe,
    }),
  },
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn().mockImplementation(function() { return {}; }),
}));

const { isUserFinished, llm } = await import('./llm.js');

describe('llm module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isUserFinished', () => {
    it('should return false if userResponse is undefined, null, or empty string', async () => {
      expect(await isUserFinished(undefined)).toBe(false);
      expect(await isUserFinished(null)).toBe(false);
      expect(await isUserFinished('')).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('should return true if the LLM response contains "YES" (case-insensitive)', async () => {
      mockInvoke.mockResolvedValueOnce({ content: 'YES' });
      const result = await isUserFinished('that is all');
      expect(result).toBe(true);
      expect(mockPipe).toHaveBeenCalledWith(llm);
      expect(mockInvoke).toHaveBeenCalledWith({ response: 'that is all' });
    });

    it('should return true if the LLM response contains "yes" in lowercase', async () => {
      mockInvoke.mockResolvedValueOnce({ content: 'yes' });
      const result = await isUserFinished('yes');
      expect(result).toBe(true);
    });

    it('should return false if the LLM response does not contain "YES"', async () => {
      mockInvoke.mockResolvedValueOnce({ content: 'NO' });
      const result = await isUserFinished('add a cat');
      expect(result).toBe(false);
    });

    it('should return false if the LLM response is empty or does not match', async () => {
      mockInvoke.mockResolvedValueOnce({ content: '' });
      const result = await isUserFinished('maybe');
      expect(result).toBe(false);
    });
  });
});