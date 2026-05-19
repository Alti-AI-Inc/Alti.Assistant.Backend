const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CATALOG_PATH = path.join(__dirname, '../output/gcp-license-catalog.json');
const ROOT_DIR = path.join(__dirname, '../..'); // Root of Alti.Assistant monorepo

const repoName = process.argv[2];

if (!repoName) {
  console.log(`\nUsage: node scripts/gcp-import.cjs <repository-name>`);
  console.log(`Example: node scripts/gcp-import.cjs google-cloud-node\n`);
  process.exit(1);
}

if (!fs.existsSync(CATALOG_PATH)) {
  console.error(`\n[ERROR] Catalog file not found at: ${CATALOG_PATH}`);
  console.error(`Please run the scanner first: node scripts/scan-gcp-repos.cjs <YOUR_GITHUB_TOKEN>\n`);
  process.exit(1);
}

// Load Catalog
let catalog;
try {
  catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
} catch (e) {
  console.error(`[ERROR] Failed to parse catalog JSON file:`, e.message);
  process.exit(1);
}

// Find repository
const match = catalog.find(r => r.name.toLowerCase() === repoName.toLowerCase());

if (!match) {
  console.log(`\n[WARNING] Repository "${repoName}" not found in catalog.`);
  
  // Suggest closest matches
  const suggestions = catalog
    .filter(r => r.name.toLowerCase().includes(repoName.toLowerCase()))
    .slice(0, 10);
    
  if (suggestions.length > 0) {
    console.log(`\nDid you mean one of these?`);
    suggestions.forEach(s => {
      console.log(`  - ${s.name} (${s.license}) - ${s.stars} stars`);
    });
  }
  console.log();
  process.exit(1);
}

console.log(`\n======================================================`);
console.log(`Found Matching Repository: ${match.name}`);
console.log(`License: ${match.license}`);
console.log(`Clone URL: ${match.clone_url}`);
console.log(`======================================================\n`);

const submodulePath = `external/gcp/${match.name}`;
console.log(`Importing "${match.name}" as submodule under: ${submodulePath}...`);

try {
  // Ensure the external/gcp directory exists in root
  const gcpDir = path.join(ROOT_DIR, 'external/gcp');
  if (!fs.existsSync(gcpDir)) {
    fs.mkdirSync(gcpDir, { recursive: true });
  }

  // Run Git Submodule Add command at root level
  console.log(`Executing: git submodule add ${match.clone_url} ${submodulePath}`);
  execSync(`git submodule add ${match.clone_url} ${submodulePath}`, {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
  
  console.log(`\n======================================================`);
  console.log(`SUCCESS! "${match.name}" imported successfully.`);
  console.log(`To commit this new submodule run:`);
  console.log(`  git add .gitmodules external/gcp/${match.name}`);
  console.log(`  git commit -m "feat(submodule): add gcp ${match.name} module"`);
  console.log(`======================================================\n`);
  
} catch (err) {
  console.error(`\n[ERROR] Failed to add submodule:`, err.message);
}
