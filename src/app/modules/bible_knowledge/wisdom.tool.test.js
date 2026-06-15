import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WisdomSearchTool } from './wisdom.tool.js';

const {
    mockWisdomService
} = vi.hoisted(() => {
    // Mock the wisdomService dependency
    const mockWisdomService = {
        lookupPassage: vi.fn(),
        search: vi.fn(),
        formatVerses: vi.fn(),
    };

    return {
        mockWisdomService
    };
});

// Mock the entire module to inject the mock service
vi.mock('./wisdom.service.js', () => ({
    wisdomService: mockWisdomService,
}));

describe('WisdomSearchTool', () => {
    beforeEach(() => {
        // Clear all mocks before each test to ensure isolation
        vi.clearAllMocks();
    });

    // Test the static properties of the tool
    it('should have the correct name', () => {
        expect(WisdomSearchTool.name).toBe('wisdom_search');
    });

    it('should have a description of type string and not empty', () => {
        expect(WisdomSearchTool.description).toBeTypeOf('string');
        expect(WisdomSearchTool.description).not.toBe('');
    });

    it('should have a valid Zod schema that can parse valid inputs', () => {
        // Test valid lookup input
        const validLookupInput = { action: 'lookup', book: 'Enoch', chapter: 1, startVerse: 1 };
        expect(() => WisdomSearchTool.schema.parse(validLookupInput)).not.toThrow();

        // Test valid search input
        const validSearchInput = { action: 'search', query: 'light versus darkness' };
        expect(() => WisdomSearchTool.schema.parse(validSearchInput)).not.toThrow();

        // Test valid search input with optional book filter
        const validSearchWithBookInput = { action: 'search', query: 'humility', book: 'Imitation' };
        expect(() => WisdomSearchTool.schema.parse(validSearchWithBookInput)).not.toThrow();

        // Test invalid action (Zod should catch this)
        const invalidActionInput = { action: 'invalid', query: 'test' };
        expect(() => WisdomSearchTool.schema.parse(invalidActionInput)).toThrow();
    });

    // Test the 'func' method of the tool, which contains the core logic
    describe('func', () => {
        // --- Lookup Action Tests ---
        it('should successfully lookup a passage with start and end verse', async () => {
            const mockPassages = [
                { book: 'Enoch', chapter: 1, verse: 1, text: 'The words of the blessing of Enoch...' },
                { book: 'Enoch', chapter: 1, verse: 2, text: 'Wherewith he blessed the elect and the righteous...' },
            ];
            mockWisdomService.lookupPassage.mockReturnValue(mockPassages);
            mockWisdomService.formatVerses.mockReturnValue("Formatted: Enoch 1:1-2");

            const params = {
                action: 'lookup',
                book: 'Enoch',
                chapter: 1,
                startVerse: 1,
                endVerse: 2,
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.lookupPassage).toHaveBeenCalledWith('Enoch', 1, 1, 2);
            expect(mockWisdomService.formatVerses).toHaveBeenCalledWith(mockPassages);
            expect(result).toBe("Formatted: Enoch 1:1-2");
        });

        it('should successfully lookup a passage with only start verse', async () => {
            const mockPassages = [
                { book: 'Enoch', chapter: 1, verse: 1, text: 'The words of the blessing of Enoch...' },
            ];
            mockWisdomService.lookupPassage.mockReturnValue(mockPassages);
            mockWisdomService.formatVerses.mockReturnValue("Formatted: Enoch 1:1");

            const params = {
                action: 'lookup',
                book: 'Enoch',
                chapter: 1,
                startVerse: 1,
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.lookupPassage).toHaveBeenCalledWith('Enoch', 1, 1, undefined);
            expect(mockWisdomService.formatVerses).toHaveBeenCalledWith(mockPassages);
            expect(result).toBe("Formatted: Enoch 1:1");
        });

        it('should return an error if lookup parameters are missing (book)', async () => {
            const params = {
                action: 'lookup',
                chapter: 1,
                startVerse: 1,
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.lookupPassage).not.toHaveBeenCalled();
            expect(mockWisdomService.formatVerses).not.toHaveBeenCalled();
            expect(result).toBe("Error: For lookup, you must provide 'book', 'chapter', and 'startVerse'.");
        });

        it('should return an error if lookup parameters are missing (chapter)', async () => {
            const params = {
                action: 'lookup',
                book: 'Enoch',
                startVerse: 1,
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.lookupPassage).not.toHaveBeenCalled();
            expect(mockWisdomService.formatVerses).not.toHaveBeenCalled();
            expect(result).toBe("Error: For lookup, you must provide 'book', 'chapter', and 'startVerse'.");
        });

        it('should return an error if lookup parameters are missing (startVerse)', async () => {
            const params = {
                action: 'lookup',
                book: 'Enoch',
                chapter: 1,
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.lookupPassage).not.toHaveBeenCalled();
            expect(mockWisdomService.formatVerses).not.toHaveBeenCalled();
            expect(result).toBe("Error: For lookup, you must provide 'book', 'chapter', and 'startVerse'.");
        });

        it('should return "No passages found" for lookup if service returns empty', async () => {
            mockWisdomService.lookupPassage.mockReturnValue([]);

            const params = {
                action: 'lookup',
                book: 'Enoch',
                chapter: 1,
                startVerse: 1,
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.lookupPassage).toHaveBeenCalledWith('Enoch', 1, 1, undefined);
            expect(mockWisdomService.formatVerses).not.toHaveBeenCalled(); // formatVerses should not be called if no passages
            expect(result).toBe("No passages found for Enoch 1:1");
        });

        // --- Search Action Tests ---
        it('should successfully search for passages by query', async () => {
            const mockPassages = [
                { book: 'Enoch', chapter: 1, verse: 1, text: 'The words of the blessing of Enoch...' },
                { book: 'Augustine', chapter: 2, verse: 5, text: 'On the nature of light and darkness...' },
            ];
            mockWisdomService.search.mockReturnValue(mockPassages);

            const params = {
                action: 'search',
                query: 'light versus darkness',
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.search).toHaveBeenCalledWith('light versus darkness', 5, undefined);
            expect(mockWisdomService.formatVerses).not.toHaveBeenCalled(); // Search action formats internally
            expect(result).toContain("Top matches for 'light versus darkness':\n");
            expect(result).toContain("- [Enoch 1:1] The words of the blessing of Enoch...\n");
            expect(result).toContain("- [Augustine 2:5] On the nature of light and darkness...\n");
        });

        it('should successfully search for passages by query and book filter', async () => {
            const mockPassages = [
                { book: 'Enoch', chapter: 1, verse: 1, text: 'The words of the blessing of Enoch...' },
            ];
            mockWisdomService.search.mockReturnValue(mockPassages);

            const params = {
                action: 'search',
                query: 'blessing',
                book: 'Enoch',
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.search).toHaveBeenCalledWith('blessing', 5, 'Enoch');
            expect(result).toContain("Top matches for 'blessing':\n");
            expect(result).toContain("- [Enoch 1:1] The words of the blessing of Enoch...\n");
        });

        it('should return an error if search query is missing', async () => {
            const params = {
                action: 'search',
                book: 'Enoch', // Book is optional for search, but query is required by func
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.search).not.toHaveBeenCalled();
            expect(result).toBe("Error: For search, you must provide a 'query'.");
        });

        it('should return "No passages found" for search if service returns empty', async () => {
            mockWisdomService.search.mockReturnValue([]);

            const params = {
                action: 'search',
                query: 'nonexistent topic',
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.search).toHaveBeenCalledWith('nonexistent topic', 5, undefined);
            expect(result).toBe("No passages found matching 'nonexistent topic'.");
        });

        // --- Invalid Action Test ---
        it('should return "Invalid action" for an unknown action', async () => {
            const params = {
                action: 'unknown_action', // This would typically be caught by Zod, but testing func's internal fallback
                query: 'test',
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.lookupPassage).not.toHaveBeenCalled();
            expect(mockWisdomService.search).not.toHaveBeenCalled();
            expect(result).toBe("Invalid action.");
        });

        // --- Error Handling Tests ---
        it('should handle errors from wisdomService.lookupPassage gracefully', async () => {
            const errorMessage = "Database connection failed";
            mockWisdomService.lookupPassage.mockImplementation(() => {
                throw new Error(errorMessage);
            });

            const params = {
                action: 'lookup',
                book: 'Enoch',
                chapter: 1,
                startVerse: 1,
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.lookupPassage).toHaveBeenCalledOnce();
            expect(result).toBe(`Error accessing Wisdom data: ${errorMessage}`);
        });

        it('should handle errors from wisdomService.search gracefully', async () => {
            const errorMessage = "Search index corrupted";
            mockWisdomService.search.mockImplementation(() => {
                throw new Error(errorMessage);
            });

            const params = {
                action: 'search',
                query: 'error test',
            };

            const result = await WisdomSearchTool.func(params);

            expect(mockWisdomService.search).toHaveBeenCalledOnce();
            expect(result).toBe(`Error accessing Wisdom data: ${errorMessage}`);
        });
    });
});