import { OpenAIToolSet } from 'composio-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import config directly to get API key
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.COMPOSIO_ORG_API_KEY || process.env.COMPOSIO_API_KEY || process.env.COMPOSIO_SECRET_KEY;
console.log('Using API Key:', apiKey ? 'FOUND' : 'MISSING');

const toolset = new OpenAIToolSet({ apiKey });

async function checkApps() {
  try {
    const list = await toolset.integrations.list();
    console.log('Total apps on Composio integrations list:', list.items ? list.items.length : list.length);
    const items = list.items || list;
    const slugs = items.map(app => app.name || app.slug || app.id);
    console.log('Sample slugs:', slugs.slice(0, 10));
    
    fs.writeFileSync(path.join(__dirname, 'composio_slugs.json'), JSON.stringify(slugs, null, 2));
    console.log('Saved all slugs to composio_slugs.json');
  } catch (error) {
    console.error('Error:', error);
  }
}

checkApps();
