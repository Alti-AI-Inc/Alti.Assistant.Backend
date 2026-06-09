import fs from 'fs/promises'; // Changed to fs/promises for async operations
import path from 'path';

class BibleService {
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
     * Caches the loaded database in memory.
     * Uses asynchronous file reading to prevent blocking the event loop.
     * Also pre-processes data into optimized structures for faster lookups and searches.
     * @param {string} translation - The translation code (e.g., 'BSB', 'JPS').
     * @returns {Promise<Object>} A promise that resolves to the loaded database object,
     *                            containing raw data and optimized indexes.
     * @throws {Error} If the translation is unsupported.
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
            }
        }
        return this.databases[trans]; // Return the structured object containing raw data and indexes
    }

    /**
     * Look up a specific passage by book code, chapter, and verse range.
     * Validates numeric inputs to prevent silent failures from NaN comparisons.
     * Uses pre-built in-memory index for O(1) access instead of O(N) array filtering.
     * @param {string} book - The book code (e.g., 'GEN').
     * @param {number|string} chapter - The chapter number.
     * @param {number|string} startVerse - The starting verse number.
     * @param {number|string} [endVerse=startVerse] - The ending verse number.
     * @param {string} [translation='BSB'] - The translation code.
     * @returns {Promise<Array>} A promise that resolves to an array of matching verses.
     * @throws {Error} If numeric inputs are invalid or startVerse is greater than endVerse.
     */
    async lookupPassage(book, chapter, startVerse, endVerse = startVerse, translation = 'BSB') {
        // Validate and parse numeric inputs
        const parsedChapter = parseInt(chapter, 10);
        const parsedStartVerse = parseInt(startVerse, 10);
        const parsedEndVerse = parseInt(endVerse, 10);

        if (isNaN(parsedChapter) || isNaN(parsedStartVerse) || isNaN(parsedEndVerse)) {
            throw new Error("Chapter, startVerse, and endVerse must be valid numbers.");
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
     * Perform a simple keyword/semantic-light search across the text.
     * Validates the limit parameter.
     * Uses pre-processed lowercase text for faster string comparisons.
     * @param {string} query - The search query string.
     * @param {number|string} [limit=10] - The maximum number of results to return.
     * @param {string} [translation='BSB'] - The translation code.
     * @returns {Promise<Array>} A promise that resolves to an array of scored and sorted verses.
     * @throws {Error} If the limit parameter is invalid.
     */
    async search(query, limit = 10, translation = 'BSB') {
        // Validate and parse the limit parameter
        const parsedLimit = parseInt(limit, 10);
        if (isNaN(parsedLimit) || parsedLimit <= 0) {
            throw new Error("Limit must be a positive number.");
        }

        const dbInfo = await this.loadDatabase(translation);
        const searchData = dbInfo.searchData; // Access the optimized search data with pre-calculated textLower
        
        const searchTerms = query.toLowerCase().split(/\s+/);
        
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
     * Formats verses into a readable citation string.
     * This method does not perform I/O and remains synchronous.
     * @param {Array} verses - An array of verse objects.
     * @param {string} [translation='BSB'] - The translation code.
     * @returns {string} A formatted string representation of the verses.
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

export const bibleService = new BibleService();