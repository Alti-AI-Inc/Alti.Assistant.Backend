import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(DATA_DIR, 'flat_wisdom.json');

const SOURCES = [
    {
        name: 'Imitation of Christ',
        url: 'https://www.gutenberg.org/cache/epub/1653/pg1653.txt',
        type: 'gutenberg'
    },
    {
        name: 'Confessions of St. Augustine',
        url: 'https://www.gutenberg.org/cache/epub/3296/pg3296.txt',
        type: 'gutenberg'
    }
];

async function fetchText(url) {
    return new Promise((resolve, reject) => {
        let rawData = '';
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchText(res.headers.location).then(resolve).catch(reject);
            }
            res.on('data', chunk => rawData += chunk);
            res.on('end', () => resolve(rawData));
        }).on('error', reject);
    });
}

async function buildDatabase() {
    console.log('Building Wisdom Library...');
    const database = [];

    for (const source of SOURCES) {
        console.log(`Downloading ${source.name}...`);
        try {
            let text = await fetchText(source.url);
            
            // Clean up Gutenberg headers/footers
            const startMarker = "*** START OF THE PROJECT GUTENBERG EBOOK";
            const endMarker = "*** END OF THE PROJECT GUTENBERG EBOOK";
            
            let startIndex = text.indexOf(startMarker);
            if (startIndex !== -1) {
                startIndex = text.indexOf('\n', startIndex) + 1;
            } else {
                startIndex = 0;
            }
            
            let endIndex = text.indexOf(endMarker);
            if (endIndex === -1) endIndex = text.length;
            
            text = text.substring(startIndex, endIndex);

            // Split into paragraphs/verses
            const paragraphs = text.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length > 20);
            
            let chapter = 1;
            let verse = 1;

            for (const p of paragraphs) {
                if (p.toUpperCase() === p && p.length < 100) {
                    // Looks like a title or chapter heading
                    chapter++;
                    verse = 1;
                    continue;
                }
                
                database.push({
                    book: source.name,
                    chapter: chapter,
                    verse: verse++,
                    text: p
                });
            }
            
            console.log(`Parsed ${verse} entries for ${source.name}`);
        } catch (err) {
            console.error(`Error processing ${source.name}:`, err);
        }
    }
    
    // Add stub for Enoch and Didache for immediate capability
    database.push({ book: 'Book of Enoch', chapter: 1, verse: 1, text: 'The word of the blessing of Enoch, how he blessed the elect and the righteous, who were to exist in the time of trouble; rejecting all the wicked and ungodly.'});
    database.push({ book: 'Book of Enoch', chapter: 1, verse: 2, text: 'Enoch, a righteous man, whose eyes were opened by God, saw the vision of the Holy One in the heavens, which the angels showed me.'});
    database.push({ book: 'The Didache', chapter: 1, verse: 1, text: 'There are two ways, one of life and one of death, but a great difference between the two ways.'});
    database.push({ book: 'The Didache', chapter: 1, verse: 2, text: 'The way of life, then, is this: First, you shall love God who made you; second, love your neighbor as yourself, and do not do to another what you would not want done to you.'});
    database.push({ book: 'War Scroll', chapter: 1, verse: 1, text: 'For the Instructor, the Rule of the War. The first attack of the Sons of Light shall be undertaken against the forces of the Sons of Darkness, the army of Belial.'});

    fs.writeFileSync(OUT_FILE, JSON.stringify(database, null, 2), 'utf8');
    console.log(`Successfully built ${OUT_FILE} with ${database.length} total entries.`);
}

buildDatabase().catch(console.error);
