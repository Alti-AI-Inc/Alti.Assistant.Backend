import { BibleSearchTool } from './src/app/modules/bible_knowledge/bible.tool.js';

async function test() {
    console.log("=== Testing Lookup ===");
    const lookupResult = await BibleSearchTool.invoke({
        action: "lookup",
        book: "JHN",
        chapter: 3,
        startVerse: 16
    });
    console.log(lookupResult);

    console.log("\n=== Testing Search ===");
    const searchResult = await BibleSearchTool.invoke({
        action: "search",
        query: "beginning"
    });
    console.log(searchResult);
}

test();
