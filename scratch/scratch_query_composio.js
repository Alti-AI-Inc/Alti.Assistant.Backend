import { Composio } from '@composio/core';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY || process.env.COMPOSIO_ORG_API_KEY
});

async function run() {
  try {
    console.log('Composio authConfigs keys:', Object.keys(composio.authConfigs));
    if (composio.authConfigs.list) {
      console.log('Calling composio.authConfigs.list()...');
      const configs = await composio.authConfigs.list();
      console.log(`Found ${configs.length} auth configs!`);
      if (configs.length > 0) {
        console.log('Sample auth config:', JSON.stringify(configs[0], null, 2));
      }
    }
  } catch (err) {
    console.error('Error querying authConfigs:', err.message);
  }
}

run();
