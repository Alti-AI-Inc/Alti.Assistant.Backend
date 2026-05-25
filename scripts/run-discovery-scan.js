import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';
import config from '../config/index.js';

try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (err) {}

dotenv.config();

const { DatasetsCrawlerService } = await import('../src/app/modules/datasets/datasetsCrawler.service.js');
const DatasetQueue = (await import('../src/app/modules/datasets/datasetQueue.model.js')).default;

const uri = process.env.DATABASE_LOCAL || 'mongodb+srv://ason-db-username:6TKXGrFEjBWWqcHU@cluster0.piwgo1l.mongodb.net/ASON?retryWrites=true&w=majority';

async function run() {
  console.log('\n======================================================================');
  console.log('🔍 HUGGING FACE APPROVED DATASETS DISCOVERY UTILITY');
  console.log('======================================================================');
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(uri, { family: 4 });
    console.log('✅ Connected successfully to database.');

    const initialPendingCount = await DatasetQueue.countDocuments({ status: 'pending' });
    console.log(`📊 Current pending datasets in queue: ${initialPendingCount}`);

    console.log('\n⚡ Scanning Hugging Face Hub for commercially clean (MIT or Apache 2.0) datasets...');
    const scanLimit = 1500; // Deep scan target
    const result = await DatasetsCrawlerService.scanHuggingFaceHub(scanLimit);

    console.log('\n======================================================================');
    console.log('🎉 DISCOVERY DISPATCH SUMMARY');
    console.log('======================================================================');
    console.log(`  - Total Datasets Scanned  : ${scanLimit}`);
    console.log(`  - Newly Discovered & Saved: ${result.stats.discovered} datasets`);
    console.log(`  - Newly Queued (MIT/Apache): ${result.stats.queued} datasets`);
    console.log(`  - Skipped (Gated/Private) : ${result.stats.skippedGated} datasets`);
    console.log(`  - Skipped (Unsupported Lic): ${result.stats.skippedLicense} datasets`);
    console.log(`  - Skipped (Exceeded Size)  : ${result.stats.skippedSize} datasets`);
    console.log('======================================================================');

    const finalPendingCount = await DatasetQueue.countDocuments({ status: 'pending' });
    console.log(`📈 New total pending datasets in queue: ${finalPendingCount} (+${finalPendingCount - initialPendingCount} added)`);
    console.log('======================================================================\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Discovery Scan Failure:', error.message);
    try {
      await mongoose.connection.close();
    } catch (e) {}
    process.exit(1);
  }
}

run();
