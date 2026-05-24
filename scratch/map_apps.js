import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(BACKEND_DIR, '../Alti.Assistant.Frontend');

const toolkitsPath = path.join(BACKEND_DIR, 'src/app/modules/composio_simple/toolkits.json');
const allAppsPath = path.join(FRONTEND_DIR, 'src/lib/all-apps.ts');

console.log('Reading files...');
console.log('toolkitsPath:', toolkitsPath);
console.log('allAppsPath:', allAppsPath);

if (!fs.existsSync(toolkitsPath)) {
  console.error('toolkits.json not found!');
  process.exit(1);
}

if (!fs.existsSync(allAppsPath)) {
  console.error('all-apps.ts not found!');
  process.exit(1);
}

const toolkits = JSON.parse(fs.readFileSync(toolkitsPath, 'utf8'));
const allAppsContent = fs.readFileSync(allAppsPath, 'utf8');

// Known direct mappings
const manualMapping = {
  "Google Drive": "googledrive",
  "One drive": "one_drive",
  "Google Sheets": "googlesheets",
  "Google Docs": "googledocs",
  "Google Slides": "googleslides",
  "Google Meet": "googlemeet",
  "Google Photos": "googlephotos",
  "Google BigQuery": "googlebigquery",
  "Google Admin": "google_admin",
  "Google Maps": "google_maps",
  "Microsoft Teams": "microsoft_teams",
  "Microsoft Clarity": "microsoft_clarity",
  "noCRM.io": "nocrm_io",
  "ActiveCampaign": "active_campaign",
  "survey_monkey": "survey_monkey",
  "Discord Bot": "discordbot",
  "Slack Bot": "slackbot",
  "Perplexity AI": "perplexityai",
  "Daily Bot": "dailybot",
  "ASIN Data API": "asin_data_api",
  "BaseLinker": "baselinker",
  "Cloud Cart": "cloudcart",
  "Lemon Squeezy": "lemon_squeezy",
  "Dropbox Sign": "dropbox_sign",
  "Semantic Scholar": "semanticscholar",
  "Dynamics365": "dynamics365",
  "Zoho Bigin": "zoho_bigin",
  "Zoho Invoice": "zoho_invoice",
  "Zoho Books": "zoho_books",
  "Zoho Inventory": "zoho_inventory",
  "Zoho Desk": "zoho_desk",
  "Zoho Mail": "zoho_mail",
  "Capsule CRM": "capsule_crm",
  "JobNimbus": "jobnimbus",
  "Salesmate": "salesmate",
  "SerpApi": "serpapi",
  "Firecrawl": "firecrawl",
  "Tavily": "tavily",
  "Exa": "exa",
  "Snowflake": "snowflake",
  "PeopleDataLabs": "peopledatalabs",
  "PostHog": "posthog",
  "Fireflies": "fireflies",
  "Mixpanel": "mixpanel",
  "Amplitude": "amplitude",
  "Servicenow": "servicenow",
  "BrowseAI": "browseai",
  "Placekey": "placekey",
  "Kibana": "kibana",
  "Jira": "jira",
  "Pushbullet": "pushbullet",
  "D2L Brightspace": "d2lbrightspace",
  "Canva": "canva",
  "Webflow": "webflow",
  "Ahrefs": "ahrefs",
  "SendGrid": "sendgrid",
  "Facebook": "facebook",
  "CrustData": "crustdata",
  "Brandfetch": "brandfetch",
  "AMCards": "amcards",
  "Cal": "cal",
  "Apaleo": "apaleo",
  "Shopify": "shopify",
  "Jungle Scout": "junglescout",
  "You Search": "yousearch",
  "Linkup": "linkup",
  "More Trees": "more_trees",
  "Tiny URL": "tinyurl",
  "Foursquare": "foursquare",
  "Stripe": "stripe",
  "RecallAI": "recallai",
  "Brex": "brex",
  "Quickbooks": "quickbooks",
  "Ramp": "ramp",
  "Borneo": "borneo",
  "Heygen": "heygen",
  "Coinbase": "coinbase",
  "Coinranking": "coinranking",
  "Bannerbear": "bannerbear",
  "Process Street": "process_street",
  "Workiom": "workiom",
  "Formsite": "formsite",
  "ServiceM8": "servicem8",
  "Calendar Hero": "calendarhero",
  "EchtPost": "echtpost",
  "Bolna": "bolna",
  "RetellAI": "retellai",
  "Dialpad": "dialpad",
  "Chatwork": "chatwork",
  "Daily Bot": "dailybot",
  "Sentry": "sentry",
  "Neon": "neon",
  "ZenRows": "zenrows",
  "Ably": "ably",
  "Ngrok": "ngrok",
  "Baserow": "baserow",
  "Datadog": "datadog",
  "Zoom": "zoom",
  "Trello": "trello"
};

