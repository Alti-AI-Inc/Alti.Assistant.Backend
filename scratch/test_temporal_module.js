import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { TemporalCatalogService } from '../src/app/modules/temporal/temporal-catalog.service.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/alti-assistant';

async function test() {
  console.log("=== Testing Temporal Backend Integration ===");
  console.log(`Connecting to MongoDB at: ${MONGO_URI}`);
  
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB successfully.");
    
    console.log("Running manual catalog sync from scan_results.json...");
    const syncRes = await TemporalCatalogService.syncCatalog();
    console.log("Sync Response:", syncRes);
    
    if (syncRes.success) {
      console.log("Retrieving compiled stats from database...");
      const statsRes = await TemporalCatalogService.getStats();
      console.log("Aggregation Statistics:", JSON.stringify(statsRes.stats, null, 2));
      
      console.log("Running a search query for 'go sdk'...");
      const searchRes = await TemporalCatalogService.searchCatalog('go sdk', { limit: 5 });
      console.log(`Search Results (Found ${searchRes.total}):`);
      for (const r of searchRes.results) {
        printRepo(r);
      }
    }
  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    console.log("=== Test Complete ===");
  }
}

function printRepo(r) {
  console.log(`- ${r.name} (${r.license}) Stars: ${r.stars} | Local Path: ${r.local_path}`);
}

test();
