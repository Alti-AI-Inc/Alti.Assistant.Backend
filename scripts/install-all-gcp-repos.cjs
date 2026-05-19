const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CATALOG_PATH = path.join(__dirname, '../output/gcp-license-catalog.json');
const ROOT_DIR = path.join(__dirname, '../..');
const LOG_PATH = path.join(__dirname, '../logs/gcp-install.log');
const ERROR_LOG_PATH = path.join(__dirname, '../logs/gcp-install-error.log');

// Ensure log directories exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log helpers
function log(msg) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(LOG_PATH, formatted);
}

function logError(msg) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ERROR: ${msg}\n`;
  console.error(msg);
  fs.appendFileSync(ERROR_LOG_PATH, formatted);
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    logError('GCP repository catalog not found. Please run the scanner first.');
    process.exit(1);
  }

  log('======================================================');
  log('Starting Monolithic GCP Submodule Installation Task');
  log('======================================================');

  let catalog = [];
  try {
    catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch (err) {
    logError(`Failed to parse catalog: ${err.message}`);
    process.exit(1);
  }

  log(`Loaded ${catalog.length} vetted repositories from catalog.`);
  log(`Initiating sequential submodule registration...`);

  // Ensure external/gcp directory exists
  const localGcpPath = path.join(ROOT_DIR, 'external/gcp');
  if (!fs.existsSync(localGcpPath)) {
    fs.mkdirSync(localGcpPath, { recursive: true });
  }

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < catalog.length; i++) {
    const repo = catalog[i];
    const index = i + 1;
    const submodulePath = `external/gcp/${repo.name}`;
    const fullSubmodulePath = path.join(ROOT_DIR, submodulePath);

    log(`[${index}/${catalog.length}] Registering submodule for ${repo.name}...`);

    // Check if already exists in filesystem
    if (fs.existsSync(fullSubmodulePath) && fs.readdirSync(fullSubmodulePath).length > 0) {
      log(`-> Skipping ${repo.name} (Already exists locally at ${submodulePath})`);
      skippedCount++;
      continue;
    }

    try {
      // Execute git submodule add
      // We use --force to handle any leftover index states
      const cmd = `git submodule add --force ${repo.clone_url} ${submodulePath}`;
      log(`-> Executing: ${cmd}`);
      
      execSync(cmd, { cwd: ROOT_DIR, stdio: 'pipe' });
      
      log(`-> ✓ Successfully registered ${repo.name}!`);
      successCount++;
    } catch (err) {
      // Check if error is because it's already in git index
      const errMsg = err.stderr ? err.stderr.toString() : err.message;
      if (errMsg.includes('already exists in the index')) {
        log(`-> Skipping ${repo.name} (Already registered in Git index)`);
        skippedCount++;
      } else {
        logError(`Failed to add ${repo.name}: ${errMsg}`);
        failedCount++;
      }
    }

    // Small delay to prevent local process lock contention
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  log('======================================================');
  log('Installation task completed!');
  log(`Successfully Added: ${successCount}`);
  log(`Skipped (Already present): ${skippedCount}`);
  log(`Failed to Add: ${failedCount}`);
  log('======================================================');
}

main().catch(err => {
  logError(`Fatal error in installation runner: ${err.message}`);
  process.exit(1);
});
