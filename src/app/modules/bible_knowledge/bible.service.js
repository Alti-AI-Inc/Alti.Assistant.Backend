import fs from 'fs/promises'; // Changed to fs/promises for async operations
import path from 'path';

/**
 * @file This service provides functionalities to load, lookup, and search Bible passages.
 * It optimizes data access by pre-loading and indexing Bible translations from JSON files.
 */

/**
 * Manages access to Bible translation data.
 * This service handles loading Bible databases from flat JSON files,
 * caching them in memory, and providing optimized methods for passage lookup and text search.
 */
class BibleService {
    /**
     * Initializes the BibleService, setting up data directories and internal caches.
     * @property {string} dataDir - The absolute path to the directory containing Bible data files.
     * @property {Object.<string, Object|null>} databases - An object caching loaded Bible databases.
     *                                                      Keys are translation codes (e.g., 'BSB'), values are
     *                                                      either `null` (not loaded) or an object containing
     *                                                      `rawData`, `passageIndex`, and `searchData`.
     * @property {Object.<string, string>} files - A map linking translation codes to their respective data filenames.
     */
    constructor() {
        this.dataDir = path.join(process.cwd(), 'src/app/modules/bible_knowledge/data');
        this.databases = {
            'BSB': null,
            'JPS': null,
            'HEBREW': null
        };
        this.files = {
            'BSB': 'flat_bsb.json',
            'JPS': 'flat_jps.json',
            'HEBREW': 'flat_hebrew.json'
        };
    }

    /**
     * Loads a Bible database for a given translation.
     * Caches the loaded database in memory to prevent repeated file I/O.
     * Uses asynchronous file reading (`fs/promises`) to prevent blocking the event loop.
     * Also pre-processes data into optimized structures for faster lookups and searches.
     * If the database is already loaded, it returns the cached version.
     *
     * @param {string} [translation='BSB'] - The translation code (e.g., 'BSB', 'JPS', 'HEBREW'). Case-insensitive.
     * @returns {Promise<Object>} A promise that resolves to the loaded database object.
     *                            The object contains:
     *                            - `rawData`: {Array<Object>} The raw array of verse objects as parsed from the JSON file.
     *                            - `passageIndex`: {Object} An optimized index for O(1) passage lookup:
     *                                              `{ 'BOOK_CODE': { 'CHAPTER_NUM': { 'VERSE_NUM': verseObject } } }`.
     *                            - `searchData`: {Array<Object>} An array of verse objects, each augmented with a
     *                                            `textLower` property for efficient keyword searching.
     * @throws {Error} If the specified translation is unsupported or if there's an error reading the file.
     */
    async loadDatabase(translation = 'BSB') {
        const trans = translation.toUpperCase();
        if (!this.files[trans]) {
            throw new Error(`Unsupported translation: ${translation}`);
        }
        
        // Check if the database is already loaded or being loaded
        if (!this.databases[trans]) {
            try {
                const dbPath = path.join(this.dataDir, this.files[trans]);
                // Use fs.promises.readFile for asynchronous file reading
                const data = await fs.readFile(dbPath, 'utf8');
                const rawVerses = JSON.parse(data); // Potentially CPU-intensive, but done only once per translation

                // --- Optimization: Build in-memory indexes for faster lookups and searches ---
                const passageIndex = {}; // For O(1) passage lookup by book, chapter, verse
                const searchData = [];    // For optimized search, pre-calculating lowercase text

                rawVerses.forEach(v => {
                    // Build passageIndex: { 'BOOK': { 'CHAPTER': { 'VERSE': verseObject } } }
                    const bookCode = v.book.toUpperCase();
                    if (!passageIndex[bookCode]) {
                        passageIndex[bookCode] = {};
                    }
                    if (!passageIndex[bookCode][v.chapter]) {
                        passageIndex[bookCode][v.chapter] = {};
                    }
                    passageIndex[bookCode][v.chapter][v.verse] = v;

                    // Prepare search data: store original verse object along with pre-calculated lowercase text
                    searchData.push({
                        ...v,
                        textLower: v.text.toLowerCase() // Pre-calculate lowercase text to avoid repeated computation during search
                    });
                });

                this.databases[trans] = {
                    rawData: rawVerses, // Keep raw data if needed, though indexes are preferred for performance
                    passageIndex: passageIndex,
                    searchData: searchData
                };
            } catch (err) {
                console.error(`Error loading Bible database (${trans}):`, err);
                // On error, cache an empty structure to prevent repeated load attempts and subsequent errors
                this.databases[trans] = {
                    rawData: [],
                    passageIndex: {},
                    searchData: []
                };
                // Re-throw the error to indicate failure to the caller
                throw err;
            }
        }
        return this.databases[trans]; // Return the structured object containing raw data and indexes
    }

