import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';

// Resolve Node/MongoDB DNS challenges
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (err) {}

// Load environment variables
dotenv.config();

const { DatasetsCrawlerService } = await import('../src/app/modules/datasets/datasetsCrawler.service.js');
const DatasetQueue = (await import('../src/app/modules/datasets/datasetQueue.model.js')).default;
const Dataset = (await import('../src/app/modules/datasets/datasets.model.js')).default;

const uri = process.env.DATABASE_LOCAL || 'mongodb+srv://ason-db-username:6TKXGrFEjBWWqcHU@cluster0.piwgo1l.mongodb.net/ASON?retryWrites=true&w=majority';

// Graceful shutdown state
let keepRunning = true;

async function runDaemon() {
  console.log('\n======================================================================');
  console.log('🌙 ALTI PERPLEXITY KILLER - AUTONOMOUS INGESTION & INDEXING DAEMON');
  console.log('======================================================================');
  console.log(`Start Time: ${new Date().toLocaleString()}`);
  console.log(`Legal Purity Policy: strictly MIT and Apache 2.0 licenses only`);
  console.log('======================================================================\n');

  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(uri, { family: 4 });
    console.log('✅ Connected successfully to database.');

    // 1. Initial Scan to ensure queue is fresh
    console.log('\n🔍 Running initial Hugging Face Hub discovery scan...');
    const scanResult = await DatasetsCrawlerService.scanHuggingFaceHub(200);
    console.log('✅ Discovery scan complete.');
    console.log('📊 Initial Scan Stats:', scanResult.stats);

    // 2. Start sequential background worker
    console.log('\n⚡ Dispatching sequential queue downloader worker...');
    const startResult = DatasetsCrawlerService.startWorker();
    console.log('⚙️  Worker Daemon Status:', startResult.message);

    console.log('\n🟢 Daemon fully initialized. Continuous monitoring active (logging every 30 seconds).');
    console.log('   Press Ctrl+C to shut down gracefully.');

    // Setup graceful signal listeners
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down daemon gracefully...`);
      keepRunning = false;
      
      console.log('⏳ Stopping sequential worker loop...');
      DatasetsCrawlerService.stopWorker();
      
      console.log('🔌 Closing database connections...');
      await mongoose.connection.close();
      
      console.log('👋 Daemon shut down successfully. Goodbye!\n');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // 3. Keep-alive monitor loop
    while (keepRunning) {
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      if (!keepRunning) break;

      const stats = await DatasetsCrawlerService.getCrawlerStats();
      
      // Pull catalog metrics
      const pendingQueue = await DatasetQueue.countDocuments({ status: 'pending' });
      const completedQueue = await DatasetQueue.countDocuments({ status: 'completed' });
      const failedQueue = await DatasetQueue.countDocuments({ status: 'failed' });
      
      const archivedDatasets = await Dataset.countDocuments({ status: 'archived' });
      const indexedDatasets = await Dataset.countDocuments({ status: 'indexed' });
      const activeIndexing = await Dataset.countDocuments({ status: 'indexing' });

      console.log(`\n======================================================`);
      console.log(`📊 [${new Date().toLocaleTimeString()}] Autonomous Ingestion Metrics:`);
      console.log(`======================================================`);
      console.log(`   - Queue Worker State : ${stats.isWorkerRunning ? '🟢 Active & Running' : '🔴 Paused'}`);
      console.log(`   - Pending Queue Size : ${pendingQueue} datasets`);
      console.log(`   - Completed Archival : ${completedQueue} datasets`);
      console.log(`   - Failed Ingestion   : ${failedQueue} datasets`);
      console.log(`   - Archived (On GCS)  : ${archivedDatasets} datasets`);
      console.log(`   - Active Indexing    : ${activeIndexing} datasets`);
      console.log(`   - Indexed (pgvector) : ${indexedDatasets} datasets`);
      console.log(`   - Total Data Size    : ${(stats.totalBytesDownloaded / (1024 * 1024)).toFixed(2)} MB`);

      const activeDownloading = await DatasetQueue.find({ status: 'downloading' });
      if (activeDownloading.length > 0) {
        console.log(`   - Active Download:`);
        activeDownloading.forEach(d => {
          console.log(`     • ${d.datasetId} (Downloads: ${d.downloads})`);
        });
      }

      const activeIndexingDocs = await Dataset.find({ status: 'indexing' });
      if (activeIndexingDocs.length > 0) {
        console.log(`   - Active Indexing:`);
        activeIndexingDocs.forEach(d => {
          console.log(`     • ${d.datasetId}`);
        });
      }
      console.log(`======================================================`);
    }

  } catch (error) {
    console.error('\n❌ Daemon Execution Failure:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    try {
      await mongoose.connection.close();
    } catch (e) {}
    process.exit(1);
  }
}

runDaemon();
