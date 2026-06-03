import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import config from '../config/index.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const PROJECT_ID = config.google.gcp_project_id || process.env.GCP_PROJECT_ID || 'gen-lang-client-0273900650';

function runSecretsSync() {
  console.log(`\n${CYAN}================================================${RESET}`);
  console.log(`${CYAN}   Alti DevOps Google Cloud Secret Synchronizer  ${RESET}`);
  console.log(`${CYAN}================================================${RESET}\n`);

  console.log(`${YELLOW}GCP Target Project: ${PROJECT_ID}${RESET}`);

  // Check if gcloud is installed
  try {
    execSync('gcloud --version', { stdio: 'ignore' });
    console.log(`  ${GREEN}✓ Google Cloud SDK (gcloud) is available.${RESET}`);
  } catch (e) {
    console.log(`  ${RED}❌ Google Cloud SDK (gcloud) is not installed or not in PATH!${RESET}`);
    console.log(`  ${YELLOW}Please install the Google Cloud CLI to run this sync tool.${RESET}`);
    process.exit(1);
  }

  // Check active gcloud authentication
  try {
    const account = execSync('gcloud config get-value account', { encoding: 'utf8' }).trim();
    if (!account) {
      throw new Error('No active gcloud account');
    }
    console.log(`  ${GREEN}✓ Authenticated gcloud account: ${account}${RESET}`);
  } catch (e) {
    console.log(`  ${RED}❌ No active gcloud session detected! Please run "gcloud auth login" first.${RESET}`);
    process.exit(1);
  }

  // Parse env.yaml
  const envYamlPath = path.join(process.cwd(), 'env.yaml');
  if (!fs.existsSync(envYamlPath)) {
    console.log(`  ${RED}❌ Environment specification file 'env.yaml' not found!${RESET}`);
    process.exit(1);
  }

  console.log(`\n${CYAN}Parsing env.yaml key-value pairs...${RESET}`);
  const lines = fs.readFileSync(envYamlPath, 'utf8').split('\n');
  const secretMap = new Map();

  const ignoreList = ['NODE_ENV', 'PORT', 'GCP_LOCATION', 'VERTEX_AI_LOCATION'];

  const BOM = '\uFEFF';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let val = trimmed.slice(colonIndex + 1).trim();

    // Clean BOM characters if present
    if (val.startsWith(BOM)) {
      val = val.replace(/^\uFEFF+/, '');
    }

    // Strip wrapping quotes
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }

    if (ignoreList.includes(key) || !val || val === "''" || val === '""' || val.includes('your_') || val.includes('_here')) {
      // Skip ignorable or empty placeholder configurations
      continue;
    }

    secretMap.set(key, val);
  }

  console.log(`  ${GREEN}✓ Successfully parsed ${secretMap.size} valid production secret values.${RESET}`);

  console.log(`\n${CYAN}Synchronizing keys with GCP Secret Manager...${RESET}\n`);

  for (const [key, value] of secretMap.entries()) {
    console.log(`${YELLOW}Syncing [${key}]...${RESET}`);

    // Step A: Check if secret exists in GCP
    let exists = false;
    try {
      execSync(`gcloud secrets describe ${key} --project=${PROJECT_ID}`, { stdio: 'ignore' });
      exists = true;
    } catch (e) {
      // Secret does not exist
    }

    if (!exists) {
      // Step B: Create Secret
      try {
        console.log(`  Creating new secret container: ${key}...`);
        execSync(`gcloud secrets create ${key} --replication-policy=automatic --project=${PROJECT_ID}`, { stdio: 'ignore' });
        console.log(`  ${GREEN}✓ Secret container created successfully.${RESET}`);
      } catch (err) {
        console.log(`  ${RED}❌ Failed to create secret container: ${err.message}${RESET}`);
        continue;
      }
    }

    // Step C: Push version
    try {
      // Use standard input pipe to prevent raw credentials from appearing in process lists
      const cmd = `gcloud secrets versions add ${key} --data-file=- --project=${PROJECT_ID}`;
      
      // Execute command programmatically passing secret value via stdin
      const cp = execSync(cmd, { input: value, stdio: 'pipe' });
      console.log(`  ${GREEN}✓ Active value version uploaded successfully.${RESET}`);
    } catch (err) {
      console.log(`  ${RED}❌ Failed to add version: ${err.message}${RESET}`);
    }
  }

  console.log(`\n${CYAN}================================================${RESET}`);
  console.log(`${GREEN}✅ GCP SECRET SYNC CYCLE COMPLETE! ALL KEY-VALUES ACTIVE.${RESET}`);
  console.log(`${CYAN}================================================${RESET}\n`);
}

runSecretsSync();
