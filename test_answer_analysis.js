// Test script for the new answer analysis feature in search module
import { analyzeDirectAnswerQuality } from '../src/app/modules/search/llm.js';

// Test cases for answer quality analysis
const testCases = [
  {
    query: "What is the current Detroit Tigers game schedule?",
    answer: "I don't have access to real-time sports schedules. You would need to check the official Detroit Tigers website or ESPN for the most current schedule information.",
    expected: "INADEQUATE"
  },
  {
    query: "What is photosynthesis?",
    answer: "Photosynthesis is the process by which plants use sunlight, water, and carbon dioxide to produce glucose and oxygen. This process occurs in the chloroplasts of plant cells and is essential for life on Earth as it provides oxygen and forms the base of most food chains.",
    expected: "ADEQUATE"
  },
  {
    query: "When is the next iPhone release?",
    answer: "I'm not sure about the exact date of the next iPhone release as Apple doesn't always announce these dates far in advance.",
    expected: "INADEQUATE"
  },
  {
    query: "How does gravity work?",
    answer: "Gravity is a fundamental force that causes objects with mass to attract each other. According to Einstein's general relativity, gravity is the curvature of spacetime caused by mass and energy. The more massive an object, the stronger its gravitational pull.",
    expected: "ADEQUATE"
  }
];

async function testAnswerAnalysis() {
  console.log("Testing Answer Quality Analysis...\n");

  for (const testCase of testCases) {
    try {
      const result = await analyzeDirectAnswerQuality(
        testCase.answer,
        testCase.query,
        []
      );

      const status = result === testCase.expected ? "✅ PASS" : "❌ FAIL";

      console.log(`${status}: Query: "${testCase.query}"`);
      console.log(`Expected: ${testCase.expected}, Got: ${result}`);
      console.log(`Answer: "${testCase.answer.substring(0, 100)}..."`);
      console.log("---");
    } catch (error) {
      console.error(`❌ ERROR testing query: "${testCase.query}"`, error.message);
      console.log("---");
    }
  }
}

// Run the test if this file is executed directly
if (process.argv[1].endsWith('test_answer_analysis.js')) {
  testAnswerAnalysis().catch(console.error);
}

export { testAnswerAnalysis };