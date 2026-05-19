// Load environment variables from .env
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const ORG = 'GoogleCloudPlatform';
const OUTPUT_DIR = path.join(__dirname, '../output');
const CATALOG_PATH = path.join(OUTPUT_DIR, 'gcp-license-catalog.json');

// Get GitHub Token, Client ID, Client Secret
const token = process.argv[2] || process.env.GITHUB_TOKEN;
const clientId = process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.GITHUB_CLIENT_SECRET;

// Helper to make HTTPS requests to GitHub API
function githubRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      headers: {
        'User-Agent': 'Alti-Assistant-GCP-Scanner',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    
    if (token) {
      options.headers['Authorization'] = `token ${token}`;
    } else if (clientId && clientSecret) {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      options.headers['Authorization'] = `Basic ${basicAuth}`;
    }
    
    https.get(options, (res) => {
      const remaining = res.headers['x-ratelimit-remaining'];
      const resetTime = res.headers['x-ratelimit-reset'];
      
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve({
              data: JSON.parse(data),
              remaining: remaining ? parseInt(remaining) : null,
              resetTime: resetTime ? parseInt(resetTime) : null
            });
          } catch (e) {
            reject(e);
          }
        } else if (res.statusCode === 403 && remaining === '0') {
          const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000).toLocaleTimeString() : 'later';
          reject(new Error(`GitHub API Rate limit exceeded. Resets at ${resetDate}. Please provide a GITHUB_TOKEN.`));
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}: ${res.statusMessage || data}`));
        }
      });
    }).on('error', reject);
  });
}

// Fetch all repositories in the GCP Organization
async function getAllRepos() {
  let repos = [];
  let page = 1;
  const perPage = 100;
  
  console.log(`\n======================================================`);
  console.log(`Starting scan of all repositories in GitHub Org: ${ORG}...`);
  console.log(`======================================================`);
  
  if (!token && (!clientId || !clientSecret)) {
    console.log(`[WARNING] No GITHUB_TOKEN or GITHUB_CLIENT_ID/SECRET found. You will likely hit the 60-request hourly limit.`);
    console.log(`To bypass rate-limiting, pass a token: node scripts/scan-gcp-repos.cjs <YOUR_GITHUB_TOKEN>\n`);
  } else if (token) {
    console.log(`[INFO] Authenticating using GITHUB_TOKEN.\n`);
  } else {
    console.log(`[INFO] Authenticating using GITHUB_CLIENT_ID/SECRET basic authentication (5,000 requests/hr rate limit).\n`);
  }
  
  while (true) {
    console.log(`Fetching page ${page} of repositories...`);
    try {
      const result = await githubRequest(`/orgs/${ORG}/repos?per_page=${perPage}&page=${page}`);
      if (!result.data || result.data.length === 0) break;
      
      repos = repos.concat(result.data);
      console.log(`-> Fetched ${result.data.length} repos (Total so far: ${repos.length}). Remaining limit: ${result.remaining}`);
      
      if (result.data.length < perPage) break;
      page++;
      
      // Prevent spamming
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`Error fetching repos on page ${page}:`, err.message);
      throw err;
    }
  }
  return repos;
}

// Fetch specific repository license metadata
async function getLicense(repoName) {
  try {
    const result = await githubRequest(`/repos/${ORG}/${repoName}/license`);
    return result.data.license ? result.data.license.key : null;
  } catch (err) {
    if (err.message.includes('404')) {
      return null; // No license file defined
    }
    throw err;
  }
}

// Main execution block
async function main() {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    const allRepos = await getAllRepos();
    console.log(`\nFound ${allRepos.length} total repositories in ${ORG}.`);
    console.log(`Filtering for pure MIT and Apache-2.0 licenses...\n`);
    
    const catalog = [];
    let count = 0;
    
    for (const repo of allRepos) {
      count++;
      process.stdout.write(`Processing [${count}/${allRepos.length}]: ${repo.name}... `);
      
      try {
        const licenseKey = await getLicense(repo.name);
        
        if (licenseKey === 'mit' || licenseKey === 'apache-2.0') {
          console.log(`✓ Accepted (${licenseKey})`);
          catalog.push({
            name: repo.name,
            description: repo.description || 'No description provided.',
            license: licenseKey === 'mit' ? 'MIT' : 'Apache 2.0',
            html_url: repo.html_url,
            clone_url: repo.clone_url,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            language: repo.language || 'Unknown',
            updated_at: repo.updated_at
          });
        } else {
          console.log(`✗ Skipped (${licenseKey || 'No License'})`);
        }
        
        // Small throttle delay
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.log(`ERROR!`);
        console.error(`Failed checking license for ${repo.name}: ${err.message}`);
        
        // Graceful exit on rate limits
        if (err.message.includes('Rate limit exceeded')) {
          console.log(`\n[WARNING] Saving progress so far to avoid data loss...`);
          fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
          console.log(`Saved ${catalog.length} repos to ${CATALOG_PATH}`);
          process.exit(1);
        }
      }
    }
    
    // Save completed catalog
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    console.log(`\n======================================================`);
    console.log(`SUCCESS! Complete scan finished.`);
    console.log(`Filtered out ${catalog.length} repositories matching pure MIT or Apache 2.0.`);
    console.log(`Catalog saved to: ${CATALOG_PATH}`);
    console.log(`======================================================\n`);
    
  } catch (err) {
    console.error(`\nScanner failed:`, err.message);
  }
}

main();
