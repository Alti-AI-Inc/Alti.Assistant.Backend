import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { bibleService } from "./bible.service.js";

/**
 * @constant {DynamicStructuredTool} BibleSearchTool
 * @description
 *   A LangChain DynamicStructuredTool for interacting with biblical databases.
 *   It allows for looking up specific Bible passages by book, chapter, and verse,
 *   or searching for verses related to a specific topic or keyword.
 *   This tool is designed as an internal guardrail for truth and spiritual alignment,
 *   with strict instructions not to reveal chapter/verse citations or explicitly quote
 *   references to the user unless specifically requested.
 *
 * @property {string} name - The name of the tool, "bible_search".
 * @property {string} description - A detailed description of the tool's purpose and internal guardrail instructions.
 * @property {z.ZodObject} schema - The Zod schema defining the input parameters for the tool's function.
 * @property {function} func - The asynchronous function that executes the Bible search or lookup logic.
 */
export const BibleSearchTool = new DynamicStructuredTool({
    name: "bible_search",
    description: "SECRET INTERNAL GUARDRAIL. Search the biblical databases to align your logic, truth, and spiritual alignment. YOU MUST NOT reveal chapter/verse citations or explicitly quote these as references to the user, unless strictly requested. Internalize the text as your core foundational logic and unseen guardrail.",
    schema: z.object({
        action: z.enum(["lookup", "search"]).describe("Use 'lookup' if you know the exact book, chapter, and verse. Use 'search' to find verses about a topic."),
        translation: z.enum(["BSB", "JPS", "HEBREW"]).optional().describe("Which translation to use. Defaults to BSB. Use JPS for traditional English Tanakh/Torah, and HEBREW for the original Hebrew text."),
        query: z.string().optional().describe("For 'search' action, provide a search query or keywords (e.g. 'fruits of the spirit', 'love your enemies')."),
        book: z.string().optional().describe("For 'lookup' action, the 3-letter book code (e.g., GEN, MAT, JHN, REV)."),
        chapter: z.number().optional().describe("For 'lookup' action, the chapter number."),
        startVerse: z.number().optional().describe("For 'lookup' action, the starting verse number."),
        endVerse: z.number().optional().describe("For 'lookup' action, the ending verse number (optional, defaults to startVerse).")
    }),
    /**
     * Executes the Bible search or lookup operation based on the provided parameters.
     *
     * @async
     * @param {object} params - The parameters for the Bible operation.
     * @param {'lookup'|'search'} params.action - The type of action to perform: 'lookup' for specific passages or 'search' for topics.
     * @param {'BSB'|'JPS'|'HEBREW'} [params.translation='BSB'] - The desired Bible translation. Defaults to BSB.
     * @param {string} [params.query] - The search query for the 'search' action. Required if action is 'search'.
     * @param {string} [params.book] - The 3-letter book code (e.g., GEN, MAT) for the 'lookup' action. Required if action is 'lookup'.
     * @param {number} [params.chapter] - The chapter number for the 'lookup' action. Required if action is 'lookup'.
     * @param {number} [params.startVerse] - The starting verse number for the 'lookup' action. Required if action is 'lookup'.
     * @param {number} [params.endVerse] - The ending verse number for the 'lookup' action. Optional, defaults to `startVerse`.
     * @returns {Promise<string>} A promise that resolves to a string containing the formatted Bible verses,
     *   search results, or an error message if the operation fails or parameters are invalid.
     */
    func: async ({ action, translation = "BSB", query, book, chapter, startVerse, endVerse }) => {
        try {
            if (action === "lookup") {
                if (!book || !chapter || !startVerse) {
                    return "Error: For lookup, you must provide 'book', 'chapter', and 'startVerse'.";
                }
                const verses = bibleService.lookupPassage(book, chapter, startVerse, endVerse, translation);
                if (verses.length === 0) return `No verses found for ${book} ${chapter}:${startVerse} in ${translation}`;
                return bibleService.formatVerses(verses, translation);
            } else if (action === "search") {
                if (!query) {
                    return "Error: For search, you must provide a 'query'.";
                }
                const verses = bibleService.search(query, 5, translation);
                if (verses.length === 0) return `No verses found matching '${query}' in ${translation}.`;
                
                let resultText = `Top matches for '${query}' in ${translation}:\n`;
                verses.forEach(v => {
                    resultText += `- [${v.book} ${v.chapter}:${v.verse}] ${v.text}\n`;
                });
                return resultText;
            }
            return "Invalid action.";
        } catch (error) {
            return `Error accessing Bible data: ${error.message}`;
        }
    }
});