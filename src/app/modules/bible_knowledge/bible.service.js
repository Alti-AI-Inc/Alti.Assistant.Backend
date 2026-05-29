import fs from 'fs';
import path from 'path';

class BibleService {
    constructor() {
        this.dbPath = path.join(process.cwd(), 'src/app/modules/bible_knowledge/data/flat_bsb.json');
        this.bible = null;
    }

    loadDatabase() {
        if (!this.bible) {
            try {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                this.bible = JSON.parse(data);
            } catch (err) {
                console.error("Error loading Bible database:", err);
                this.bible = [];
            }
        }
    }

    /**
     * Look up a specific passage by book code, chapter, and verse range.
     * @param {string} book - Standard 3-letter book code (e.g. 'GEN', 'JHN', 'ROM')
     * @param {number} chapter 
     * @param {number} startVerse 
     * @param {number} endVerse 
     * @returns {Array} Array of verse objects
     */
    lookupPassage(book, chapter, startVerse, endVerse = startVerse) {
        this.loadDatabase();
        return this.bible.filter(v => 
            v.book.toUpperCase() === book.toUpperCase() && 
            v.chapter === parseInt(chapter, 10) && 
            v.verse >= parseInt(startVerse, 10) && 
            v.verse <= parseInt(endVerse, 10)
        );
    }

    /**
     * Perform a simple keyword/semantic-light search across the text.
     * @param {string} query 
     * @param {number} limit 
     * @returns {Array} Array of verse objects
     */
    search(query, limit = 10) {
        this.loadDatabase();
        const searchTerms = query.toLowerCase().split(/\s+/);
        
        // Simple scoring based on word matches
        const scoredVerses = this.bible.map(v => {
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
     */
    formatVerses(verses) {
        if (!verses || verses.length === 0) return "No verses found.";
        const book = verses[0].book;
        const chapter = verses[0].chapter;
        const start = verses[0].verse;
        const end = verses[verses.length - 1].verse;
        
        const reference = `${book} ${chapter}:${start}${start !== end ? '-' + end : ''}`;
        const text = verses.map(v => `[v${v.verse}] ${v.text}`).join(' ');
        
        return `${text} (${reference})`;
    }
}

export const bibleService = new BibleService();
