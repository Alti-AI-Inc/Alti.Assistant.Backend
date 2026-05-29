import fs from 'fs';
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

    loadDatabase(translation = 'BSB') {
        const trans = translation.toUpperCase();
        if (!this.files[trans]) {
            throw new Error(`Unsupported translation: ${translation}`);
        }
        
        if (!this.databases[trans]) {
            try {
                const dbPath = path.join(this.dataDir, this.files[trans]);
                const data = fs.readFileSync(dbPath, 'utf8');
                this.databases[trans] = JSON.parse(data);
            } catch (err) {
                console.error(`Error loading Bible database (${trans}):`, err);
                this.databases[trans] = [];
            }
        }
        return this.databases[trans];
    }

    /**
     * Look up a specific passage by book code, chapter, and verse range.
     */
    lookupPassage(book, chapter, startVerse, endVerse = startVerse, translation = 'BSB') {
        const db = this.loadDatabase(translation);
        return db.filter(v => 
            v.book.toUpperCase() === book.toUpperCase() && 
            v.chapter === parseInt(chapter, 10) && 
            v.verse >= parseInt(startVerse, 10) && 
            v.verse <= parseInt(endVerse, 10)
        );
    }

    /**
     * Perform a simple keyword/semantic-light search across the text.
     */
    search(query, limit = 10, translation = 'BSB') {
        const db = this.loadDatabase(translation);
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
        return scoredVerses.slice(0, limit);
    }
    
    /**
     * Formats verses into a readable citation string.
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
