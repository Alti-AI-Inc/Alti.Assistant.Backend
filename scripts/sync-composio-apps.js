import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(BACKEND_DIR, '../Alti.Assistant.Frontend');

const toolkitsPath = path.join(BACKEND_DIR, 'src/app/modules/composio_simple/toolkits.json');
const availableAppsPath = path.join(BACKEND_DIR, 'src/app/modules/composio_simple/available_apps.json');
const allAppsPath = path.join(FRONTEND_DIR, 'src/lib/all-apps.ts');

console.log('Starting sync orchestration...');
console.log('toolkitsPath:', toolkitsPath);
console.log('availableAppsPath:', availableAppsPath);
console.log('allAppsPath:', allAppsPath);

if (!fs.existsSync(toolkitsPath)) {
  console.error('❌ toolkits.json not found!');
  process.exit(1);
}

if (!fs.existsSync(availableAppsPath)) {
  console.error('❌ available_apps.json not found!');
  process.exit(1);
}

if (!fs.existsSync(allAppsPath)) {
  console.error('❌ all-apps.ts not found!');
  process.exit(1);
}

const abbreviations = {
  'api': 'API',
  'crm': 'CRM',
  'ai': 'AI',
  'cms': 'CMS',
  'seo': 'SEO',
  'ci': 'CI',
  'cd': 'CD',
  'gcp': 'GCP',
  'pdf': 'PDF',
  'sms': 'SMS',
  'url': 'URL',
  'ip': 'IP',
  'qa': 'QA',
  'iot': 'IoT',
  'hr': 'HR',
  'db': 'DB',
  'webex': 'Webex',
  'zoom': 'Zoom',
  'stripe': 'Stripe',
  'trello': 'Trello',
  'jira': 'Jira',
  'github': 'GitHub',
  'gitlab': 'GitLab',
  'nocrm': 'noCRM',
  'posthog': 'PostHog',
  'activecampaign': 'ActiveCampaign',
  'dynamics365': 'Dynamics365',
  'peopledatalabs': 'PeopleDataLabs',
  'quickbooks': 'QuickBooks',
  'heygen': 'HeyGen',
  'coinranking': 'Coinranking',
  'bannerbear': 'Bannerbear',
  'formsite': 'Formsite',
  'servicem8': 'ServiceM8',
  'calendarhero': 'CalendarHero',
  'echtpost': 'EchtPost',
  'retellai': 'RetellAI',
  'chatwork': 'Chatwork',
  'dailybot': 'DailyBot',
  'zenrows': 'ZenRows',
  'baserow': 'BaseRow',
  'datadog': 'Datadog'
};

