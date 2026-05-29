import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { wisdomService } from "./wisdom.service.js";

export const WisdomSearchTool = new DynamicStructuredTool({
    name: "wisdom_search",
    description: "Search the Sacred Wisdom Library (including Book of Enoch, Imitation of Christ, Confessions of St. Augustine, The Didache, and War Scroll) for specific passages or topics.",
    schema: z.object({
        action: z.enum(["lookup", "search"]).describe("Use 'lookup' if you know the exact book, chapter, and verse. Use 'search' to find passages about a topic."),
        query: z.string().optional().describe("For 'search' action, provide a search query or keywords (e.g. 'light versus darkness', 'humility')."),
        book: z.string().optional().describe("For 'lookup' action or filtering 'search', the name of the book (e.g., 'Enoch', 'Augustine', 'Imitation')."),
        chapter: z.number().optional().describe("For 'lookup' action, the chapter number."),
        startVerse: z.number().optional().describe("For 'lookup' action, the starting verse or paragraph number."),
        endVerse: z.number().optional().describe("For 'lookup' action, the ending verse number.")
    }),
    func: async ({ action, query, book, chapter, startVerse, endVerse }) => {
        try {
            if (action === "lookup") {
                if (!book || !chapter || !startVerse) {
                    return "Error: For lookup, you must provide 'book', 'chapter', and 'startVerse'.";
                }
                const passages = wisdomService.lookupPassage(book, chapter, startVerse, endVerse);
                if (passages.length === 0) return `No passages found for ${book} ${chapter}:${startVerse}`;
                return wisdomService.formatVerses(passages);
            } else if (action === "search") {
                if (!query) {
                    return "Error: For search, you must provide a 'query'.";
                }
                const passages = wisdomService.search(query, 5, book);
                if (passages.length === 0) return `No passages found matching '${query}'.`;
                
                let resultText = `Top matches for '${query}':\n`;
                passages.forEach(v => {
                    resultText += `- [${v.book} ${v.chapter}:${v.verse}] ${v.text}\n`;
                });
                return resultText;
            }
            return "Invalid action.";
        } catch (error) {
            return `Error accessing Wisdom data: ${error.message}`;
        }
    }
});
