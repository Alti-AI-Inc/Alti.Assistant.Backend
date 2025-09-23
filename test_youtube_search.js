// Test script for YouTube search integration
import {
  shouldSearchYouTube,
  searchYouTube
} from '../src/app/modules/search/llm.js';

// Test cases for YouTube search relevance
const testCases = [
  {
    query: "How to make chocolate chip cookies",
    expectedRelevant: true,
    category: "Tutorial/How-to"
  },
  {
    query: "iPhone 15 review and comparison",
    expectedRelevant: true,
    category: "Product Review"
  },
  {
    query: "What is the capital of France?",
    expectedRelevant: false,
    category: "Simple Fact"
  },
  {
    query: "Latest Drake music video",
    expectedRelevant: true,
    category: "Entertainment"
  },
  {
    query: "How to install Node.js on Windows",
    expectedRelevant: true,
    category: "Technical Tutorial"
  },
  {
    query: "What time is it in New York?",
    expectedRelevant: false,
    category: "Real-time Information"
  },
  {
    query: "Best yoga poses for beginners",
    expectedRelevant: true,
    category: "Visual Learning"
  },
  {
    query: "Calculate 15% of 200",
    expectedRelevant: false,
    category: "Math Calculation"
  }
];

async function testYouTubeRelevance() {
  console.log("🎥 Testing YouTube Search Relevance Detection\n");

  let correct = 0;
  let total = testCases.length;

  for (const testCase of testCases) {
    try {
      const isRelevant = await shouldSearchYouTube(testCase.query, []);
      const isCorrect = isRelevant === testCase.expectedRelevant;

      if (isCorrect) correct++;

      const status = isCorrect ? "✅ CORRECT" : "❌ INCORRECT";
      const relevanceText = isRelevant ? "RELEVANT" : "NOT RELEVANT";

      console.log(`${status}: "${testCase.query}"`);
      console.log(`   Category: ${testCase.category}`);
      console.log(`   Expected: ${testCase.expectedRelevant ? "RELEVANT" : "NOT RELEVANT"}, Got: ${relevanceText}`);
      console.log("   ---");
    } catch (error) {
      console.error(`❌ ERROR testing query: "${testCase.query}"`, error.message);
      console.log("   ---");
    }
  }

  console.log(`\n📊 Results: ${correct}/${total} correct (${Math.round((correct / total) * 100)}% accuracy)\n`);
}

async function testYouTubeSearch() {
  console.log("🔍 Testing YouTube Search Functionality\n");

  // Test with a query that should definitely find results
  const testQuery = "how to make pancakes";

  try {
    console.log(`Searching YouTube for: "${testQuery}"`);
    const results = await searchYouTube(testQuery, 3);

    if (results.length === 0) {
      console.log("⚠️  No results found - this might be due to missing API key or API issues");
      return;
    }

    console.log(`Found ${results.length} YouTube results:\n`);

    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.title}`);
      console.log(`   Channel: ${result.channelTitle}`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Published: ${result.publishedAt}`);
      console.log(`   Description: ${result.description.substring(0, 100)}...`);
      console.log("   ---");
    });

    console.log("✅ YouTube search test completed successfully!");

  } catch (error) {
    console.error("❌ Error testing YouTube search:", error.message);

    if (error.message.includes("API key")) {
      console.log("💡 Tip: Make sure YOUTUBE_API_KEY is set in your environment variables");
    }
  }
}

async function testYouTubeIntegration() {
  console.log("🧪 Testing YouTube Search Integration\n");

  try {
    await testYouTubeRelevance();
    await testYouTubeSearch();

    console.log("🎉 All YouTube integration tests completed!");

  } catch (error) {
    console.error("❌ Error in YouTube integration tests:", error);
  }
}

// Run the test if this file is executed directly
if (process.argv[1].endsWith('test_youtube_search.js')) {
  testYouTubeIntegration().catch(console.error);
}

export { testYouTubeIntegration, testYouTubeRelevance, testYouTubeSearch };