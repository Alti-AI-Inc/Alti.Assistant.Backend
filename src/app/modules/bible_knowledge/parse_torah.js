import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const URL = 'https://raw.githubusercontent.com/MarkBuffalo/gen-tanakh/main/tanakh.json';
const DATA_DIR = path.join(__dirname, 'data');
const OUT_JPS = path.join(DATA_DIR, 'flat_jps.json');
const OUT_HEB = path.join(DATA_DIR, 'flat_hebrew.json');

const bookMap = {
    'Genesis': 'GEN',
    'Exodus': 'EXO',
    'Leviticus': 'LEV',
    'Numbers': 'NUM',
    'Deuteronomy': 'DEU',
    'Joshua': 'JOS',
    'Judges': 'JDG',
    'Ruth': 'RUT',
    'I_Samuel': '1SA',
    'II_Samuel': '2SA',
    'I_Kings': '1KI',
    'II_Kings': '2KI',
    'I_Chronicles': '1CH',
    'II_Chronicles': '2CH',
    'Ezra': 'EZR',
    'Nehemiah': 'NEH',
    'Esther': 'EST',
    'Job': 'JOB',
    'Psalms': 'PSA',
    'Proverbs': 'PRO',
    'Ecclesiastes': 'ECC',
    'Song_of_Songs': 'SNG',
    'Isaiah': 'ISA',
    'Jeremiah': 'JER',
    'Lamentations': 'LAM',
    'Ezekiel': 'EZK',
    'Daniel': 'DAN',
    'Hosea': 'HOS',
    'Joel': 'JOL',
    'Amos': 'AMO',
    'Obadiah': 'OBA',
    'Jonah': 'JON',
    'Micah': 'MIC',
    'Nahum': 'NAM',
    'Habakkuk': 'HAB',
    'Zephaniah': 'ZEP',
    'Haggai': 'HAG',
    'Zechariah': 'ZEC',
    'Malachi': 'MAL'
};

async function downloadAndParse() {
    console.log('Downloading Tanakh JSON...');
    
    let rawData = '';
    await new Promise((resolve, reject) => {
        https.get(URL, (res) => {
            res.on('data', chunk => rawData += chunk);
            res.on('end', resolve);
        }).on('error', reject);
    });

    console.log('Parsing Tanakh JSON...');
    const data = JSON.parse(rawData);
    
    const flatJps = [];
    const flatHeb = [];

    for (const [bookName, chapters] of Object.entries(data)) {
        let code = bookMap[bookName];
        if (!code) {
            // Handle variations in book names if any
            if (bookName === '1 Samuel') code = '1SA';
            else if (bookName === '2 Samuel') code = '2SA';
            else if (bookName === '1 Kings') code = '1KI';
            else if (bookName === '2 Kings') code = '2KI';
            else if (bookName === '1 Chronicles') code = '1CH';
            else if (bookName === '2 Chronicles') code = '2CH';
            else if (bookName === 'Song of Solomon' || bookName === 'Song of Songs') code = 'SNG';
            else {
                console.log('Unknown book:', bookName);
                continue;
            }
        }

        for (const [chapterNum, verses] of Object.entries(chapters)) {
            let verseIndex = 1;
            
            for (let i = 0; i < verses.length; i++) {
                const item = verses[i];
                
                if (item.verse_he) {
                    flatHeb.push({
                        book: code,
                        chapter: parseInt(chapterNum, 10),
                        verse: verseIndex,
                        text: item.verse_he.trim()
                    });
                } else if (item.verse_en) {
                    flatJps.push({
                        book: code,
                        chapter: parseInt(chapterNum, 10),
                        verse: verseIndex,
                        text: item.verse_en.trim()
                    });
                    verseIndex++; // Increment verse after English is processed
                }
            }
        }
    }

    fs.writeFileSync(OUT_JPS, JSON.stringify(flatJps, null, 0), 'utf8');
    fs.writeFileSync(OUT_HEB, JSON.stringify(flatHeb, null, 0), 'utf8');

    console.log(`Successfully flattened ${flatJps.length} English verses to ${OUT_JPS}`);
    console.log(`Successfully flattened ${flatHeb.length} Hebrew verses to ${OUT_HEB}`);
}

downloadAndParse().catch(console.error);
