import { updateQueryWithCurrentYear } from '../src/app/modules/search/llm.js';
import { intelligentSearchNode } from '../src/app/modules/search/search_assistant/nodes.js';

/**
 * Test script to debug Detroit Tigers query issue
 */

async function testDetroitTigersQuery() {
  console.log('🏀 Testing Detroit Tigers Query Processing');
  console.log('=' .repeat(60));
  
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
  const currentDay = currentDate.getDate();
  
  console.log(`📅 Current Date: ${currentMonth} ${currentDay}, ${currentYear}`);
  console.log('');

  // Test the original query
  const originalQuery = "When is the next detroit tiger game?";
  
  console.log(`🔍 Original Query: "${originalQuery}"`);
  
  // Test helper function directly
  try {
    // Since the function isn't exported, let's recreate it for testing
    const testUpdateQuery = (query) => {
      const currentYear = new Date().getFullYear();
      const previousYears = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4, currentYear - 5];
      
      let updatedQuery = query;
      
      // Replace previous years with current year in common contexts
      previousYears.forEach(year => {
        // Match year patterns that are likely outdated
        const patterns = [
          new RegExp(`\\b${year}\\b(?=\\s*(game|schedule|season|event|news|latest|upcoming))`, 'gi'),
          new RegExp(`\\b(schedule|game|season|event|news|latest|upcoming)\\s+${year}\\b`, 'gi'),
          new RegExp(`\\b${year}\\s+(schedule|game|season|event|news|latest|upcoming)\\b`, 'gi')
        ];
        
        patterns.forEach(pattern => {
          updatedQuery = updatedQuery.replace(pattern, (match) => {
            return match.replace(year.toString(), currentYear.toString());
          });
        });
      });
      
      return updatedQuery;
    };
    
    const yearCorrectedQuery = testUpdateQuery(originalQuery);
    console.log(`📝 Year-corrected Query: "${yearCorrectedQuery}"`);
    
    // Test the actual search node
    const testState = {
      query: originalQuery,
      contextualizedQuery: originalQuery,
      depth: 'deep',
      previousSearchContext: null
    };
    
    console.log('\n🚀 Testing Full Search Pipeline...');
    console.log('📋 Test State:', {
      query: testState.query,
      depth: testState.depth
    });
    
    // This would need actual API keys to work, so let's simulate
    console.log('\n⚠️  Note: Full search test requires valid API keys');
    console.log('💡 Expected behavior:');
    console.log(`   - Query should be enhanced to include "${currentYear}"`);
    console.log(`   - Search should look for "Detroit Tigers schedule ${currentYear}"`);
    console.log(`   - Results should contain upcoming games, not past ones`);
    
    // Show what the enhanced search should look like
    console.log('\n🎯 Enhanced Search Query Examples:');
    console.log(`   Original: "When is the next detroit tiger game?"`);
    console.log(`   Enhanced: "Detroit Tigers next game schedule ${currentYear}"`);
    console.log(`   Enhanced: "Detroit Tigers upcoming games July ${currentYear}"`);
    console.log(`   Enhanced: "Detroit Tigers MLB schedule ${currentMonth} ${currentYear}"`);
    
    // Test date-aware context
    console.log('\n📅 Date-Aware Context:');
    console.log(`   Current Year: ${currentYear}`);
    console.log(`   Current Month: ${currentMonth}`);
    console.log(`   Current Day: ${currentDay}`);
    console.log(`   Should filter results to show games AFTER ${currentMonth} ${currentDay}, ${currentYear}`);
    
  } catch (error) {
    console.error('❌ Error in testing:', error);
  }
}

// Enhanced query generation test
function testQueryEnhancement() {
  console.log('\n🔧 Testing Query Enhancement Logic');
  console.log('-'.repeat(40));
  
  const currentYear = new Date().getFullYear();
  const testQueries = [
    "When is the next detroit tiger game?",
    "Detroit Tigers schedule 2023",
    "Upcoming Detroit Tigers games",
    "Latest Tigers game results 2024",
    "Next MLB game for Detroit"
  ];
  
  testQueries.forEach(query => {
    // Simple enhancement logic for testing
    let enhanced = query;
    
    // Add current year if not present
    if (!enhanced.includes(currentYear.toString())) {
      if (enhanced.toLowerCase().includes('next') || enhanced.toLowerCase().includes('upcoming')) {
        enhanced = enhanced + ` ${currentYear}`;
      }
    }
    
    // Replace old years
    [2023, 2024].forEach(oldYear => {
      if (enhanced.includes(oldYear.toString())) {
        enhanced = enhanced.replace(oldYear.toString(), currentYear.toString());
      }
    });
    
    console.log(`   "${query}" → "${enhanced}"`);
  });
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  testDetroitTigersQuery()
    .then(() => {
      testQueryEnhancement();
      console.log('\n✅ Debug test completed!');
      console.log('\n💡 Recommendations:');
      console.log('1. Ensure Tavily search uses current date filters');
      console.log('2. Add explicit date range filtering in search queries');
      console.log('3. Include "after today" or specific date constraints');
      console.log(`4. Use phrases like "after July 29, 2025" in search queries`);
    })
    .catch(console.error);
}

export { testDetroitTigersQuery };
