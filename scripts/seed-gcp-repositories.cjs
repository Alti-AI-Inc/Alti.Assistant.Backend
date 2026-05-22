// Load environment variables from .env
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const CATALOG_PATH = path.join(__dirname, '../output/gcp-license-catalog.json');
const dbLocal = process.env.DATABASE_LOCAL || 'mongodb://127.0.0.1:27017/Alti';

// Mongoose schema definition for seeder (ESM model cannot be directly imported in CJS node environment without Babel/register)
const GoogleRepositorySchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  org: { type: String, required: true, index: true },
  description: { type: String, default: '' },
  license: { type: String, required: true, index: true },
  html_url: { type: String, required: true },
  clone_url: { type: String, required: true },
  stars: { type: Number, default: 0 },
  forks: { type: Number, default: 0 },
  language: { type: String, default: 'Unknown', index: true },
  updated_at: { type: Date }
});

const GoogleRepository = mongoose.model('GoogleRepository', GoogleRepositorySchema);

async function seed() {
  console.log(`\n======================================================`);
  console.log(`Connecting to MongoDB...`);
  console.log(`======================================================`);
  
  try {
    await mongoose.connect(dbLocal, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      family: 4
    });
    console.log(`✅ Successfully connected to MongoDB!`);
    
    if (!fs.existsSync(CATALOG_PATH)) {
      console.error(`[ERROR] Catalog file not found at: ${CATALOG_PATH}`);
      process.exit(1);
    }
    
    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    console.log(`Loaded ${catalog.length} repositories from catalog JSON.`);
    
    console.log(`Preparing bulk write operations...`);
    const operations = catalog.map(repo => ({
      updateOne: {
        filter: { name: repo.name, org: repo.org || 'GoogleCloudPlatform' },
        update: {
          $set: {
            name: repo.name,
            org: repo.org || 'GoogleCloudPlatform',
            description: repo.description || 'No description provided.',
            license: repo.license || 'Apache 2.0',
            html_url: repo.html_url,
            clone_url: repo.clone_url,
            stars: repo.stars || 0,
            forks: repo.forks || 0,
            language: repo.language || 'Unknown',
            updated_at: repo.updated_at ? new Date(repo.updated_at) : null
          }
        },
        upsert: true
      }
    }));
    
    console.log(`Executing bulk operations to MongoDB...`);
    const result = await GoogleRepository.bulkWrite(operations);
    
    console.log(`\n======================================================`);
    console.log(`SUCCESS! Seeding completed.`);
    console.log(`- Matched: ${result.matchedCount}`);
    console.log(`- Modified: ${result.modifiedCount}`);
    console.log(`- Upserted: ${result.upsertedCount}`);
    console.log(`======================================================\n`);
    
  } catch (err) {
    console.error(`\n[ERROR] Seeding failed:`, err.message);
  } finally {
    await mongoose.connection.close();
    console.log(`MongoDB connection closed.`);
  }
}

seed();
