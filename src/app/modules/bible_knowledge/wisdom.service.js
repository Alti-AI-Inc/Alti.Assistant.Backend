/**
 * @file This service module provides functionality for accessing and querying a flat-file
 *       database of wisdom texts (e.g., Bible verses). It handles loading the data,
 *       looking up specific passages, performing keyword searches, and formatting results.
 * @module wisdomService
 */

import fs from 'fs/promises'; // Use fs.promises for asynchronous file operations
import path from 'path';
import { fileURLToPath } from 'url'; // Required for __dirname equivalent in ES Modules
import { dirname } from 'path';     // Required for __dirname equivalent in ES Modules

// Get __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Represents a service for managing and querying a collection of wisdom texts
 * stored in a flat JSON file. It provides methods for loading the database,
 * looking up passages by reference, and performing keyword searches.
 *
 * The service ensures the database is loaded efficiently, preventing multiple
 * concurrent load operations and caching the loaded data.
 */
class WisdomService {
    /**
     * Initializes the WisdomService, setting up the path to the database file
     * and initializing internal state variables.
     *
     * @constructor
     */
    constructor() {
        // Use __dirname for more robust path resolution relative to the module file.
        // The 'data' folder is a direct child of the current module's directory.
        /**
         * The absolute path to the flat JSON database file.
         * @type {string}
         */
        this.dbPath = path.join(__dirname, 'data', 'flat_wisdom.json');
        /**
         * The loaded database content, an array of wisdom text objects.
         * @type {Array<Object>|null}
         */
        this.db = null;
        /**
         * A promise to track the database loading state, preventing multiple concurrent loads.
         * @type {Promise<Array<Object>>|null}
         */
        this.loadingPromise = null;
    }

    /**
     * Asynchronously loads the wisdom database from the flat JSON file.
     * Ensures the database is loaded only once and handles concurrent requests gracefully.
     * If the database is already loaded, it returns the existing data. If a load is in progress,
     * it returns the promise for that ongoing operation.
     *
     * @returns {Promise<Array<Object>>} A promise that resolves with the loaded database array.
     *                                   Each object in the array represents a verse with properties
     *                                   like `book`, `chapter`, `verse`, and `text`.
     * @throws {Error} If the database file cannot be read or parsed, or if the file is not found.
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
                const rawDb = JSON.parse(data);
                // Optimization: Pre-process data to add lowercase versions of frequently accessed string fields.
                // This avoids repeated toLowerCase() calls during lookups and searches,
                // reducing CPU load in synchronous loops (filter, map) later.
                this.db = rawDb.map(v => ({
                    ...v,
                    bookLower: v.book.toLowerCase(),
                    textLower: v.text.toLowerCase()
                }));
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
     * Looks up a specific passage by book name, chapter, and an optional verse range.
     * This method is asynchronous as it depends on the `loadDatabase` method.
     *
     * @param {string} book - The name of the book (e.g., "Proverbs", "Psalms"). Case-insensitive matching is performed.
     * @param {string|number} chapter - The chapter number. Must be a valid numeric input.
     * @param {string|number} startVerse - The starting verse number. Must be a valid numeric input.
     * @param {string|number} [endVerse] - The ending verse number. If not provided, it defaults to `startVerse`,
     *                                     meaning a single verse lookup. Must be a valid numeric input.
     * @returns {Promise<Array<Object>>} A promise that resolves with an array of matching verse objects.
     *                                   Each object contains `book`, `chapter`, `verse`, and `text` properties.
     *                                   Returns an empty array if no matches are found.
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
        const bookLowerQuery = book.toLowerCase(); // Call toLowerCase once for the query book
        return db.filter(v =>
            // Optimization: Use pre-computed `bookLower` field to avoid repeated toLowerCase() calls in the loop.
            v.bookLower.includes(bookLowerQuery) &&
            v.chapter === parsedChapter &&
            v.verse >= parsedStartVerse &&
            v.verse <= parsedEndVerse
        );
    }

    /**
     * Performs a keyword search across all wisdom texts or within a specified book.
     * This method is asynchronous as it depends on the `loadDatabase` method.
     * Results are scored based on the number of matching terms and sorted by score in descending order.
     *
     * @param {string} query - The search query string. Multiple terms are separated by whitespace.
     * @param {number} [limit=10] - The maximum number of results to return. Defaults to 10.
     * @param {string} [bookFilter=null] - Optional filter by book name (e.g., "Proverbs").
     *                                     If provided, the search is restricted to this book. Case-insensitive.
     * @returns {Promise<Array<Object>>} A promise that resolves with an array of scored and sorted verse objects.
     *                                   Each object includes `book`, `chapter`, `verse`, `text`, and an additional `score` property.
     *                                   Returns an empty array if no matches are found.
     */
    async search(query, limit = 10, bookFilter = null) {
        const db = await this.loadDatabase(); // Await the asynchronous database load
        // Split query by whitespace and filter out any empty terms that might result from multiple spaces.
        const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

        let filteredDb = db;
        if (bookFilter) {
            const bookFilterLower = bookFilter.toLowerCase(); // Call toLowerCase once for the book filter
            // Optimization: Use pre-computed `bookLower` field to avoid repeated toLowerCase() calls in the loop.
            filteredDb = db.filter(v => v.bookLower.includes(bookFilterLower));
        }

        const scoredVerses = filteredDb.map(v => {
            let score = 0;
            // Optimization: Use pre-computed `textLower` field to avoid repeated toLowerCase() calls for each verse.
            for (const term of searchTerms) {
                if (v.textLower.includes(term)) score += 1;
            }
            return { ...v, score };
        }).filter(v => v.score > 0);

        scoredVerses.sort((a, b) => b.score - a.score);
        return scoredVerses.slice(0, limit);
    }

    /**
     * Formats an array of verse objects into a human-readable citation string.
     * This method does not interact with the database, so it remains synchronous.
     *
     * @param {Array<Object>} verses - An array of verse objects, each expected to have
     *                                 `book`, `chapter`, `verse`, and `text` properties.
     *                                 It's assumed the verses belong to the same book and chapter
     *                                 and are in sequential order for proper citation formatting.
     * @returns {string} A formatted string representing the verses and their citation
     *                   (e.g., "[v1] The fear of the Lord is the beginning of knowledge... (Proverbs 1:7)").
     *                   Returns "No text found." if the input array is empty or null.
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

/**
 * The singleton instance of the WisdomService.
 * This instance should be used throughout the application to interact with the wisdom database.
 * @type {WisdomService}
 */
export const wisdomService = new WisdomService();