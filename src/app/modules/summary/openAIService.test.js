import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUrlFromUserInputUsingAi } from './openAIService';

// Mock Langchain components to control the chain's behavior
const mockInvoke = vi.fn(); // This will be the final 'invoke' method of the mocked chain

// Mock the chain structure: prompt.pipe(geminiClient).pipe(new JsonOutputParser()).invoke()
const mockChainAfterJsonParser = {
  invoke: mockInvoke,
};

const mockChainAfterGemini = {
  pipe: vi.fn(() => mockChainAfterJsonParser), // This pipe is for JsonOutputParser
};

const mockPromptTemplateInstance = {
  pipe: vi.fn(() => mockChainAfterGemini), // This pipe is for geminiClient
};

const mockPromptTemplate = {
  fromTemplate: vi.fn(() => mockPromptTemplateInstance),
};

// Mock the external modules
vi.mock('@langchain/core/prompts', () => ({
  PromptTemplate: mockPromptTemplate,
}));

vi.mock('@langchain/core/output_parsers', () => ({
  JsonOutputParser: vi.fn(() => ({})), // Mock the constructor, actual methods not needed as we mock the chain's invoke
}));

vi.mock('./llm.js', () => ({
  geminiClient: {}, // Mock the client, actual methods not needed as we mock the chain's invoke
}));

describe('getUrlFromUserInputUsingAi', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
    // Spy on console.error to prevent actual logging during tests and to assert calls
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error to its original implementation after each test
    consoleErrorSpy.mockRestore();
  });

  it('should extract a non-YouTube URL successfully when AI returns a valid URL', async () => {
    const userInput = 'Please summarize this article: https://example.com/article';
    const aiResponse = { url: 'https://example.com/article', isYoutubeUrl: false };

    // Configure the mock chain's invoke to resolve with the desired AI response
    mockInvoke.mockResolvedValue(aiResponse);

    const result = await getUrlFromUserInputUsingAi(userInput);

    // Assert that PromptTemplate.fromTemplate was called
    expect(mockPromptTemplate.fromTemplate).toHaveBeenCalledTimes(1);
    // Assert that the chain's invoke method was called with the correct input
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith({ user_input: userInput });
    // Assert the function returned the expected result
    expect(result).toEqual(aiResponse);
    // Assert that no errors were logged
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should extract a YouTube URL successfully when AI identifies it', async () => {
    const userInput = 'Watch this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const aiResponse = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', isYoutubeUrl: true };

    mockInvoke.mockResolvedValue(aiResponse);

    const result = await getUrlFromUserInputUsingAi(userInput);

    expect(mockPromptTemplate.fromTemplate).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith({ user_input: userInput });
    expect(result).toEqual(aiResponse);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return null URL if no URL is found by AI', async () => {
    const userInput = 'Just a random sentence without any links.';
    const aiResponse = { url: null, isYoutubeUrl: false };

    mockInvoke.mockResolvedValue(aiResponse);

    const result = await getUrlFromUserInputUsingAi(userInput);

    expect(mockPromptTemplate.fromTemplate).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith({ user_input: userInput });
    expect(result).toEqual(aiResponse);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle AI processing errors gracefully and return default null URL', async () => {
    const userInput = 'Some input that causes an AI error.';
    const error = new Error('Simulated AI processing failure');

    // Configure the mock chain's invoke to reject with an error
    mockInvoke.mockRejectedValue(error);

    const result = await getUrlFromUserInputUsingAi(userInput);

    expect(mockPromptTemplate.fromTemplate).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith({ user_input: userInput });
    // Assert that the function returned the default error structure
    expect(result).toEqual({ url: null, isYoutubeUrl: false });
    // Assert that the error was logged to console.error
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error processing AI request to extract URL:', error);
  });

  it('should handle cases where AI returns malformed JSON (which would cause JsonOutputParser to throw)', async () => {
    const userInput = 'Input leading to malformed AI output.';
    // Simulate an error that JsonOutputParser would throw if the AI output was not valid JSON
    const parsingError = new Error('Failed to parse JSON from AI output');

    mockInvoke.mockRejectedValue(parsingError);

    const result = await getUrlFromUserInputUsingAi(userInput);

    expect(mockPromptTemplate.fromTemplate).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith({ user_input: userInput });
    expect(result).toEqual({ url: null, isYoutubeUrl: false });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error processing AI request to extract URL:', parsingError);
  });
});