function formatTitle(slug) {
  if (slug === 'discordbot') return 'Discord Bot';
  if (slug === 'slackbot') return 'Slack Bot';
  if (slug === 'googlecalendar') return 'Google Calendar';
  if (slug === 'googledocs') return 'Google Docs';
  if (slug === 'googledrive') return 'Google Drive';
  if (slug === 'googlesheets') return 'Google Sheets';
  if (slug === 'googletasks') return 'Google Tasks';
  if (slug === 'googlemeet') return 'Google Meet';
  if (slug === 'googlephotos') return 'Google Photos';
  if (slug === 'googlebigquery') return 'Google BigQuery';
  if (slug === 'googleslides') return 'Google Slides';
  if (slug === 'googleads') return 'Google Ads';
  if (slug === 'google_maps') return 'Google Maps';
  if (slug === 'google_admin') return 'Google Admin';
  if (slug === 'google_analytics') return 'Google Analytics';
  if (slug === 'microsoft_teams') return 'Microsoft Teams';
  if (slug === 'microsoft_clarity') return 'Microsoft Clarity';
  if (slug === 'one_drive') return 'OneDrive';
  if (slug === 'share_point') return 'SharePoint';

  return slug
    .split(/_|-/)
    .map(word => {
      const lowerWord = word.toLowerCase();
      if (abbreviations[lowerWord]) return abbreviations[lowerWord];
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function generateDescription(title) {
  return `Integrate ${title} to seamlessly execute automated workflows, synchronize data, and orchestrate ${title} actions directly within Alti.`;
}

// 1. Process available_apps.json
const toolkits = JSON.parse(fs.readFileSync(toolkitsPath, 'utf8'));
const slugs = Object.keys(toolkits);
const uniqueSlugsSet = new Set(slugs);

// Deduplicate customerio / customer_io (prefer customer_io)
if (uniqueSlugsSet.has('customerio') && uniqueSlugsSet.has('customer_io')) {
  uniqueSlugsSet.delete('customerio');
}

const sortedSlugs = Array.from(uniqueSlugsSet).sort((a, b) => a.localeCompare(b));
console.log(`Deduplicated unique app count: ${sortedSlugs.length}`);

// Write backend available_apps.json
fs.writeFileSync(availableAppsPath, JSON.stringify(sortedSlugs, null, 2), 'utf8');
console.log('✅ Synchronized backend available_apps.json successfully!');

// 2. Process frontend all-apps.ts
const allAppsContent = fs.readFileSync(allAppsPath, 'utf8');

// Load TS file in Node
let tempJs = allAppsContent
  .replace(/export type APP =[\s\S]*?};/, '')
  .replace('export const allApps: APP[] =', 'const allApps =')
  .replace('export const toolsNeedsToAdd =', 'const toolsNeedsToAdd =');

tempJs += '\nmodule.exports = { allApps, toolsNeedsToAdd };';

const tempFilePath = path.join(__dirname, 'temp_all_apps.cjs');
fs.writeFileSync(tempFilePath, tempJs, 'utf8');

const { allApps, toolsNeedsToAdd } = await import('./temp_all_apps.cjs');
fs.unlinkSync(tempFilePath); // delete temp file immediately

console.log(`Loaded ${allApps.length} apps from all-apps.ts`);

// Map and activate
const existingAppsMap = new Map();
allApps.forEach(app => {
  // If app has an existing valid slug, match by that first, otherwise match by title
  const matchSlug = app.app_name || app.title.toLowerCase().replace(/[^a-z0-9]/g, '');
  existingAppsMap.set(matchSlug, app);
});

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

const updatedApps = [];
const processedSlugs = new Set();

// 1. First, process all existing frontend apps, mapping and activating them
allApps.forEach(app => {
  const title = app.title;
  let slug = app.app_name;

  // Attempt to resolve slug
  if (!slug || slug === '') {
    if (manualMapping[title]) {
      slug = manualMapping[title];
    } else {
      const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (uniqueSlugsSet.has(normTitle)) {
        slug = normTitle;
      } else {
        // Find substring match
        const found = sortedSlugs.find(s => s.toLowerCase().replace(/[^a-z0-9]/g, '') === normTitle);
        if (found) slug = found;
      }
    }
  }

  if (slug && uniqueSlugsSet.has(slug)) {
    app.app_name = slug;
    app.isAvailable = true;
    processedSlugs.add(slug);
    
    // Resolve app icon: Fallback to official Composio CDN if local file is missing
    if (app.image && app.image.startsWith('/assets/apps-logos/')) {
      const imgFileName = app.image.replace('/assets/apps-logos/', '');
      const localPath = path.join(FRONTEND_DIR, 'public/assets/apps-logos', imgFileName);
      if (!fs.existsSync(localPath)) {
        app.image = `https://logos.composio.dev/api/${slug}`;
      }
    } else if (!app.image || app.image === '') {
      app.image = `https://logos.composio.dev/api/${slug}`;
    }
  } else {
    // Keep as disabled if not a valid Composio slug
    app.isAvailable = false;
  }
  
  updatedApps.push(app);
});

// 2. Now, add any missing Composio apps as brand new activated entries
sortedSlugs.forEach(slug => {
  if (processedSlugs.has(slug)) return; // already added

  const title = formatTitle(slug);
  const description = generateDescription(title);
  
  updatedApps.push({
    title,
    description,
    image: `https://logos.composio.dev/api/${slug}`, // 100% accurate official CDN URL
    app_name: slug,
    isAvailable: true
  });
  
  processedSlugs.add(slug);
});

// Rewrite all-apps.ts
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

fs.writeFileSync(allAppsPath, newContent, 'utf8');
console.log(`✅ Successfully updated all-apps.ts with all ${updatedApps.length} integrations!`);
console.log('Sync process completed successfully!');
