import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';

try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (err) {}

dotenv.config();

const { default: DatasetQueue } = await import('./src/app/modules/datasets/datasetQueue.model.js');
const { default: Dataset } = await import('./src/app/modules/datasets/datasets.model.js');
const { rag } = await import('./src/app/modules/knowledge/knowledge.service.js');

const uri = process.env.DATABASE_LOCAL || 'mongodb+srv://ason-db-username:6TKXGrFEjBWWqcHU@cluster0.piwgo1l.mongodb.net/ASON?retryWrites=true&w=majority';

async function run() {
  try {
    await mongoose.connect(uri, { family: 4 });
    
    const qStats = await DatasetQueue.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    const dStats = await Dataset.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Query Postgres pgvector database
    await rag.initialize();
    const pool = rag.pool;
    let totalChunksResult = 0;
    if (pool) {
      const pgResult = await pool.query(`
        SELECT COUNT(*) as count 
        FROM document_chunks_vector 
        WHERE metadata->>'ownerType' = 'dataset'
      `);
      totalChunksResult = pgResult.rows[0]?.count || 0;
    }

    console.log('\n==================================================');
    console.log('📊 CURRENT ALTI DATASET CRAWLER & INDEXER STATUS');
    console.log('==================================================');
    console.log('Queue Status (DatasetQueue):');
    qStats.forEach(stat => {
      console.log(`  - ${stat._id}: ${stat.count} datasets`);
    });
    
    console.log('\nCatalog Status (Dataset):');
    dStats.forEach(stat => {
      console.log(`  - ${stat._id}: ${stat.count} datasets`);
    });

    console.log(`\nVector Index Status (document_chunks_vector in PG):`);
    console.log(`  - Total chunks indexed under datasets: ${totalChunksResult}`);
    console.log('==================================================\n');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Failed to retrieve statistics:', err.message);
    process.exit(1);
  }
}

run();
