import dotenv from 'dotenv';
dotenv.config();

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function run() {
  console.log('⚡ Loading Search Engine & Grounding Registry...');
  
  const providers = Array.from(SearchEngineRegistry.providers.values());
  const totalCount = providers.length;
  
  // Group by category
  const categories = {};
  providers.forEach(p => {
    const cat = p.category || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  });
  
  console.log('\n==================================================');
  console.log(`📡 TOTAL INTEGRATED GROUNDING PROVIDERS: ${totalCount}`);
  console.log('==================================================');
  
  Object.keys(categories).sort().forEach(cat => {
    const list = categories[cat];
    console.log(`\n📂 Category: ${cat} (${list.length} active channels)`);
    // Print first 15 provider IDs/names in this category as examples
    const examples = list.slice(0, 15).map(p => `  • ${p.id} (${p.citationLabel || 'no label'})`);
    console.log(examples.join('\n'));
    if (list.length > 15) {
      console.log(`  • ... and ${list.length - 15} more channels`);
    }
  });
  
  console.log('\n==================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('Failed to run provider lister:', err);
  process.exit(1);
});
