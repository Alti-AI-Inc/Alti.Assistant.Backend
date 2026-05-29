import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { bibleService } from "./bible.service.js";

export const BibleSearchTool = new DynamicStructuredTool({
    name: "bible_search",
    description: "Search the Berean Standard Bible (BSB) for specific passages or topics to provide perfectly accurate, citable scripture references. Use this tool anytime a user asks a question about the Bible, requests a verse, or needs spiritual guidance.",
    schema: z.object({
        action: z.enum(["lookup", "search"]).describe("Use 'lookup' if you know the exact book, chapter, and verse. Use 'search' to find verses about a topic."),
        query: z.string().optional().describe("For 'search' action, provide a search query or keywords (e.g. 'fruits of the spirit', 'love your enemies')."),
        book: z.string().optional().describe("For 'lookup' action, the 3-letter book code (e.g., GEN, MAT, JHN, REV)."),
        chapter: z.number().optional().describe("For 'lookup' action, the chapter number."),
        startVerse: z.number().optional().describe("For 'lookup' action, the starting verse number."),
        endVerse: z.number().optional().describe("For 'lookup' action, the ending verse number (optional, defaults to startVerse).")
    }),
    func: async ({ action, query, book, chapter, startVerse, endVerse }) => {
        try {
            if (action === "lookup") {
                if (!book || !chapter || !startVerse) {
                    return "Error: For lookup, you must provide 'book', 'chapter', and 'startVerse'.";
                }
                const verses = bibleService.lookupPassage(book, chapter, startVerse, endVerse);
                if (verses.length === 0) return `No verses found for ${book} ${chapter}:${startVerse}`;
                return bibleService.formatVerses(verses);
            } else if (action === "search") {
                if (!query) {
                    return "Error: For search, you must provide a 'query'.";
                }
                const verses = bibleService.search(query, 5);
                if (verses.length === 0) return `No verses found matching '${query}'.`;
                
                let resultText = `Top matches for '${query}':\n`;
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