// We will transform the all-apps.ts file by using a JS evaluation/modifying script
// First let's load the file in a sandbox/eval environment to manipulate the actual array.
// To do this, we can replace the TypeScript type annotations and exports with node module exports
let tempJs = allAppsContent
  .replace(/export type APP =[\s\S]*?};/, '')
  .replace('export const allApps: APP[] =', 'const allApps =')
  .replace('export const toolsNeedsToAdd =', 'const toolsNeedsToAdd =');

tempJs += '\nmodule.exports = { allApps, toolsNeedsToAdd };';

// Write temp file and require it
const tempFilePath = path.join(__dirname, 'temp_all_apps.cjs');
fs.writeFileSync(tempFilePath, tempJs, 'utf8');

const { allApps, toolsNeedsToAdd } = await import('./temp_all_apps.cjs');

console.log(`Successfully imported ${allApps.length} apps from all-apps.ts.`);

let activatedCount = 0;
let alreadyActiveCount = 0;
let missedCount = 0;

const updatedApps = allApps.map(app => {
  const title = app.title;
  let slug = app.app_name;

  // If already has a valid app_name, keep it (unless empty)
  if (slug && toolkits[slug]) {
    app.isAvailable = true;
    alreadyActiveCount++;
    return app;
  }

  // Check manual mapping
  if (manualMapping[title]) {
    const mappedSlug = manualMapping[title];
    if (toolkits[mappedSlug]) {
      app.app_name = mappedSlug;
      app.isAvailable = true;
      activatedCount++;
      return app;
    }
  }

  // Try case-insensitive normalization match
  const normTitle = title.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (toolkits[normTitle]) {
    app.app_name = normTitle;
    app.isAvailable = true;
    activatedCount++;
    return app;
  }

  // Check keys in toolkits to see if we can find a substring match
  const matchedKey = Object.keys(toolkits).find(key => {
    const cleanKey = key.replace(/[^a-z0-9_]/g, '');
    return cleanKey === normTitle || cleanKey.includes(normTitle) || normTitle.includes(cleanKey);
  });

  if (matchedKey) {
    app.app_name = matchedKey;
    app.isAvailable = true;
    activatedCount++;
    return app;
  }

  // If we still can't match it, let's keep it but output warning
  console.log(`⚠️ Unmatched app: "${title}" (current app_name: "${slug}")`);
  missedCount++;
  return app;
});

console.log('\n--- Ingestion Statistics ---');
console.log('Already Active:', alreadyActiveCount);
console.log('Newly Activated:', activatedCount);
console.log('Unmatched / Missed:', missedCount);

// Reconstruct the new all-apps.ts file
let newContent = `export type APP = {
  title: string;
  description: string;
  image: string;
  app_name: string;
  isAvailable: boolean;
};

export const allApps: APP[] = ${JSON.stringify(updatedApps, null, 2)};

export const toolsNeedsToAdd = ${JSON.stringify(toolsNeedsToAdd, null, 2)};
`;

// Clean up temp cjs file
fs.unlinkSync(tempFilePath);

// Write back to all-apps.ts
fs.writeFileSync(allAppsPath, newContent, 'utf8');
console.log('✅ Successfully wrote updated all-apps.ts file!');
