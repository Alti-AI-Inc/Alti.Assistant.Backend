import { DatasetsService } from './src/app/modules/datasets/datasets.service.js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function runTests() {
  console.log('==================================================');
  console.log('🚀 RUNNING HUGGING FACE DATASETS INTEGRATION TESTS');
  console.log('==================================================\n');

  try {
    // Test 1: Search datasets on the Hub
    console.log('🔍 Test 1: Searching for "squad" on Hugging Face Hub...');
    const searchResults = await DatasetsService.searchHFDatasets('squad', 3);
    console.log(`✅ Success! Found ${searchResults.length} datasets matching "squad".`);
    searchResults.forEach((res, i) => {
      console.log(`   [${i + 1}] ID: ${res.datasetId}`);
      console.log(`       Downloads: ${res.downloads} | Likes: ${res.likes}`);
      console.log(`       Tags: ${res.tags.slice(0, 5).join(', ')}`);
    });
    console.log('');

    // Test 2: Fetch detailed metadata, configs, and splits of a dataset
    console.log('📊 Test 2: Fetching details and splits for "squad"...');
    const info = await DatasetsService.getHFDatasetInfo('squad');
    console.log('✅ Success! Loaded metadata.');
    console.log(`   Name: ${info.name}`);
    console.log(`   Author: ${info.author}`);
    console.log(`   Available Configurations: ${info.configs.slice(0, 5).join(', ')}`);
    console.log(`   Splits (first config):`, info.splits[info.configs[0]] || 'None');
    console.log('');

    // Test 3: Preview rows of a dataset configuration/split
    console.log('👁️ Test 3: Fetching row preview of "squad" (plain_text config, train split)...');
    const preview = await DatasetsService.getHFDatasetRows('squad', 'plain_text', 'train', 0, 3);
    console.log('✅ Success! Loaded row preview.');
    console.log(`   Features/Columns:`, preview.features.map(f => f.name).join(', '));
    console.log(`   Sample Row 1:`, JSON.stringify(preview.rows[0]?.row || {}));
    console.log('');

    console.log('==================================================');
    console.log('🎉 ALL HUGGING FACE API TESTS PASSED SUCCESSFULLY!');
    console.log('==================================================');
    process.exit(0);

  } catch (error) {
    console.error('❌ Integration Test Failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runTests();
