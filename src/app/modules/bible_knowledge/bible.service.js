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
     * @param {string} translation - The translation code (e.g., 'BSB', 'JPS').
     * @returns {Promise<Array>} A promise that resolves to the loaded database (an array of verses).
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
                this.databases[trans] = JSON.parse(data);
            } catch (err) {
                console.error(`Error loading Bible database (${trans}):`, err);
                // On error, cache an empty array to prevent repeated load attempts and subsequent errors
                this.databases[trans] = [];
            }
        }
        return this.databases[trans];
    }

    /**
     * Look up a specific passage by book code, chapter, and verse range.
     * Validates numeric inputs to prevent silent failures from NaN comparisons.
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

        const db = await this.loadDatabase(translation);
        return db.filter(v => 
            v.book.toUpperCase() === book.toUpperCase() && 
            v.chapter === parsedChapter && 
            v.verse >= parsedStartVerse && 
            v.verse <= parsedEndVerse
        );
    }

    /**
     * Perform a simple keyword/semantic-light search across the text.
     * Validates the limit parameter.
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

        const db = await this.loadDatabase(translation);
        const searchTerms = query.toLowerCase().split(/\s+/);
        
        const scoredVerses = db.map(v => {
            let score = 0;
            const textLower = v.text.toLowerCase();
            for (const term of searchTerms) {
                if (textLower.includes(term)) score += 1;
            }
            return { ...v, score };
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