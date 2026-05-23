// Set custom DNS resolvers to bypass connection errors in sandbox environments
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('Failed to set custom DNS servers:', e.message);
}

// Load environment variables from .env
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Define Schema locally since we're running as a standalone CommonJS script
const ComposioRepositorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      index: true
    },
    description: {
      type: String,
      default: ''
    },
    license: {
      type: String,
      required: true,
      enum: ['MIT', 'Apache 2.0'],
      index: true
    },
    html_url: {
      type: String,
      required: true
    },
    clone_url: {
      type: String,
      required: true
    },
    stars: {
      type: Number,
      default: 0
    },
    forks: {
      type: Number,
      default: 0
    },
    language: {
      type: String,
      default: 'Unknown',
      index: true
    },
    updated_at: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

ComposioRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TextIndex', language_override: 'none' }
);

const ComposioRepository = mongoose.models.ComposioRepository || mongoose.model('ComposioRepository', ComposioRepositorySchema);

const CATALOG_PATH = path.join(__dirname, '../output/composio-license-catalog.json');
const dbUri = process.env.DATABASE_LOCAL;

async function seed() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`\n[ERROR] Catalog file not found at: ${CATALOG_PATH}`);
    console.error(`Please run the scanner script first: node scripts/scan-composio-repos.cjs\n`);
    process.exit(1);
  }

  if (!dbUri) {
    console.error(`[ERROR] DATABASE_LOCAL is not defined in your environment variables (.env).`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`Connecting to MongoDB Database...`);
  await mongoose.connect(dbUri);
  console.log(`✓ Connected to Database successfully.`);
  console.log(`======================================================\n`);

  // Load Catalog
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] Failed to parse catalog JSON file:`, e.message);
    mongoose.connection.close();
    process.exit(1);
  }

  console.log(`Loaded ${catalog.length} vetted repositories from catalog JSON.`);
  console.log(`Clearing existing ComposioRepository documents...`);
  
  const deleteResult = await ComposioRepository.deleteMany({});
  console.log(`✓ Removed ${deleteResult.deletedCount} existing documents.`);

  console.log(`Dropping existing indexes to prevent stale indexing issues...`);
  await ComposioRepository.collection.dropIndexes().catch(() => {});
  console.log(`✓ Dropped stale indexes.`);

  console.log(`Seeding database with new vetted repositories...`);

  // Insert documents in bulk
  const insertResult = await ComposioRepository.insertMany(catalog);
  console.log(`✓ Successfully seeded ${insertResult.length} Composio repositories!`);

  console.log(`\n======================================================`);
  console.log(`SUCCESS! Seeding task completed.`);
  console.log(`======================================================\n`);

  mongoose.connection.close();
}

seed().catch(err => {
  console.error("Seeding failed:", err.message);
  mongoose.connection.close();
  process.exit(1);
});
