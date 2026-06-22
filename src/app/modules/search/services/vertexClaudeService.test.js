import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vertexClaudeService } from './vertexClaudeService.js';
import { GoogleAuth } from 'google-auth-library';

// Mock google-auth-library
vi.mock('google-auth-library', () => {
  const mockRequest = vi.fn();
  const mockGetClient = vi.fn().mockResolvedValue({
    request: mockRequest,
  });
  return {
    GoogleAuth: vi.fn().mockImplementation(function () {
      return {
        getClient: mockGetClient,
      };
    }),
    _mockRequest: mockRequest,
    _mockGetClient: mockGetClient,
  };
});

// Mock config
vi.mock('../../../../../config/index.js', () => ({
  default: {
    google: {
      gcp_project_id: 'test-project',
      gcp_location: 'us-east5',
    },
    gcp: {
      projectId: 'test-project',
      location: 'us-east5',
    },
    claude: {
      maxTokens: 4096,
      temperature: 0.7,
    },
  },
}));

describe('VertexClaudeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('preparePayload', () => {
    it('should extract system prompt and alternate roles', () => {
      const messages = [
        { role: 'system', content: 'You are a coder.' },
        { role: 'user', content: 'Hello' },
        { role: 'system', content: 'Always return JSON.' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'Help me' },
      ];

      const { systemPrompt, formattedMessages } = vertexClaudeService.preparePayload(messages);

      expect(systemPrompt).toBe('You are a coder.\n\nAlways return JSON.');
      expect(formattedMessages).toHaveLength(3);
      expect(formattedMessages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(formattedMessages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
      expect(formattedMessages[2]).toEqual({ role: 'user', content: 'Help me' });
    });

    it('should merge consecutive messages of the same role', () => {
      const messages = [
        { role: 'user', content: 'Part 1' },
        { role: 'user', content: 'Part 2' },
        { role: 'assistant', content: 'Response' },
      ];

      const { formattedMessages } = vertexClaudeService.preparePayload(messages);

      expect(formattedMessages).toHaveLength(2);
      expect(formattedMessages[0]).toEqual({ role: 'user', content: 'Part 1\n\nPart 2' });
      expect(formattedMessages[1]).toEqual({ role: 'assistant', content: 'Response' });
    });

    it('should prepend a user message if conversation starts with assistant role', () => {
      const messages = [
        { role: 'assistant', content: 'Hello, I am assistant' },
        { role: 'user', content: 'Hi' },
      ];

      const { formattedMessages } = vertexClaudeService.preparePayload(messages);

      expect(formattedMessages[0].role).toBe('user');
      expect(formattedMessages[1].role).toBe('assistant');
    });
  });

  describe('generateText', () => {
    it('should call the correct Vertex AI Endpoint with rawPredict payload', async () => {
      const authModule = await import('google-auth-library');
      const mockRequest = authModule._mockRequest;
      
      mockRequest.mockResolvedValue({
        data: {
          content: [{ type: 'text', text: 'Generated code response' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      });

      const messages = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Test prompt' },
      ];

      const result = await vertexClaudeService.generateText(messages, {
        temperature: 0.1,
        maxTokens: 1024,
      });

      expect(mockRequest).toHaveBeenCalledTimes(1);
      const callArgs = mockRequest.mock.calls[0][0];
      
      expect(callArgs.url).toContain('/publishers/anthropic/models/claude-4-5-sonnet@20250219:rawPredict');
      expect(callArgs.method).toBe('POST');
      expect(callArgs.data).toEqual({
        anthropic_version: 'vertex-2023-10-16',
        messages: [{ role: 'user', content: 'Test prompt' }],
        system: 'System prompt',
        temperature: 0.1,
        max_tokens: 1024,
      });

      expect(result).toEqual({
        text: 'Generated code response',
        content: [{ type: 'text', text: 'Generated code response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      });
    });

    it('should throw an error if the request fails', async () => {
      const authModule = await import('google-auth-library');
      const mockRequest = authModule._mockRequest;
      
      mockRequest.mockRejectedValue(new Error('Network Error'));

      await expect(vertexClaudeService.generateText([{ role: 'user', content: 'Hello' }]))
        .rejects
        .toThrow('Vertex Claude invocation failed: Network Error');
    });
  });
});
