import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fetchSearchResults } from './groq.utilities'; // Assuming the test file is in the same directory or a sibling test directory

// Mock the GoogleSearchGroundingTool dependency
const mockInvoke = vi.fn();
const MockGoogleSearchGroundingTool = vi.fn(() => ({
  invoke: mockInvoke,
}));

vi.mock('../deep_research/utils/google-search-grounding.js', () => ({
  GoogleSearchGroundingTool: MockGoogleSearchGroundingTool,
}));

describe('fetchSearchResults', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Reset mocks before each test
    MockGoogleSearchGroundingTool.mockClear();
    mockInvoke.mockClear();
    // Spy on console.error to check if errors are logged
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error after each test
    consoleErrorSpy.mockRestore();
  });

  it('should instantiate GoogleSearchGroundingTool with correct options and return transformed results on success', async () => {
    const mockQuery = 'test query';
    const mockToolResponse = {
      results: [
        { title: 'Result 1', url: 'http://link1.com', content: 'Snippet 1' },
        { title: 'Result 2', url: 'http://link2.com', content: 'Snippet 2' },
      ],
      answer: 'Some answer', // This should be ignored by our mapping
    };

    mockInvoke.mockResolvedValue(mockToolResponse);

    const expectedResults = [
      { title: 'Result 1', link: 'http://link1.com', snippet: 'Snippet 1' },
      { title: 'Result 2', link: 'http://link2.com', snippet: 'Snippet 2' },
    ];

    const results = await fetchSearchResults(mockQuery);

    // Expect GoogleSearchGroundingTool to be instantiated once with maxResults: 3
    expect(MockGoogleSearchGroundingTool).toHaveBeenCalledTimes(1);
    expect(MockGoogleSearchGroundingTool).toHaveBeenCalledWith({ maxResults: 3 });

    // Expect invoke to be called with the correct query and includeAnswer: false
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith({ query: mockQuery, includeAnswer: false });

    // Expect the results to be transformed correctly
    expect(results).toEqual(expectedResults);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return an empty array if search results are empty', async () => {
    const mockQuery = 'empty query';
    const mockToolResponse = {
      results: [],
      answer: 'No answer',
    };

    mockInvoke.mockResolvedValue(mockToolResponse);

    const results = await fetchSearchResults(mockQuery);

    expect(results).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith({ query: mockQuery, includeAnswer: false });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return an empty array if search results property is missing or undefined', async () => {
    const mockQuery = 'no results property';
    const mockToolResponse = {
      answer: 'No answer',
    }; // Missing 'results' property

    mockInvoke.mockResolvedValue(mockToolResponse);

    const results = await fetchSearchResults(mockQuery);

    expect(results).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith({ query: mockQuery, includeAnswer: false });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle errors during GoogleSearchGroundingTool instantiation', async () => {
    const mockQuery = 'error during instantiation';
    const instantiationError = new Error('Failed to construct tool');

    // Make the constructor throw an error
    MockGoogleSearchGroundingTool.mockImplementationOnce(() => {
      throw instantiationError;
    });

    const results = await fetchSearchResults(mockQuery);

    // Expect the constructor to have been called
    expect(MockGoogleSearchGroundingTool).toHaveBeenCalledTimes(1);
    // Expect invoke not to be called since instantiation failed
    expect(mockInvoke).not.toHaveBeenCalled();
    // Expect console.error to be called with the error message
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Google Search Grounding Error in Groq utility:',
      instantiationError.message,
    );
    // Expect an empty array to be returned
    expect(results).toEqual([]);
  });

  it('should handle errors during invoke and return an empty array', async () => {
    const mockQuery = 'error during invoke';
    const invokeError = new Error('Search API failed');

    mockInvoke.mockRejectedValue(invokeError);

    const results = await fetchSearchResults(mockQuery);

    // Expect GoogleSearchGroundingTool to be instantiated
    expect(MockGoogleSearchGroundingTool).toHaveBeenCalledTimes(1);
    // Expect invoke to be called
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith({ query: mockQuery, includeAnswer: false });
    // Expect console.error to be called with the error message
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Google Search Grounding Error in Groq utility:',
      invokeError.message,
    );
    // Expect an empty array to be returned
    expect(results).toEqual([]);
  });
});