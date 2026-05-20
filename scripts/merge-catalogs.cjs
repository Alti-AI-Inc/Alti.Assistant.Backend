const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../output');
const GCP_PATH = path.join(OUTPUT_DIR, 'gcp-license-catalog.json');
const GOOGLE_PATH = path.join(OUTPUT_DIR, 'google-license-catalog.json');

function merge() {
  if (!fs.existsSync(GCP_PATH)) {
    console.error(`GCP Catalog not found!`);
    process.exit(1);
  }
  if (!fs.existsSync(GOOGLE_PATH)) {
    console.error(`Google Catalog not found!`);
    process.exit(1);
  }
  
  const gcpCatalog = JSON.parse(fs.readFileSync(GCP_PATH, 'utf8'));
  const googleCatalog = JSON.parse(fs.readFileSync(GOOGLE_PATH, 'utf8'));
  
  console.log(`Original GCP Catalog size: ${gcpCatalog.length}`);
  console.log(`New Google Catalog size: ${googleCatalog.length}`);
  
  // Tag each with their org
  const taggedGcp = gcpCatalog.map(repo => ({
    ...repo,
    org: 'GoogleCloudPlatform',
    // Make sure html_url points to correct URL if not set
    domain: 'github.com/GoogleCloudPlatform'
  }));
  
  const taggedGoogle = googleCatalog.map(repo => ({
    ...repo,
    org: 'google',
    domain: 'github.com/google'
  }));
  
  // Combine lists
  const combined = [...taggedGcp, ...taggedGoogle];
  
  // Save combined catalog back to gcp-license-catalog.json so the grounding engine picks it up instantly
  fs.writeFileSync(GCP_PATH, JSON.stringify(combined, null, 2));
  console.log(`Merged catalog size: ${combined.length}`);
  console.log(`Merged catalog saved successfully to ${GCP_PATH}!`);
}

merge();
