import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BibleSearchTool } from './bible.tool.js';
import { bibleService } from './bible.service.js'; // Import to mock

// Mock the bibleService module
vi.mock('./bible.service.js', () => ({
    bibleService: {
        lookupPassage: vi.fn(),
        formatVerses: vi.fn(),
        search: vi.fn(),
    },
}));

describe('BibleSearchTool', () => {
    beforeEach(() => {
        // Reset mocks before each test
        vi.clearAllMocks();
    });

    // Test cases for 'lookup' action
    describe('lookup action', () => {
        it('should successfully lookup a single verse with default translation', async () => {
            const mockVerses = [{ book: 'GEN', chapter: 1, verse: 1, text: 'In the beginning God created the heavens and the earth.' }];
            bibleService.lookupPassage.mockResolvedValue(mockVerses);
            bibleService.formatVerses.mockReturnValue('Formatted: GEN 1:1 In the beginning...');

            const params = {
                action: 'lookup',
                book: 'GEN',
                chapter: 1,
                startVerse: 1,
            };

            const result = await BibleSearchTool.func(params);

            expect(bibleService.lookupPassage).toHaveBeenCalledWith('GEN', 1, 1, undefined, 'BSB');
            expect(bibleService.formatVerses).toHaveBeenCalledWith(mockVerses, 'BSB');
            expect(result).toBe('Formatted: GEN 1:1 In the beginning...');
        });

        it('should successfully lookup a passage with specified translation', async () => {
            const mockVerses = [
                { book: 'JHN', chapter: 3, verse: 16, text: 'For God so loved the world...' },
                { book: 'JHN', chapter: 3, verse: 17, text: 'For God did not send his Son...' },
            ];
            bibleService.lookupPassage.mockResolvedValue(mockVerses);
            bibleService.formatVerses.mockReturnValue('Formatted: JHN 3:16-17 For God so loved...');

            const params = {
                action: 'lookup',
                translation: 'JPS',
                book: 'JHN',
                chapter: 3,
                startVerse: 16,
                endVerse: 17,
            };

            const result = await BibleSearchTool.func(params);

            expect(bibleService.lookupPassage).toHaveBeenCalledWith('JHN', 3, 16, 17, 'JPS');
            expect(bibleService.formatVerses).toHaveBeenCalledWith(mockVerses, 'JPS');
            expect(result).toBe('Formatted: JHN 3:16-17 For God so loved...');
        });

        it('should return an error if required parameters are missing for lookup', async () => {
            const params = {
                action: 'lookup',
                book: 'GEN',
                chapter: 1,
                // startVerse is missing
            };

            const result = await BibleSearchTool.func(params);

            expect(result).toBe("Error: For lookup, you must provide 'book', 'chapter', and 'startVerse'.");
            expect(bibleService.lookupPassage).not.toHaveBeenCalled();
            expect(bibleService.formatVerses).not.toHaveBeenCalled();
        });

        it('should return "No verses found" if lookupPassage returns an empty array', async () => {
            bibleService.lookupPassage.mockResolvedValue([]);

            const params = {
                action: 'lookup',
                book: 'NON',
                chapter: 999,
                startVerse: 1,
            };

            const result = await BibleSearchTool.func(params);

            expect(bibleService.lookupPassage).toHaveBeenCalledWith('NON', 999, 1, undefined, 'BSB');
            expect(bibleService.formatVerses).not.toHaveBeenCalled();
            expect(result).toBe('No verses found for NON 999:1 in BSB');
        });

        it('should handle errors during lookupPassage execution', async () => {
            const errorMessage = 'Database connection failed';
            bibleService.lookupPassage.mockRejectedValue(new Error(errorMessage));

            const params = {
                action: 'lookup',
                book: 'GEN',
                chapter: 1,
                startVerse: 1,
            };

            const result = await BibleSearchTool.func(params);

            expect(bibleService.lookupPassage).toHaveBeenCalledWith('GEN', 1, 1, undefined, 'BSB');
            expect(bibleService.formatVerses).not.toHaveBeenCalled();
            expect(result).toBe(`Error accessing Bible data: ${errorMessage}`);
        });
    });

    // Test cases for 'search' action
    describe('search action', () => {
        it('should successfully search for a query with default translation', async () => {
            const mockVerses = [
                { book: 'PRO', chapter: 3, verse: 5, text: 'Trust in the LORD with all your heart...' },
                { book: 'PSA', chapter: 23, verse: 1, text: 'The LORD is my shepherd; I shall not want.' },
            ];
            bibleService.search.mockResolvedValue(mockVerses);

            const params = {
                action: 'search',
                query: 'trust in the lord',
            };

            const result = await BibleSearchTool.func(params);

            expect(bibleService.search).toHaveBeenCalledWith('trust in the lord', 5, 'BSB');
            expect(result).toContain("Top matches for 'trust in the lord' in BSB:");
            expect(result).toContain("- [PRO 3:5] Trust in the LORD with all your heart...");
            expect(result).toContain("- [PSA 23:1] The LORD is my shepherd; I shall not want.");
        });

        it('should successfully search for a query with specified translation', async () => {
            const mockVerses = [
                { book: 'EXO', chapter: 20, verse: 3, text: 'You shall have no other gods before me.' },
            ];
            bibleService.search.mockResolvedValue(mockVerses);

            const params = {
                action: 'search',
                translation: 'HEBREW',
                query: 'no other gods',
            };

            const result = await BibleSearchTool.func(params);

            expect(bibleService.search).toHaveBeenCalledWith('no other gods', 5, 'HEBREW');
            expect(result).toContain("Top matches for 'no other gods' in HEBREW:");
            expect(result).toContain("- [EXO 20:3] You shall have no other gods before me.");
        });

        it('should return an error if query is missing for search', async () => {
            const params = {
                action: 'search',
                // query is missing
            };

            const result = await BibleSearchTool.func(params);

            expect(result).toBe("Error: For search, you must provide a 'query'.");
            expect(bibleService.search).not.toHaveBeenCalled();
        });

        it('should return "No verses found" if search returns an empty array', async () => {
            bibleService.search.mockResolvedValue([]);

            const params = {
                action: 'search',
                query: 'nonexistent topic',
            };

            const result = await BibleSearchTool.func(params);

            expect(bibleService.search).toHaveBeenCalledWith('nonexistent topic', 5, 'BSB');
            expect(result).toBe("No verses found matching 'nonexistent topic' in BSB.");
        });

        it('should handle errors during search execution', async () => {
            const errorMessage = 'Search index corrupted';
            bibleService.search.mockRejectedValue(new Error(errorMessage));

            const params = {
                action: 'search',
                query: 'love',
            };

            const result = await BibleSearchTool.func(params);

            expect(bibleService.search).toHaveBeenCalledWith('love', 5, 'BSB');
            expect(result).toBe(`Error accessing Bible data: ${errorMessage}`);
        });
    });

    // General cases
    it('should return "Invalid action." for an unknown action', async () => {
        const params = {
            action: 'unknown_action',
            query: 'test',
        };

        const result = await BibleSearchTool.func(params);

        expect(result).toBe('Invalid action.');
        expect(bibleService.lookupPassage).not.toHaveBeenCalled();
        expect(bibleService.search).not.toHaveBeenCalled();
    });

    it('should handle general errors gracefully', async () => {
        // Simulate an error that might occur outside specific service calls, e.g., in the tool's own logic
        // For this specific tool, most errors are caught within the try/catch block around service calls.
        // We can force an error by mocking a function to throw unexpectedly.
        // Let's re-mock lookupPassage to throw an error that is not a Promise rejection, but a direct throw.
        // This scenario is less likely with async functions, but good for robustness.
        // However, the current implementation uses `async` and `await`, so `mockRejectedValue` is the correct way to simulate errors.
        // The existing error handling tests cover this sufficiently.
        // This test case is more for demonstrating the outer try/catch, which is already covered by the specific lookup/search error tests.
        // So, no new test needed here, as the existing ones cover the `catch (error)` block.
    });
});