    /**
     * Look up a specific passage by book code, chapter, and an optional verse range.
     * Validates numeric inputs to prevent silent failures from NaN comparisons.
     * Uses a pre-built in-memory index for O(1) access instead of O(N) array filtering,
     * significantly improving performance for passage lookups.
     *
     * @param {string} book - The book code (e.g., 'GEN', 'EXO', 'PSA'). Case-insensitive.
     * @param {number|string} chapter - The chapter number. Must be a valid positive integer.
     * @param {number|string} startVerse - The starting verse number. Must be a valid positive integer.
     * @param {number|string} [endVerse=startVerse] - The ending verse number. Must be a valid positive integer,
     *                                                and greater than or equal to `startVerse`.
     * @param {string} [translation='BSB'] - The translation code (e.g., 'BSB', 'JPS').
     * @returns {Promise<Array<Object>>} A promise that resolves to an array of matching verse objects.
     *                                    Each object typically contains `book`, `chapter`, `verse`, `text`, etc.
     *                                    Returns an empty array if no verses are found or inputs are invalid.
     * @throws {Error} If numeric inputs are invalid (not numbers, or non-positive) or if `startVerse` is greater than `endVerse`.
     */
    async lookupPassage(book, chapter, startVerse, endVerse = startVerse, translation = 'BSB') {
        // Validate and parse numeric inputs
        const parsedChapter = parseInt(chapter, 10);
        const parsedStartVerse = parseInt(startVerse, 10);
        const parsedEndVerse = parseInt(endVerse, 10);

        if (isNaN(parsedChapter) || parsedChapter <= 0 ||
            isNaN(parsedStartVerse) || parsedStartVerse <= 0 ||
            isNaN(parsedEndVerse) || parsedEndVerse <= 0) {
            throw new Error("Chapter, startVerse, and endVerse must be valid positive numbers.");
        }
        if (parsedStartVerse > parsedEndVerse) {
            throw new Error("Start verse cannot be greater than end verse.");
        }

        const dbInfo = await this.loadDatabase(translation);
        const passageIndex = dbInfo.passageIndex; // Access the optimized passage index

        const bookCode = book.toUpperCase();
        const chapterData = passageIndex[bookCode]?.[parsedChapter];

        if (!chapterData) {
            return []; // No verses found for the given book/chapter
        }

        const results = [];
        // Iterate only through the requested verse range, which is much faster than filtering the entire database
        for (let i = parsedStartVerse; i <= parsedEndVerse; i++) {
            if (chapterData[i]) {
                results.push(chapterData[i]);
            }
        }
        return results;
    }

    /**
     * Perform a simple keyword/semantic-light search across the text of all verses in a given translation.
     * The search is case-insensitive and matches individual terms within the query.
     * Results are scored based on the number of matching terms and sorted by score (descending).
     * Uses pre-processed lowercase text for faster string comparisons.
     *
     * @param {string} query - The search query string (e.g., "love joy peace").
     * @param {number|string} [limit=10] - The maximum number of results to return. Must be a positive integer.
     * @param {string} [translation='BSB'] - The translation code (e.g., 'BSB', 'JPS').
     * @returns {Promise<Array<Object>>} A promise that resolves to an array of scored and sorted verse objects.
     *                                    Each object will include a `score` property indicating relevance.
     * @throws {Error} If the limit parameter is invalid (not a positive number).
     */
    async search(query, limit = 10, translation = 'BSB') {
        // Validate and parse the limit parameter
        const parsedLimit = parseInt(limit, 10);
        if (isNaN(parsedLimit) || parsedLimit <= 0) {
            throw new Error("Limit must be a positive number.");
        }

        const dbInfo = await this.loadDatabase(translation);
        const searchData = dbInfo.searchData; // Access the optimized search data with pre-calculated textLower
        
        const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0); // Split and filter empty terms
        
        if (searchTerms.length === 0) {
            return []; // No valid search terms
        }

        const scoredVerses = searchData.map(v => { // Iterate over the searchData array
            let score = 0;
            // Use the pre-calculated `textLower` property, avoiding repeated `toLowerCase()` calls
            for (const term of searchTerms) {
                if (v.textLower.includes(term)) score += 1;
            }
            return { ...v, score }; // Return the verse object with its score
        }).filter(v => v.score > 0);

        scoredVerses.sort((a, b) => b.score - a.score);
        return scoredVerses.slice(0, parsedLimit);
    }
    
    /**
     * Formats an array of verse objects into a single, readable citation string.
     * This method is synchronous as it performs no I/O operations.
     *
     * @param {Array<Object>} verses - An array of verse objects, typically returned by `lookupPassage` or `search`.
     *                                 Each object is expected to have `book`, `chapter`, `verse`, and `text` properties.
     * @param {string} [translation='BSB'] - The translation code to include in the citation.
     * @returns {string} A formatted string representation of the verses, e.g.,
     *                   "[v1] In the beginning... [v2] And the earth... (Genesis 1:1-2 [BSB])"
     *                   Returns "No verses found." if the input array is empty or null.
     */
    formatVerses(verses, translation = 'BSB') {
        if (!verses || verses.length === 0) return "No verses found.";
        const book = verses[0].book;
        const chapter = verses[0].chapter;
        const start = verses[0].verse;
        const end = verses[verses.length - 1].verse;
        
        const reference = `${book} ${chapter}:${start}${start !== end ? '-' + end : ''} [${translation}]`;
        const text = verses.map(v => `[v${v.verse}] ${v.text}`).join(' ');
        
        return `${text} (${reference})`;
    }
}

/**
 * Singleton instance of the BibleService.
 * This instance should be used throughout the application to interact with Bible data.
 * @type {BibleService}
 */
export const bibleService = new BibleService();