import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const {
  mockChain
} = vi.hoisted(() => {
  // Mock dependencies before importing the module under test
  const mockChain = {
    invoke: vi.fn(),
  };

  return {
    mockChain
  };
});

// A simplified mock of the LangChain piping process
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn(),
}));

vi.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    fromTemplate: vi.fn().mockImplementation(() => ({
      pipe: vi.fn().mockReturnThis(), // chain .pipe(model)
    })),
  },
}));

vi.mock('@langchain/core/output_parsers', () => ({
  StructuredOutputParser: {
    fromZodSchema: vi.fn().mockImplementation(() => ({
      getFormatInstructions: vi.fn().mockImplementation(() => 'mock_format_instructions'),
      // The final part of the chain is the parser, which we replace with our mock chain
      // This allows us to mock the final .invoke() call easily.
      // The actual implementation is prompt.pipe(model).pipe(parser), so we mock the result of the final pipe.
      ...mockChain,
    })),
  },
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'config_api_key',
    google: {
      gcp_project_id: 'test-project',
      vertex_ai_region: 'test-region',
    },
  },
}));

// Now import the module under test
import {
  classifyImageGenIntent,
  routeImageGenRequest,
  resetConversationMemory,
  clearAllConversationMemories,
  getConversationHistory,
} from './intentClassifier.js';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

// Re-wire the mock chain to be the result of the full pipe sequence
const mockParserInstance = StructuredOutputParser.fromZodSchema();
const mockPromptInstance = PromptTemplate.fromTemplate();
mockPromptInstance.pipe.mockReturnValue({ pipe: vi.fn().mockImplementation(() => mockParserInstance) });


