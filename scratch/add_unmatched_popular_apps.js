import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(BACKEND_DIR, '../Alti.Assistant.Frontend');

const toolkitsPath = path.join(BACKEND_DIR, 'src/app/modules/composio_simple/toolkits.json');
const allAppsPath = path.join(FRONTEND_DIR, 'src/lib/all-apps.ts');

const toolkits = JSON.parse(fs.readFileSync(toolkitsPath, 'utf8'));
const allAppsContent = fs.readFileSync(allAppsPath, 'utf8');

// Load temp module to parse all-apps.ts
const tempJs = allAppsContent
  .replace(/export type APP =[\s\S]*?};/, '')
  .replace('export const allApps: APP[] =', 'const allApps =')
  .replace('export const toolsNeedsToAdd =', 'const toolsNeedsToAdd =')
  + '\nmodule.exports = { allApps };';

const tempFilePath = path.join(__dirname, 'temp_add_apps.cjs');
fs.writeFileSync(tempFilePath, tempJs, 'utf8');

const { allApps } = await import('./temp_add_apps.cjs');
fs.unlinkSync(tempFilePath);

console.log(`Loaded ${allApps.length} apps from all-apps.ts.`);

let addedCount = 0;
for (const app of allApps) {
  const slug = app.app_name;
  if (!slug) continue;
  
  if (!toolkits[slug]) {
    toolkits[slug] = 'latest';
    addedCount++;
    console.log(`Adding missing backend toolkit mapping: "${app.title}" -> "${slug}"`);
  }
}

if (addedCount > 0) {
  // Sort the keys of toolkits alphabetically for maintainability
  const sortedToolkits = {};
  Object.keys(toolkits)
    .sort((a, b) => a.localeCompare(b))
    .forEach(key => {
      sortedToolkits[key] = toolkits[key];
    });

  fs.writeFileSync(toolkitsPath, JSON.stringify(sortedToolkits, null, 2), 'utf8');
  console.log(`\nSuccessfully added ${addedCount} missing custom app toolkits to toolkits.json!`);
} else {
  console.log('\nNo missing custom app toolkits found.');
}
