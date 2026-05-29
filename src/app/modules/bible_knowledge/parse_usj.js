import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'src/app/modules/bible_knowledge/data/bsb');
const outputFilePath = path.join(process.cwd(), 'src/app/modules/bible_knowledge/data/flat_bsb.json');

const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.usj'));

const flatBible = [];

function extractText(contentArray) {
    if (!contentArray) return '';
    let text = '';
    for (const item of contentArray) {
        if (typeof item === 'string') {
            text += item + ' ';
        } else if (typeof item === 'object') {
            if (item.type === 'char' && item.content) {
                 text += extractText(item.content);
            } else if (item.type === 'ref' && item.content) {
                 // ignore ref text
            }
        }
    }
    return text.trim();
}

for (const file of files) {
    const rawData = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    const usj = JSON.parse(rawData);
    
    let currentBook = '';
    let currentChapter = 0;
    
    // Find book code
    const bookNode = usj.content.find(n => n.type === 'book');
    if (bookNode) {
        currentBook = bookNode.code;
    }

    // Traverse paragraphs and chapters
    let currentVerse = 0;
    let verseText = '';

    const pushVerse = () => {
        if (currentVerse > 0 && verseText.trim().length > 0) {
            // Clean up punctuation spacing
            let cleanedText = verseText.replace(/\s+([.,;?!])/g, '$1').replace(/\s+/g, ' ').trim();
            // remove things like ". . ." if standalone
            cleanedText = cleanedText.replace(/\s*\.\ \.\ \.\s*/g, ' ');
            // remove weird artifacts like vvv
            cleanedText = cleanedText.replace(/vvv/g, ' ');
            cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
            
            flatBible.push({
                book: currentBook,
                chapter: currentChapter,
                verse: currentVerse,
                text: cleanedText
            });
        }
        verseText = '';
    };

    for (const node of usj.content) {
        if (node.type === 'chapter') {
            pushVerse(); // push last verse of previous chapter
            currentChapter = parseInt(node.number, 10);
            currentVerse = 0;
        } else if (node.type === 'para' && node.content) {
            for (const item of node.content) {
                if (typeof item === 'string') {
                    verseText += item + ' ';
                } else if (item.type === 'verse') {
                    pushVerse(); // push previous verse
                    currentVerse = parseInt(item.number, 10) || parseInt(item.number.split('-')[0], 10);
                } else if (item.type === 'char') {
                    verseText += extractText([item]).trim() + ' ';
                }
            }
        }
    }
    pushVerse(); // push final verse of the book
}

fs.writeFileSync(outputFilePath, JSON.stringify(flatBible, null, 2));
console.log(`Successfully flattened ${files.length} books into ${flatBible.length} verses.`);
