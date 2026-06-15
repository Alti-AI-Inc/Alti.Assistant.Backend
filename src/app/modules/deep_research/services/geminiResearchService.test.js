import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSimpleGeminiResearchTask, runGeminiResearchTask } from './geminiResearchService.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

// Mock the config module
vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock_gemini_key',
  },
}));

const {
  mockInvoke,
  mockStream
} = vi.hoisted(() => {
  // Mock @langchain/google-genai
  const mockInvoke = vi.fn();
  const mockStream = vi.fn();

  return {
    mockInvoke,
    mockStream
  };
});

vi.mock('@langchain/google-genai', () => {
  return {
    ChatGoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      invoke: mockInvoke,
      stream: mockStream,
    })),
  };
});

describe('Gemini Research Service', () => {
  // Store original console methods
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Reset mocks before each test
    mockInvoke.mockReset();
    mockStream.mockReset();
    ChatGoogleGenerativeAI.mockClear(); // Clear constructor calls

    // Mock console methods
    console.log = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('should initialize ChatGoogleGenerativeAI with correct parameters on module load', () => {
    // Since llm is a top-level constant, its constructor is called when the module is first imported.
    // We can check the arguments passed to the constructor mock.
    expect(ChatGoogleGenerativeAI).toHaveBeenCalledTimes(1);
    expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      apiKey: 'mock_gemini_key', // From our config mock
      temperature: 0,
      maxRetries: 2,
    });
  });

  describe('runSimpleGeminiResearchTask', () => {
    it('should call llm.invoke with correct messages and return content on success', async () => {
      const mockState = {
        query: 'What is the capital of France?',
        searchResults: 'Paris is the capital of France. It is a major European city.',
      };
      const mockResponseContent = 'Paris is the capital of France. Sources: [1]';
      mockInvoke.mockResolvedValueOnce({ content: mockResponseContent });

      const result = await runSimpleGeminiResearchTask(mockState);

      expect(console.log).toHaveBeenCalledWith(
        'Running Gemini deep research task with search results:',
        mockState.searchResults
      );
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const invokeArgs = mockInvoke.mock.calls[0][0];
      expect(invokeArgs).toHaveLength(2);
      expect(invokeArgs[0]).toEqual({
        role: 'system',
        content: expect.stringContaining('You are an expert research assistant.'),
      });
      expect(invokeArgs[1]).toEqual({
        role: 'user',
        content: `state.searchResults: ${mockState.searchResults}\n\nQuery: ${mockState.query}`,
      });
      expect(result).toBe(mockResponseContent);
    });

    it('should handle errors from llm.invoke and return a specific error message', async () => {
      const mockState = {
        query: 'Test query',
        searchResults: 'Test results',
      };
      const mockError = new Error('Gemini API error');
      mockInvoke.mockRejectedValueOnce(mockError);

      const result = await runSimpleGeminiResearchTask(mockState);

      expect(console.error).toHaveBeenCalledWith('Error calling Gemini deep research API:', mockError);
      expect(result).toBe('Sorry, I encountered an error while processing your request with the coding model. Please try again.');
    });
  });

  describe('runGeminiResearchTask', () => {
    const mockSystemPrompt = 'You are a helpful assistant.';
    const mockInputMessages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'human', content: 'How are you?' },
      { role: 'ai', content: 'I am good, thank you.' },
      { role: 'unknown', content: 'What is this?' }, // Fallback case
    ];

    it('should call llm.invoke with correctly formatted messages and return content on success (no stream)', async () => {
      const mockResponseContent = 'Formatted response content.';
      mockInvoke.mockResolvedValueOnce({ content: mockResponseContent });

      const result = await runGeminiResearchTask(mockSystemPrompt, mockInputMessages, false);

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const invokeArgs = mockInvoke.mock.calls[0][0];
      expect(invokeArgs).toHaveLength(6); // 1 system + 5 input messages

      expect(invokeArgs[0]).toBeInstanceOf(SystemMessage);
      expect(invokeArgs[0].content).toBe(mockSystemPrompt);

      expect(invokeArgs[1]).toBeInstanceOf(HumanMessage);
      expect(invokeArgs[1].content).toBe('Hello');

      expect(invokeArgs[2]).toBeInstanceOf(SystemMessage); // assistant -> SystemMessage
      expect(invokeArgs[2].content).toBe('Hi there!');

      expect(invokeArgs[3]).toBeInstanceOf(HumanMessage);
      expect(invokeArgs[3].content).toBe('How are you?');

      expect(invokeArgs[4]).toBeInstanceOf(SystemMessage); // ai -> SystemMessage
      expect(invokeArgs[4].content).toBe('I am good, thank you.');

      expect(invokeArgs[5]).toBeInstanceOf(HumanMessage); // unknown -> HumanMessage (fallback)
      expect(invokeArgs[5].content).toBe('What is this?');

      expect(result).toBe(mockResponseContent);
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Streaming response'));
    });

    it('should call llm.stream with correctly formatted messages and return the stream object on success (stream = true)', async () => {
      const mockStreamObject = { /* mock stream object */ };
      mockStream.mockResolvedValueOnce(mockStreamObject);

      const result = await runGeminiResearchTask(mockSystemPrompt, mockInputMessages, true);

      expect(mockStream).toHaveBeenCalledTimes(1);
      const streamArgs = mockStream.mock.calls[0][0];
      expect(streamArgs).toHaveLength(6); // 1 system + 5 input messages

      expect(streamArgs[0]).toBeInstanceOf(SystemMessage);
      expect(streamArgs[0].content).toBe(mockSystemPrompt);

      expect(streamArgs[1]).toBeInstanceOf(HumanMessage);
      expect(streamArgs[1].content).toBe('Hello');
      expect(streamArgs[2]).toBeInstanceOf(SystemMessage);
      expect(streamArgs[2].content).toBe('Hi there!');

      expect(result).toBe(mockStreamObject);
      expect(console.log).toHaveBeenCalledWith('Streaming response from Gemini deep research API...', mockStreamObject);
    });

    it('should handle errors from llm.invoke and return a specific error message (no stream)', async () => {
      const mockError = new Error('Gemini API error for invoke');
      mockInvoke.mockRejectedValueOnce(mockError);

      const result = await runGeminiResearchTask(mockSystemPrompt, mockInputMessages, false);

      expect(console.error).toHaveBeenCalledWith('Error calling Gemini deep research API:', mockError);
      expect(result).toBe('Sorry, I encountered an error while processing your request with the coding model. Please try again.');
    });

    it('should handle errors from llm.stream and return a specific error message (stream = true)', async () => {
      const mockError = new Error('Gemini API error for stream');
      mockStream.mockRejectedValueOnce(mockError);

      const result = await runGeminiResearchTask(mockSystemPrompt, mockInputMessages, true);

      expect(console.error).toHaveBeenCalledWith('Error calling Gemini deep research API:', mockError);
      expect(result).toBe('Sorry, I encountered an error while processing your request with the coding model. Please try again.');
    });
  });
});