describe('intentClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the memory store before each test to ensure isolation
    clearAllConversationMemories();
  });

  afterEach(() => {
    // Clean up environment variables
    vi.unstubAllEnvs();
  });

  describe('classifyImageGenIntent', () => {
    it('should throw an error if sessionId is not provided', async () => {
      await expect(
        classifyImageGenIntent('a request', { sessionId: undefined })
      ).rejects.toThrow(
        'A sessionId is required to maintain conversation context and ensure data isolation.'
      );
    });

    it('should throw an error if API key is missing from all sources', async () => {
      // Temporarily remove the config key for this test
      vi.mock('../../../../../config/index.js', () => ({
        default: { google: {} },
      }));
      // Unset env var
      vi.stubEnv('GEMINI_API_KEY', '');

      await expect(
        classifyImageGenIntent('a request', { sessionId: '123' })
      ).rejects.toThrow(
        'Google Generative AI API key is missing. Please provide it in the options or configure it in the environment.'
      );

      // Restore mock
      vi.mock('../../../../../config/index.js', () => ({
        default: {
          gemini_secret_key: 'config_api_key',
          google: { gcp_project_id: 'test-project', vertex_ai_region: 'test-region' },
        },
      }));
    });

    it('should use API key from options if provided', async () => {
      mockChain.invoke.mockResolvedValue({ service: 'imagen4', reasoning: 'test', confidence: 0.9 });
      await classifyImageGenIntent('a request', { sessionId: '123', apiKey: 'options_api_key' });
      expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith(expect.objectContaining({
        apiKey: 'options_api_key',
      }));
    });

    it('should use API key from config if not in options', async () => {
      mockChain.invoke.mockResolvedValue({ service: 'imagen4', reasoning: 'test', confidence: 0.9 });
      await classifyImageGenIntent('a request', { sessionId: '123' });
      expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith(expect.objectContaining({
        apiKey: 'config_api_key',
      }));
    });

    it('should use API key from environment if not in options or config', async () => {
      vi.mock('../../../../../config/index.js', () => ({
        default: { google: {} },
      }));
      vi.stubEnv('GEMINI_API_KEY', 'env_api_key');
      mockChain.invoke.mockResolvedValue({ service: 'imagen4', reasoning: 'test', confidence: 0.9 });

      await classifyImageGenIntent('a request', { sessionId: '123' });

      expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith(expect.objectContaining({
        apiKey: 'env_api_key',
      }));
    });

    it('should create a new memory for a new sessionId and classify intent', async () => {
      const mockResult = {
        service: 'imagen4',
        reasoning: 'User wants a photorealistic image.',
        confidence: 0.95,
      };
      mockChain.invoke.mockResolvedValue(mockResult);

      const result = await classifyImageGenIntent('A photorealistic cat', { sessionId: 'session-1' });

      expect(result).toEqual(mockResult);
      expect(mockChain.invoke).toHaveBeenCalledWith({
        userRequest: 'A photorealistic cat',
        history: 'No previous conversation.',
        format_instructions: 'mock_format_instructions',
      });

      // Check if the conversation was saved
      const history = await getConversationHistory('session-1');
      expect(history).toContain('1. User: A photorealistic cat');
      expect(history).toContain('Assistant: Selected service: imagen4. Reasoning: User wants a photorealistic image.');
    });

    it('should use existing history for a known sessionId', async () => {
      const mockResult1 = { service: 'imagen4', reasoning: 'photo', confidence: 0.9 };
      const mockResult2 = { service: 'gemini2.5flash', reasoning: 'edit', confidence: 0.8 };
      mockChain.invoke.mockResolvedValueOnce(mockResult1).mockResolvedValueOnce(mockResult2);

      // First call to establish history
      await classifyImageGenIntent('A photorealistic dog', { sessionId: 'session-2' });

      // Second call
      await classifyImageGenIntent('Now make it wear a hat', { sessionId: 'session-2' });

      expect(mockChain.invoke).toHaveBeenCalledTimes(2);
      const secondCallArgs = mockChain.invoke.mock.calls[1][0];
      expect(secondCallArgs.userRequest).toBe('Now make it wear a hat');
      expect(secondCallArgs.history).toContain('1. User: A photorealistic dog');
      expect(secondCallArgs.history).toContain('Assistant: Selected service: imagen4. Reasoning: photo');
    });

    it('should maintain separate context boundaries for different sessionIds', async () => {
      mockChain.invoke
        .mockResolvedValueOnce({ service: 'imagen4', reasoning: 'photo', confidence: 0.9 })
        .mockResolvedValueOnce({ service: 'gemini2.5flash', reasoning: 'fast', confidence: 0.8 });

      // First call for session A
      await classifyImageGenIntent('A photorealistic dog', { sessionId: 'session-A' });
      const historyA = await getConversationHistory('session-A');
      expect(historyA).toContain('A photorealistic dog');

      // First call for session B
      await classifyImageGenIntent('A quick sketch of a bird', { sessionId: 'session-B' });
      const historyB = await getConversationHistory('session-B');
      expect(historyB).toContain('A quick sketch of a bird');
      expect(historyB).not.toContain('A photorealistic dog'); // Ensure isolation

      // Check that session A's history is unchanged
      const historyA_after = await getConversationHistory('session-A');
      expect(historyA_after).toEqual(historyA);
    });

    it('should handle and re-throw errors from the model chain', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const modelError = new Error('Model failed');
      mockChain.invoke.mockRejectedValue(modelError);

      await expect(
        classifyImageGenIntent('some request', { sessionId: 'error-session' })
      ).rejects.toThrow('Failed to get a response from the classification model. Reason: Model failed');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[IntentClassifier] Failed to classify intent for session error-session:',
        modelError
      );
      consoleSpy.mockRestore();
    });
  });

  describe('routeImageGenRequest', () => {
    it('should call classifyImageGenIntent and add boolean flags for imagen4', async () => {
      const intent = {
        service: 'imagen4',
        reasoning: 'photoreal',
        confidence: 0.9,
      };
      mockChain.invoke.mockResolvedValue(intent);

      const result = await routeImageGenRequest('a photorealistic cat', { sessionId: 'router-1' });

      expect(result).toEqual({
        ...intent,
        shouldUseImagen4: true,
        shouldUseGemini25Flash: false,
      });
    });

    it('should call classifyImageGenIntent and add boolean flags for gemini2.5flash', async () => {
      const intent = {
        service: 'gemini2.5flash',
        reasoning: 'fast generation',
        confidence: 0.85,
      };
      mockChain.invoke.mockResolvedValue(intent);

      const result = await routeImageGenRequest('a quick sketch', { sessionId: 'router-2' });

      expect(result).toEqual({
        ...intent,
        shouldUseImagen4: false,
        shouldUseGemini25Flash: true,
      });
    });
  });

  describe('Memory Management', () => {
    // Populate memory before each test in this block
    beforeEach(async () => {
      mockChain.invoke.mockResolvedValue({ service: 'imagen4', reasoning: 'test', confidence: 1 });
      await classifyImageGenIntent('request 1', { sessionId: 'mem-session-1' });
      await classifyImageGenIntent('request 2', { sessionId: 'mem-session-2' });
    });

    it('getConversationHistory should retrieve the correct history', async () => {
      const history = await getConversationHistory('mem-session-1');
      expect(history).toContain('1. User: request 1');
      expect(history).not.toContain('request 2');
    });

    it('getConversationHistory should return a default message for an unknown session', async () => {
      const history = await getConversationHistory('unknown-session');
      expect(history).toBe('No conversation history.');
    });

    it('getConversationHistory should return a default message for a null sessionId', async () => {
      const history = await getConversationHistory(null);
      expect(history).toBe('No conversation history.');
    });

    it('resetConversationMemory should delete the specified session history', async () => {
      let history1 = await getConversationHistory('mem-session-1');
      expect(history1).not.toBe('No conversation history.');

      resetConversationMemory('mem-session-1');

      history1 = await getConversationHistory('mem-session-1');
      expect(history1).toBe('No conversation history.');

      // Ensure other sessions are unaffected
      const history2 = await getConversationHistory('mem-session-2');
      expect(history2).not.toBe('No conversation history.');
    });

    it('resetConversationMemory should do nothing if sessionId is null or undefined', () => {
      expect(() => resetConversationMemory(null)).not.toThrow();
      expect(() => resetConversationMemory(undefined)).not.toThrow();
    });

    it('clearAllConversationMemories should delete all session histories', async () => {
      let history1 = await getConversationHistory('mem-session-1');
      let history2 = await getConversationHistory('mem-session-2');
      expect(history1).not.toBe('No conversation history.');
      expect(history2).not.toBe('No conversation history.');

      clearAllConversationMemories();

      history1 = await getConversationHistory('mem-session-1');
      history2 = await getConversationHistory('mem-session-2');
      expect(history1).toBe('No conversation history.');
      expect(history2).toBe('No conversation history.');
    });
  });
});