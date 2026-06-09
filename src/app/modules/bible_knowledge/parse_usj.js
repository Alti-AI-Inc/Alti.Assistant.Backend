/**
 * @file This script parses USJ (Unified Standard Format for JSON) Bible files
 *       from a specified directory, extracts verse text, and flattens them
 *       into a single JSON array of objects, where each object represents a verse
 *       with its book, chapter, verse number, and cleaned text.
 *       The output is saved to a JSON file.
 */

import fs from 'fs';
import path from 'path';

/**
 * The directory where the input USJ Bible files are located.
 * This path is relative to the current working directory of the process.
 * @type {string}
 */
const dataDir = path.join(process.cwd(), 'src/app/modules/bible_knowledge/data/bsb');

/**
 * The full path to the output JSON file where the flattened Bible data will be saved.
 * This path is relative to the current working directory of the process.
 * @type {string}
 */
const outputFilePath = path.join(process.cwd(), 'src/app/modules/bible_knowledge/data/flat_bsb.json');

/**
 * An array of filenames for all `.usj` files found in the `dataDir`.
 * These files represent individual books of the Bible in USJ format.
 * @type {string[]}
 */
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.usj'));

/**
 * An array that will store all the flattened Bible verses.
 * Each element will be an object with `book`, `chapter`, `verse`, and `text` properties.
 * @type {Array<Object>}
 * @property {string} book - The book code (e.g., 'GEN', 'EXO').
 * @property {number} chapter - The chapter number.
 * @property {number} verse - The verse number.
 * @property {string} text - The cleaned text content of the verse.
 */
const flatBible = [];

/**
 * Recursively extracts plain text content from a USJ content array.
 * It processes strings directly and dives into 'char' type objects,
 * while ignoring 'ref' type objects.
 *
 * @param {Array<string|Object>} contentArray - An array of USJ content items,
 *                                              which can be strings or objects
 *                                              with 'type' and 'content' properties.
 * @returns {string} The concatenated and trimmed text extracted from the array.
 */
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
                 // ignore ref text as it's typically metadata or cross-references
            }
        }
    }
    return text.trim();
}

/**
 * Main loop to process each USJ file.
 * Reads each USJ file, parses its JSON content, and extracts book, chapter,
 * and verse information along with the text.
 */
for (const file of files) {
    const rawData = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    const usj = JSON.parse(rawData);
    
    let currentBook = '';
    let currentChapter = 0;
    
    // Find the book code from the USJ content.
    const bookNode = usj.content.find(n => n.type === 'book');
    if (bookNode) {
        currentBook = bookNode.code;
    }

    let currentVerse = 0;
    let verseText = '';

    /**
     * Helper function to clean the accumulated `verseText` and push it
     * into the `flatBible` array if it's a valid verse.
     * Resets `verseText` after pushing.
     * @private
     */
    const pushVerse = () => {
        if (currentVerse > 0 && verseText.trim().length > 0) {
            // Clean up punctuation spacing (e.g., "word . " -> "word.")
            let cleanedText = verseText.replace(/\s+([.,;?!])/g, '$1').replace(/\s+/g, ' ').trim();
            // Remove standalone ellipses (e.g., ". . .")
            cleanedText = cleanedText.replace(/\s*\.\ \.\ \.\s*/g, ' ');
            // Remove specific artifacts like "vvv"
            cleanedText = cleanedText.replace(/vvv/g, ' ');
            // Normalize multiple spaces to single spaces and trim
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

    // Traverse the content nodes of the USJ file to extract chapters and verses.
    for (const node of usj.content) {
        if (node.type === 'chapter') {
            pushVerse(); // Push the last verse of the previous chapter before moving to a new one.
            currentChapter = parseInt(node.number, 10);
            currentVerse = 0; // Reset verse number for the new chapter.
        } else if (node.type === 'para' && node.content) {
            // Process paragraph content, which may contain text, verses, or character formatting.
            for (const item of node.content) {
                if (typeof item === 'string') {
                    verseText += item + ' ';
                } else if (item.type === 'verse') {
                    pushVerse(); // Push the previous verse before starting a new one.
                    // Handle verse ranges (e.g., "1-2") by taking the first number.
                    currentVerse = parseInt(item.number, 10) || parseInt(item.number.split('-')[0], 10);
                } else if (item.type === 'char') {
                    // Extract text from character-level formatting.
                    verseText += extractText([item]).trim() + ' ';
                }
            }
        }
    }
    pushVerse(); // Push the very last verse of the current book after the loop finishes.
}

/**
 * Writes the `flatBible` array to the specified output JSON file.
 * The JSON is formatted with an indent of 2 spaces for readability.
 */
fs.writeFileSync(outputFilePath, JSON.stringify(flatBible, null, 2));

/**
 * Logs a success message to the console, indicating how many books were processed
 * and how many verses were flattened.
 */
console.log(`Successfully flattened ${files.length} books into ${flatBible.length} verses.`);