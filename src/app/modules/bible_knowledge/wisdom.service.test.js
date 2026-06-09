import { describe, it, expect, beforeEach, vi } from 'vitest';
// Assuming WisdomService class is exported for direct testing.
// If not, you might need: import { wisdomService } from './wisdom.service'; const WisdomService = wisdomService.constructor;
import { WisdomService } from './wisdom.service';

// Mock fs/promises
vi.mock('fs/promises', () => ({
    default: {
        readFile: vi.fn(),
    },
}));

// Mock path, specifically path.join, to control the dbPath in tests
vi.mock('path', () => ({
    default: {
        join: vi.fn(),
    },
}));

// Mock console.error to prevent test output pollution and to assert calls
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('WisdomService', () => {
    let service;
    let mockDbData;

    beforeEach(() => {
        // Reset mocks and service instance before each test
        vi.clearAllMocks();
        consoleErrorSpy.mockClear();

        // Mock path.join to return a consistent, predictable path for dbPath
        // The first argument to path.join is __dirname, which we don't control directly in Vitest ESM.
        // We just ensure it's called with a string and then return a predictable mock path.
        vi.mocked(path.join).mockImplementation((dir, dataFolder, fileName) => `/mock/path/to/${fileName}`);

        service = new WisdomService();

        mockDbData = [
            { "book": "Proverbs", "chapter": 1, "verse": 1, "text": "The proverbs of Solomon son of David, king of Israel." },
            { "book": "Proverbs", "chapter": 1, "verse": 2, "text": "For gaining wisdom and instruction; for understanding words of insight." },
            { "book": "Proverbs", "chapter": 1, "verse": 3, "text": "For receiving instruction in prudent behavior, doing what is right and just and fair." },
            { "book": "Ecclesiastes", "chapter": 1, "verse": 1, "text": "The words of the Teacher, son of David, king in Jerusalem." },
            { "book": "Ecclesiastes", "chapter": 1, "verse": 2, "text": "“Meaningless! Meaningless!” says the Teacher. “Utterly meaningless! Everything is meaningless.”" },
            { "book": "Proverbs", "chapter": 2, "verse": 1, "text": "My son, if you accept my words and store up my commands within you," },
            { "book": "Proverbs", "chapter": 2, "verse": 2, "text": "turning your ear to wisdom and applying your heart to understanding—" },
            { "book": "Job", "chapter": 28, "verse": 28, "text": "And he said to the human race, “The fear of the Lord—that is wisdom, and to shun evil is understanding.”" }
        ];

        // Ensure fs.readFile is reset to a default successful state for most tests
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockDbData));
    });

    describe('constructor', () => {
        it('should initialize dbPath correctly', () => {
            // Expect path.join to be called with __dirname (represented by any string), 'data', and 'flat_wisdom.json'
            expect(path.join).toHaveBeenCalledWith(expect.any(String), 'data', 'flat_wisdom.json');
            expect(service.dbPath).toBe('/mock/path/to/flat_wisdom.json');
            expect(service.db).toBeNull();
            expect(service.loadingPromise).toBeNull();
        });
    });

    describe('loadDatabase', () => {
        it('should load the database from file and parse JSON', async () => {
            const db = await service.loadDatabase();
            expect(fs.readFile).toHaveBeenCalledWith(service.dbPath, 'utf8');
            expect(db).toEqual(mockDbData);
            expect(service.db).toEqual(mockDbData);
            expect(service.loadingPromise).toBeNull(); // Should be null after completion
        });

        it('should only load the database once on multiple concurrent calls', async () => {
            const promise1 = service.loadDatabase();
            const promise2 = service.loadDatabase();
            const promise3 = service.loadDatabase();

            const [db1, db2, db3] = await Promise.all([promise1, promise2, promise3]);

            expect(fs.readFile).toHaveBeenCalledTimes(1); // Should only be called once
            expect(db1).toEqual(mockDbData);
            expect(db2).toEqual(mockDbData);
            expect(db3).toEqual(mockDbData);
            expect(service.db).toEqual(mockDbData);
            expect(service.loadingPromise).toBeNull();
        });

        it('should return the already loaded database without re-reading the file', async () => {
            await service.loadDatabase(); // First load
            vi.mocked(fs.readFile).mockClear(); // Clear mock to check if it's called again

            const db = await service.loadDatabase(); // Second load

            expect(fs.readFile).not.toHaveBeenCalled(); // Should not be called again
            expect(db).toEqual(mockDbData);
            expect(service.db).toEqual(mockDbData);
            expect(service.loadingPromise).toBeNull();
        });

        it('should handle file read errors', async () => {
            const errorMessage = 'File not found';
            vi.mocked(fs.readFile).mockRejectedValue(new Error(errorMessage));

            await expect(service.loadDatabase()).rejects.toThrow('Failed to load wisdom database: ' + errorMessage);
            expect(fs.readFile).toHaveBeenCalledWith(service.dbPath, 'utf8');
            expect(consoleErrorSpy).toHaveBeenCalledWith("Error loading Wisdom database:", expect.any(Error));
            expect(service.db).toEqual([]); // Should be set to empty array on error
            expect(service.loadingPromise).toBeNull();
        });

        it('should handle JSON parsing errors', async () => {
            vi.mocked(fs.readFile).mockResolvedValue('{"invalid json"'); // Malformed JSON

            await expect(service.loadDatabase()).rejects.toThrow(/Failed to load wisdom database: Unexpected end of JSON input/);
            expect(fs.readFile).toHaveBeenCalledWith(service.dbPath, 'utf8');
            expect(consoleErrorSpy).toHaveBeenCalledWith("Error loading Wisdom database:", expect.any(Error));
            expect(service.db).toEqual([]); // Should be set to empty array on error
            expect(service.loadingPromise).toBeNull();
        });
    });

    describe('lookupPassage', () => {
        it('should return matching verses for a single verse', async () => {
            const result = await service.lookupPassage('Proverbs', 1, 1);
            expect(result).toEqual([mockDbData[0]]);
        });

        it('should return matching verses for a range of verses', async () => {
            const result = await service.lookupPassage('Proverbs', 1, 1, 2);
            expect(result).toEqual([mockDbData[0], mockDbData[1]]);
        });

        it('should return an empty array if no passage is found', async () => {
            const result = await service.lookupPassage('NonExistentBook', 1, 1);
            expect(result).toEqual([]);
        });

        it('should be case-insensitive for book names', async () => {
            const result = await service.lookupPassage('proverbs', 1, 1);
            expect(result).toEqual([mockDbData[0]]);
        });

        it('should handle numeric string inputs for chapter and verse', async () => {
            const result = await service.lookupPassage('Proverbs', '1', '1', '2');
            expect(result).toEqual([mockDbData[0], mockDbData[1]]);
        });

        it('should throw an error for invalid chapter input (non-numeric string)', async () => {
            await expect(service.lookupPassage('Proverbs', 'abc', 1)).rejects.toThrow("Invalid chapter or verse number provided. All must be numeric.");
        });

        it('should throw an error for invalid startVerse input (non-numeric string)', async () => {
            await expect(service.lookupPassage('Proverbs', 1, 'xyz')).rejects.toThrow("Invalid chapter or verse number provided. All must be numeric.");
        });

        it('should throw an error for invalid endVerse input (non-numeric string)', async () => {
            await expect(service.lookupPassage('Proverbs', 1, 1, 'def')).rejects.toThrow("Invalid chapter or verse number provided. All must be numeric.");
        });

        it('should throw an error for invalid chapter input (null/undefined)', async () => {
            await expect(service.lookupPassage('Proverbs', null, 1)).rejects.toThrow("Invalid chapter or verse number provided. All must be numeric.");
            await expect(service.lookupPassage('Proverbs', undefined, 1)).rejects.toThrow("Invalid chapter or verse number provided. All must be numeric.");
        });

        it('should load database if not already loaded', async () => {
            service.db = null; // Ensure db is not loaded
            await service.lookupPassage('Proverbs', 1, 1);
            expect(fs.readFile).toHaveBeenCalledTimes(1);
        });
    });

    describe('search', () => {
        it('should find verses by a single keyword and score them', async () => {
            const result = await service.search('wisdom');
            expect(result.length).toBe(3); // Proverbs 1:2, Proverbs 2:2, Job 28:28
            expect(result.some(v => v.book === 'Proverbs' && v.chapter === 1 && v.verse === 2 && v.score === 1)).toBe(true);
            expect(result.some(v => v.book === 'Proverbs' && v.chapter === 2 && v.verse === 2 && v.score === 1)).toBe(true);
            expect(result.some(v => v.book === 'Job' && v.chapter === 28 && v.verse === 28 && v.score === 1)).toBe(true);
        });

        it('should find verses by multiple keywords and sort by score', async () => {
            const result = await service.search('wisdom instruction');
            expect(result.length).toBe(4); // Proverbs 1:2 (2 terms), Proverbs 1:3 (1 term), Proverbs 2:2 (1 term), Job 28:28 (1 term)

            // Check scores
            const proverbs1_2 = result.find(v => v.book === 'Proverbs' && v.chapter === 1 && v.verse === 2);
            const proverbs1_3 = result.find(v => v.book === 'Proverbs' && v.chapter === 1 && v.verse === 3);
            const proverbs2_2 = result.find(v => v.book === 'Proverbs' && v.chapter === 2 && v.verse === 2);
            const job28_28 = result.find(v => v.book === 'Job' && v.chapter === 28 && v.verse === 28);

            expect(proverbs1_2.score).toBe(2); // wisdom, instruction
            expect(proverbs1_3.score).toBe(1); // instruction
            expect(proverbs2_2.score).toBe(1); // wisdom
            expect(job28_28.score).toBe(1); // wisdom

            // Should be sorted by score descending
            expect(result[0]).toEqual(expect.objectContaining({ book: 'Proverbs', chapter: 1, verse: 2, score: 2 }));
            // The order of verses with score 1 is not guaranteed by the sort, but they should all be present.
        });

        it('should apply a book filter', async () => {
            const result = await service.search('meaningless', 10, 'Ecclesiastes');
            expect(result.length).toBe(1);
            expect(result[0].book).toBe('Ecclesiastes');
            expect(result[0].text).toContain('Meaningless');
        });

        it('should be case-insensitive for query and book filter', async () => {
            const result = await service.search('WISDOM', 10, 'proverbs');
            expect(result.length).toBe(2); // Proverbs 1:2, Proverbs 2:2
            expect(result.every(v => v.book.toLowerCase().includes('proverbs'))).toBe(true);
            expect(result.some(v => v.text.toLowerCase().includes('wisdom'))).toBe(true);
        });

        it('should limit the number of results', async () => {
            const result = await service.search('the', 2); // 'the' is in many verses
            expect(result.length).toBe(2);
            expect(result[0].score).toBeGreaterThan(0);
            expect(result[1].score).toBeGreaterThan(0);
        });

        it('should return an empty array if no matches are found', async () => {
            const result = await service.search('nonexistentword');
            expect(result).toEqual([]);
        });

        it('should handle empty query gracefully', async () => {
            const result = await service.search('');
            expect(result).toEqual([]); // No terms, no score > 0
        });

        it('should handle query with only whitespace gracefully', async () => {
            const result = await service.search('   ');
            expect(result).toEqual([]); // No terms after filtering, no score > 0
        });

        it('should load database if not already loaded', async () => {
            service.db = null; // Ensure db is not loaded
            await service.search('wisdom');
            expect(fs.readFile).toHaveBeenCalledTimes(1);
        });
    });

    describe('formatVerses', () => {
        it('should format a single verse correctly', () => {
            const verse = { book: 'Proverbs', chapter: 1, verse: 1, text: 'The proverbs of Solomon.' };
            const result = service.formatVerses([verse]);
            expect(result).toBe('[v1] The proverbs of Solomon. (Proverbs 1:1)');
        });

        it('should format multiple verses in a range correctly', () => {
            const verses = [
                { book: 'Proverbs', chapter: 1, verse: 1, text: 'Verse 1 text.' },
                { book: 'Proverbs', chapter: 1, verse: 2, text: 'Verse 2 text.' },
                { book: 'Proverbs', chapter: 1, verse: 3, text: 'Verse 3 text.' },
            ];
            const result = service.formatVerses(verses);
            expect(result).toBe('[v1] Verse 1 text. [v2] Verse 2 text. [v3] Verse 3 text. (Proverbs 1:1-3)');
        });

        it('should return "No text found." for an empty array', () => {
            const result = service.formatVerses([]);
            expect(result).toBe('No text found.');
        });

        it('should return "No text found." for null or undefined input', () => {
            expect(service.formatVerses(null)).toBe('No text found.');
            expect(service.formatVerses(undefined)).toBe('No text found.');
        });

        it('should handle verses from different chapters/books by citing the first verse and range', () => {
            // This tests the current behavior, which takes book/chapter from verses[0]
            // and start/end from verses[0] and verses[length-1].
            const verses = [
                { book: 'Proverbs', chapter: 1, verse: 1, text: 'Prov 1:1' },
                { book: 'Ecclesiastes', chapter: 2, verse: 5, text: 'Ecc 2:5' },
                { book: 'Proverbs', chapter: 1, verse: 10, text: 'Prov 1:10' },
            ];
            const result = service.formatVerses(verses);
            // Book: Proverbs (from verses[0])
            // Chapter: 1 (from verses[0])
            // Start Verse: 1 (from verses[0])
            // End Verse: 10 (from verses[length-1])
            expect(result).toBe('[v1] Prov 1:1 [v5] Ecc 2:5 [v10] Prov 1:10 (Proverbs 1:1-10)');
        });
    });
});