import dotenv from 'dotenv';
dotenv.config();

import { SearchEngineRegistry } from '../src/app/helpers/SearchEngineRegistry.js';
import { UnifiedSmartRouter } from '../src/app/helpers/UnifiedSmartRouter.js';
import { RedisClient } from '../src/shared/redis.js';

async function testRegistry() {
  console.log('🚀 Bootstrapping Alti Search Registry & UnifiedSmartRouter Verification...');

  // 1. Verify registered providers
  console.log('\n📊 Registered Providers:');
  console.log(`Total: ${SearchEngineRegistry.providers.size}`);
  
  const categories = {};
  for (const [id, provider] of SearchEngineRegistry.providers.entries()) {
    categories[provider.category] = (categories[provider.category] || 0) + 1;
    console.log(`  - [ID: ${id}] Category: ${provider.category}`);
  }
  console.log('\nCategory breakdown:', categories);

  // 2. Perform test enhancements
  console.log('\n🧪 Testing Dynamic Grounding Context Enhancement:');
  const testQueries = [
    'courtlistener lookup for Silicon Valley Bank litigation dockets',
    'fda drug safety warnings and recalls for Tylenol',
    'Lakers vs Celtics live betting odds expert picks',
    '123 Main St Miami property details valuation',
    'cisa kev exploit catalog for CVE-2024-3094 vulnerability details'
  ];

  for (const query of testQueries) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Query: "${query}"`);
    const enhanced = await UnifiedSmartRouter.combinedRouteAndEnhancePrompt(query);
    
    // Check if grounding was appended
    if (enhanced.includes('⚡ GROUNDED DATA SOURCE')) {
      console.log('✅ Grounded RAG Data successfully injected!');
      
      // Look for the JSON metadata block
      const jsonMatch = enhanced.match(/<!-- JSON_METADATA: ({.*}) -->/);
      if (jsonMatch) {
        console.log('✅ JSON Metadata Envelope found:');
        console.log(JSON.stringify(JSON.parse(jsonMatch[1]), null, 2));
      } else {
        console.warn('⚠️ No JSON Metadata block found.');
      }
    } else {
      console.error('❌ Failed: Grounding data missing from prompt.');
    }
  }

  // 3. Graceful exit
  console.log('\n🟢 Search Registry & UnifiedSmartRouter Verification Complete!');
  
  try {
    if (RedisClient && typeof RedisClient.disconnect === 'function') {
      await RedisClient.disconnect();
    } else if (RedisClient && typeof RedisClient.quit === 'function') {
      await RedisClient.quit();
    }
  } catch (err) {}
  
  process.exit(0);
}

testRegistry().catch(err => {
  console.error('❌ Verification script failed:', err);
  process.exit(1);
});
