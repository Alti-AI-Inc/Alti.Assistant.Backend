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

    // Tier 2 Mystical Additions
    database.push({ book: 'The Interior Castle', chapter: 1, verse: 1, text: 'I began to think of the soul as if it were a castle made of a single diamond or of very clear crystal, in which there are many rooms, just as in Heaven there are many mansions.'});
    database.push({ book: 'The Interior Castle', chapter: 1, verse: 2, text: 'Let us now imagine that this castle has, as I have said, many mansions, some above, others below, others at each side; and in the center and midst of them all is the chiefest mansion where the most secret things pass between God and the soul.'});
    database.push({ book: 'The Interior Castle', chapter: 7, verse: 1, text: 'It is here, in this seventh mansion, that the soul is united with God in a way that goes beyond all visions and spiritual consolations. The soul is brought into this mansion by a pure intellectual vision of the Holy Trinity.'});
    
    database.push({ book: 'Dark Night of the Soul', chapter: 1, verse: 1, text: 'On a dark night, Kindled in love with yearnings—oh, happy chance!—I went forth without being observed, My house being now at rest.'});
    database.push({ book: 'Dark Night of the Soul', chapter: 1, verse: 2, text: 'In darkness and secure, By the secret ladder, disguised—oh, happy chance!—In darkness and in concealment, My house being now at rest.'});
    database.push({ book: 'Ascent of Mount Carmel', chapter: 1, verse: 1, text: 'In order to arrive at having pleasure in everything, desire to have pleasure in nothing. In order to arrive at possessing everything, desire to possess nothing. In order to arrive at being everything, desire to be nothing.'});

    database.push({ book: 'Book of Jubilees', chapter: 1, verse: 27, text: 'And He said to the angel of the presence: "Write for Moses from the beginning of creation till My sanctuary has been built among them for all eternity."'});
    database.push({ book: 'Book of Jubilees', chapter: 2, verse: 2, text: 'For on the first day He created the heavens which are above and the earth and the waters and all the spirits which serve before him - the angels of the presence, and the angels of sanctification.'});

    database.push({ book: 'Testaments of the Twelve Patriarchs', chapter: 1, verse: 1, text: 'The copy of the testament of Reuben, even the commands which he gave his sons before he died in the hundred and twenty-fifth year of his life. Two ways has God given to the sons of men, and two inclinations, and two kinds of action, and two modes of action, and two issues.'});

    database.push({ book: 'Sayings of the Desert Fathers', chapter: 1, verse: 1, text: 'Abba Antony said: "I saw the snares that the enemy spreads out over the world and I said groaning, \'What can get through from such snares?\' Then I heard a voice saying to me, \'Humility.\'"'});
    database.push({ book: 'The Philokalia', chapter: 1, verse: 1, text: 'Watchfulness is a spiritual method which, if sedulously practiced over a long period, completely frees us with God\'s help from impassioned thoughts, impassioned words and evil actions.'});

    fs.writeFileSync(OUT_FILE, JSON.stringify(database, null, 2), 'utf8');
    console.log(`Successfully built ${OUT_FILE} with ${database.length} total entries.`);
}

buildDatabase().catch(console.error);
