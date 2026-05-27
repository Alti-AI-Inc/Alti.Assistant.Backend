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

// Parse all-apps.ts to get all app objects
// We want to extract the full app objects from the javascript array
// Since the format is JSON-like, let's load it dynamically by wrapping it
// in module.exports and importing it.
const tempJs = allAppsContent
  .replace(/export type APP =[\s\S]*?};/, '')
  .replace('export const allApps: APP[] =', 'const allApps =')
  .replace('export const toolsNeedsToAdd =', 'const toolsNeedsToAdd =')
  + '\nmodule.exports = { allApps };';

const tempFilePath = path.join(__dirname, 'temp_check_forward.cjs');
fs.writeFileSync(tempFilePath, tempJs, 'utf8');

const { allApps } = await import('./temp_check_forward.cjs');
fs.unlinkSync(tempFilePath);

console.log(`Loaded ${allApps.length} apps from all-apps.ts.`);

const missingFromBackend = [];

for (const app of allApps) {
  const slug = app.app_name;
  if (!slug) {
    missingFromBackend.push({ title: app.title, slug: '(no slug)' });
    continue;
  }
  
  if (!toolkits[slug]) {
    missingFromBackend.push({ title: app.title, slug });
  }
}

console.log(`\nFound ${missingFromBackend.length} frontend apps that are NOT supported in backend toolkits.json!`);
console.log('Here is the full list of missing backend toolkits:');
missingFromBackend.forEach((app, idx) => {
  console.log(`[${idx + 1}] Title: "${app.title}" | app_name: "${app.slug}"`);
});
