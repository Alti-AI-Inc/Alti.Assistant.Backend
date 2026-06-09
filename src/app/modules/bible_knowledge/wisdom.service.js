import fs from 'fs/promises'; // Use fs.promises for asynchronous file operations
import path from 'path';

class WisdomService {
    constructor() {
        // Use __dirname for more robust path resolution relative to the module file.
        // The 'data' folder is a direct child of the current module's directory.
        this.dbPath = path.join(__dirname, 'data', 'flat_wisdom.json');
        this.db = null;
        // A promise to track the database loading state, preventing multiple concurrent loads.
        this.loadingPromise = null;
    }

    /**
     * Asynchronously loads the wisdom database from the flat JSON file.
     * Ensures the database is loaded only once and handles concurrent requests gracefully.
     * @returns {Promise<Array>} A promise that resolves with the loaded database array.
     * @throws {Error} If the database file cannot be read or parsed.
     */
    async loadDatabase() {
        // If the database is already loaded, return it immediately.
        if (this.db) {
            return this.db;
        }
        // If a loading operation is already in progress, return the existing promise.
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        // Start a new loading operation and store its promise.
        this.loadingPromise = (async () => {
            try {
                const data = await fs.readFile(this.dbPath, 'utf8');
                this.db = JSON.parse(data);
                return this.db;
            } catch (err) {
                console.error("Error loading Wisdom database:", err);
                // On error, ensure this.db is an empty array to prevent subsequent errors
                // and re-throw the error to inform the caller of the failure.
                this.db = [];
                throw new Error("Failed to load wisdom database: " + err.message);
            } finally {
                // Clear the loading promise once the operation is complete (success or failure).
                this.loadingPromise = null;
            }
        })();

        return this.loadingPromise;
    }

    /**
     * Look up a specific passage by book name, chapter, and verse range.
     * This method is now asynchronous because it awaits `loadDatabase`.
     * @param {string} book - The name of the book.
     * @param {string|number} chapter - The chapter number.
     * @param {string|number} startVerse - The starting verse number.
     * @param {string|number} [endVerse] - The ending verse number (defaults to startVerse).
     * @returns {Promise<Array>} A promise that resolves with an array of matching verses.
     * @throws {Error} If chapter or verse numbers are not valid numeric inputs.
     */
    async lookupPassage(book, chapter, startVerse, endVerse = startVerse) {
        // Validate and parse numeric inputs to prevent unexpected behavior from NaN.
        const parsedChapter = parseInt(chapter, 10);
        const parsedStartVerse = parseInt(startVerse, 10);
        const parsedEndVerse = parseInt(endVerse, 10);

        if (isNaN(parsedChapter) || isNaN(parsedStartVerse) || isNaN(parsedEndVerse)) {
            throw new Error("Invalid chapter or verse number provided. All must be numeric.");
        }

        const db = await this.loadDatabase(); // Await the asynchronous database load
        return db.filter(v =>
            v.book.toLowerCase().includes(book.toLowerCase()) &&
            v.chapter === parsedChapter &&
            v.verse >= parsedStartVerse &&
            v.verse <= parsedEndVerse
        );
    }

    /**
     * Perform a keyword search across all wisdom texts.
     * This method is now asynchronous because it awaits `loadDatabase`.
     * @param {string} query - The search query string.
     * @param {number} [limit=10] - The maximum number of results to return.
     * @param {string} [bookFilter=null] - Optional filter by book name.
     * @returns {Promise<Array>} A promise that resolves with an array of scored and sorted verses.
     */
    async search(query, limit = 10, bookFilter = null) {
        const db = await this.loadDatabase(); // Await the asynchronous database load
        // Split query by whitespace and filter out any empty terms that might result from multiple spaces.
        const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

        let filteredDb = db;
        if (bookFilter) {
            filteredDb = db.filter(v => v.book.toLowerCase().includes(bookFilter.toLowerCase()));
        }

        const scoredVerses = filteredDb.map(v => {
            let score = 0;
            const textLower = v.text.toLowerCase();
            for (const term of searchTerms) {
                if (textLower.includes(term)) score += 1;
            }
            return { ...v, score };
        }).filter(v => v.score > 0);

        scoredVerses.sort((a, b) => b.score - a.score);
        return scoredVerses.slice(0, limit);
    }

    /**
     * Formats verses into a readable citation string.
     * This method does not interact with the database, so it remains synchronous.
     * @param {Array} verses - An array of verse objects.
     * @returns {string} A formatted string representing the verses and their citation.
     */
    formatVerses(verses) {
        if (!verses || verses.length === 0) return "No text found.";

        // Assuming verses array contains objects with 'book', 'chapter', 'verse', 'text' properties.
        const book = verses[0].book;
        const chapter = verses[0].chapter;
        const start = verses[0].verse;
        const end = verses[verses.length - 1].verse;

        const reference = `${book} ${chapter}:${start}${start !== end ? '-' + end : ''}`;
        const text = verses.map(v => `[v${v.verse}] ${v.text}`).join(' ');

        return `${text} (${reference})`;
    }
}

export const wisdomService = new WisdomService();