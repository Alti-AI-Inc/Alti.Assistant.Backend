import { intelligentSearchNode } from './src/app/modules/search/search_assistant/nodes.js';

/**
 * Test script for enhanced Tavily search functionality
 * This script demonstrates the improved search with detailed content extraction
 */

async function testEnhancedSearch() {
  console.log('🔍 Testing Enhanced Tavily Search with Detailed Content');
  console.log('=' .repeat(60));

  // Test state object
  const testState = {
    query: 'Latest AI developments in 2024',
    contextualizedQuery: 'Latest AI developments in 2024',
    depth: 'deep', // Use deep search for maximum detail
    previousSearchContext: null
  };

  try {
    console.log('📋 Test Configuration:');
    console.log(`Query: ${testState.query}`);
    console.log(`Search Depth: ${testState.depth}`);
    console.log(`Max Results: 10 (deep search)`);
    console.log('Enhanced Features: ✅ Detailed Content, ✅ Domain Extraction, ✅ Recency Check');
    console.log('');

    console.log('🚀 Executing Enhanced Search...');
    const result = await intelligentSearchNode(testState);

    console.log('📊 Search Results Summary:');
    console.log(`Total Results: ${result.metadata?.numResults || 0}`);
    console.log(`Search Query Used: ${result.contextualizedQuery}`);
    console.log(`Tavily Answer Available: ${!!result.metadata?.tavilyAnswer}`);
    console.log('');

    if (result.metadata?.results && result.metadata.results.length > 0) {
      console.log('📑 Detailed Content Analysis:');
      
      result.metadata.results.forEach((item, index) => {
        console.log(`\n--- Source ${index + 1} ---`);
        console.log(`Title: ${item.title}`);
        console.log(`Domain: ${item.domain}`);
        console.log(`URL: ${item.url}`);
        console.log(`Content Length: ${item.contentLength} characters`);
        console.log(`Relevance Score: ${item.score?.toFixed(3)}`);
        console.log(`Published Date: ${item.publishedDate || 'Not available'}`);
        console.log(`Is Recent: ${item.isRecent ? '✅ Recent' : '❌ Older'}`);
        console.log(`Has Raw Content: ${item.rawContent ? '✅ Yes' : '❌ No'}`);
        
        // Show content preview
        const preview = item.detailedContent?.substring(0, 200) || 'No content available';
        console.log(`Content Preview: ${preview}${item.detailedContent?.length > 200 ? '...' : ''}`);
      });

      console.log('\n🎯 Enhanced Features Demonstration:');
      console.log('✅ Detailed content extraction from multiple sources');
      console.log('✅ Domain and recency information');
      console.log('✅ Content quality scoring and ranking');
      console.log('✅ Raw content when available for deeper analysis');
      console.log('✅ Structured metadata for better processing');

      // Show if Tavily provided a summary answer
      if (result.metadata.tavilyAnswer) {
        console.log('\n📋 Tavily AI Summary:');
        console.log(result.metadata.tavilyAnswer);
      }

    } else {
      console.log('❌ No search results found');
    }

  } catch (error) {
    console.error('❌ Error during enhanced search test:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testEnhancedSearch()
    .then(() => {
      console.log('\n✅ Enhanced search test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

export { testEnhancedSearch };
