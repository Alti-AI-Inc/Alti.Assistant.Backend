import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { search } from './serper.service.js';

// Mock the axios module
vi.mock('axios');

describe('Serper Service', () => {
    const originalEnv = process.env;
    let consoleErrorSpy;

    const SERPER_API_URL = 'https://google.serper.dev/search';
    const REQUEST_TIMEOUT_MS = 8000;

    beforeEach(() => {
        // Reset mocks and environment before each test
        vi.resetAllMocks();
        process.env = { ...originalEnv, SERPER_API_KEY: 'test-api-key' };
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore original environment and console
        process.env = originalEnv;
        consoleErrorSpy.mockRestore();
    });

    describe('search', () => {
        it('should return search results on a successful API call with a simple query', async () => {
            const mockResponse = { data: { searchResults: [{ title: 'Test Result' }] } };
            axios.post.mockResolvedValue(mockResponse);

            const query = 'test query';
            const results = await search(query);

            expect(results).toEqual(mockResponse.data);
            expect(axios.post).toHaveBeenCalledTimes(1);
            expect(axios.post).toHaveBeenCalledWith(
                SERPER_API_URL,
                { q: query },
                {
                    headers: {
                        'X-API-KEY': 'test-api-key',
                        'Content-Type': 'application/json'
                    },
                    timeout: REQUEST_TIMEOUT_MS
                }
            );
        });

        it('should correctly sanitize and include allowed options in the API call', async () => {
            const mockResponse = { data: { success: true } };
            axios.post.mockResolvedValue(mockResponse);

            const query = 'advanced search';
            const options = {
                gl: 'us',
                hl: 'en',
                num: 20,
                searchType: 'images',
                page: 2,
                autocorrect: false,
                // These should be filtered out
                invalidOption: 'should be ignored',
                tbs: null, // should be ignored
                anotherInvalid: undefined, // should be ignored
            };

            await search(query, options);

            expect(axios.post).toHaveBeenCalledTimes(1);
            expect(axios.post).toHaveBeenCalledWith(
                SERPER_API_URL,
                {
                    q: query,
                    gl: 'us',
                    hl: 'en',
                    num: 20,
                    searchType: 'images',
                    page: 2,
                    autocorrect: false,
                },
                expect.any(Object)
            );
        });

        it('should trim leading/trailing whitespace from the query', async () => {
            axios.post.mockResolvedValue({ data: {} });
            const query = '  padded query  ';
            await search(query);

            expect(axios.post).toHaveBeenCalledWith(
                SERPER_API_URL,
                { q: 'padded query' },
                expect.any(Object)
            );
        });

        it('should throw an error if the query is an empty string', async () => {
            await expect(search('')).rejects.toThrow('Search query must be a non-empty string.');
        });

        it('should throw an error if the query is only whitespace', async () => {
            await expect(search('   ')).rejects.toThrow('Search query must be a non-empty string.');
        });

        it('should throw an error if the query is not a string', async () => {
            await expect(search(null)).rejects.toThrow('Search query must be a non-empty string.');
            await expect(search(undefined)).rejects.toThrow('Search query must be a non-empty string.');
            await expect(search(123)).rejects.toThrow('Search query must be a non-empty string.');
            await expect(search({})).rejects.toThrow('Search query must be a non-empty string.');
        });

        it('should throw a configuration error if SERPER_API_KEY is not set', async () => {
            delete process.env.SERPER_API_KEY;

            await expect(search('test query')).rejects.toThrow('Search service is not properly configured.');
            expect(consoleErrorSpy).toHaveBeenCalledWith('SERPER_API_KEY is not configured in environment variables.');
        });

        it('should throw a generic error on a non-timeout API failure', async () => {
            const apiError = {
                response: {
                    data: { message: 'Invalid API key' }
                }
            };
            axios.post.mockRejectedValue(apiError);

            await expect(search('test query')).rejects.toThrow('Failed to perform search due to an issue with an external service.');
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error calling Serper API for query: "test query". Error: {"message":"Invalid API key"}'
            );
        });

        it('should throw a specific error on an API timeout', async () => {
            const timeoutError = {
                code: 'ECONNABORTED'
            };
            axios.post.mockRejectedValue(timeoutError);

            await expect(search('test query')).rejects.toThrow('The search request took too long to complete. Please try again.');
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                `Serper API request timed out after ${REQUEST_TIMEOUT_MS}ms for query: "test query"`
            );
        });

        it('should handle non-axios errors gracefully', async () => {
            const genericError = new Error('Network issue');
            axios.post.mockRejectedValue(genericError);

            await expect(search('test query')).rejects.toThrow('Failed to perform search due to an issue with an external service.');
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error calling Serper API for query: "test query". Error: Network issue'
            );
        });
    });
});