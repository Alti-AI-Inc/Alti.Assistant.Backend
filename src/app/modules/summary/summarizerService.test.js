import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSummary } from './summarizerService.js';
import { claudeSummarizer } from './claudeService.js';

// Mock the claudeService module
vi.mock('./claudeService.js', () => ({
  claudeSummarizer: vi.fn(),
}));

describe('summarizerService', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('generateSummary', () => {
    const sampleContent = 'This is the content of a website about AI assistants.';
    const expectedSummary = 'The website is about AI assistants.';

    it('should call claudeSummarizer with the correct system prompt and formatted user content', async () => {
      claudeSummarizer.mockResolvedValue(expectedSummary);

      const history = [];
      const result = await generateSummary(sampleContent, history);

      expect(claudeSummarizer).toHaveBeenCalledTimes(1);

      const [messages, systemPrompt] = claudeSummarizer.mock.calls[0];

      // Verify the system prompt
      expect(systemPrompt).toContain('You are an expert summarization assistant.');
      expect(systemPrompt).toContain('provide a clear, concise, and accurate summary');

      // Verify the messages array
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe(`Please summarize the following content:\n---\n${sampleContent}\n---`);

      // Verify the return value
      expect(result).toBe(expectedSummary);
    });

    it('should correctly append the new user message to an existing conversation history', async () => {
      claudeSummarizer.mockResolvedValue(expectedSummary);

      const history = [
        { role: 'user', content: 'Hello there.' },
        { role: 'assistant', content: 'Hi! How can I help you today?' },
      ];

      await generateSummary(sampleContent, history);

      expect(claudeSummarizer).toHaveBeenCalledTimes(1);

      const [messages] = claudeSummarizer.mock.calls[0];

      // Verify the messages array structure and content
      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual(history[0]);
      expect(messages[1]).toEqual(history[1]);
      expect(messages[2].role).toBe('user');
      expect(messages[2].content).toContain(sampleContent);
    });

    it('should handle empty content string gracefully', async () => {
      claudeSummarizer.mockResolvedValue('No content provided to summarize.');

      const emptyContent = '';
      const history = [];
      await generateSummary(emptyContent, history);

      expect(claudeSummarizer).toHaveBeenCalledTimes(1);
      const [messages] = claudeSummarizer.mock.calls[0];
      expect(messages[0].content).toBe(`Please summarize the following content:\n---\n\n---`);
    });

    it('should propagate errors from the claudeSummarizer', async () => {
      const errorMessage = 'Claude API error';
      const apiError = new Error(errorMessage);
      claudeSummarizer.mockRejectedValue(apiError);

      const history = [];
      await expect(generateSummary(sampleContent, history)).rejects.toThrow(errorMessage);

      expect(claudeSummarizer).toHaveBeenCalledTimes(1);
    });

    it('should not modify the original history array (immutability)', async () => {
      claudeSummarizer.mockResolvedValue(expectedSummary);

      const originalHistory = [
        { role: 'user', content: 'Previous question.' },
      ];
      const historyCopy = [...originalHistory]; // Create a copy for comparison

      await generateSummary(sampleContent, originalHistory);

      // Check that the original history array passed to the function was not mutated
      expect(originalHistory).toEqual(historyCopy);
      expect(originalHistory).toHaveLength(1);
    });
  });
});