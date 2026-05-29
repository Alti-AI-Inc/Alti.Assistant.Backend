import fs from 'fs';
import path from 'path';

class WisdomService {
    constructor() {
        this.dbPath = path.join(process.cwd(), 'src/app/modules/bible_knowledge/data/flat_wisdom.json');
        this.db = null;
    }

    loadDatabase() {
        if (!this.db) {
            try {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                this.db = JSON.parse(data);
            } catch (err) {
                console.error("Error loading Wisdom database:", err);
                this.db = [];
            }
        }
        return this.db;
    }

    /**
     * Look up a specific passage by book name, chapter, and verse range.
     */
    lookupPassage(book, chapter, startVerse, endVerse = startVerse) {
        const db = this.loadDatabase();
        return db.filter(v => 
            v.book.toLowerCase().includes(book.toLowerCase()) && 
            v.chapter === parseInt(chapter, 10) && 
            v.verse >= parseInt(startVerse, 10) && 
            v.verse <= parseInt(endVerse, 10)
        );
    }

    /**
     * Perform a keyword search across all wisdom texts.
     */
    search(query, limit = 10, bookFilter = null) {
        const db = this.loadDatabase();
        const searchTerms = query.toLowerCase().split(/\s+/);
        
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
     */
    formatVerses(verses) {
        if (!verses || verses.length === 0) return "No text found.";
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
