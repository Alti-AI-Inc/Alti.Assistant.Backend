/**
 * Example: Enhanced Tavily Search Usage
 * 
 * This example shows how to use the enhanced Tavily search functionality
 * with detailed content extraction and rich metadata.
 */

import config from './config/index.js';
import { TavilySearch } from '@langchain/tavily';

// Example function demonstrating the enhanced search
async function exampleEnhancedSearch() {
  // Configure Tavily with enhanced parameters
  const researchTool = new TavilySearch({
    tavilyApiKey: config.tavily_api_key,
    searchDepth: 'advanced',
    maxResults: 8,
    includeAnswer: true,
    includeRawContent: true,
    includeImages: false,
    excludeDomains: ['reddit.com', 'quora.com']
  });

  try {
    // Perform enhanced search
    const response = await researchTool.invoke({ 
      query: "Latest breakthrough in quantum computing 2024",
      searchDepth: 'advanced',
      maxResults: 8,
      includeAnswer: true,
      includeRawContent: true
    });

    console.log('🔍 Enhanced Search Results:');
    console.log('==============================');
    
    // Show Tavily's AI-generated answer
    if (response.answer) {
      console.log('📋 AI Summary from Tavily:');
      console.log(response.answer);
      console.log('');
    }

    // Process each result with enhanced content
    response.results?.forEach((result, index) => {
      console.log(`📄 Result ${index + 1}:`);
      console.log(`Title: ${result.title}`);
      console.log(`URL: ${result.url}`);
      console.log(`Score: ${result.score?.toFixed(3)}`);
      
      // Show detailed content (this is the enhancement!)
      const detailedContent = result.raw_content || result.content || 'Limited content';
      console.log(`Content Length: ${detailedContent.length} characters`);
      console.log(`Content Preview: ${detailedContent.substring(0, 300)}...`);
      
      // Extract domain
      try {
        const domain = new URL(result.url).hostname.replace('www.', '');
        console.log(`Domain: ${domain}`);
      } catch (e) {
        console.log('Domain: Unknown');
      }
      
      console.log('---');
    });

    return response;
  } catch (error) {
    console.error('❌ Enhanced search failed:', error.message);
    throw error;
  }
}

// Export for use in other modules
export { exampleEnhancedSearch };

// Run example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleEnhancedSearch()
    .then(() => console.log('✅ Enhanced search example completed!'))
    .catch(console.error);
}
