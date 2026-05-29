import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { bibleService } from "./bible.service.js";

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
