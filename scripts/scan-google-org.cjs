// Load environment variables from .env
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const ORG = 'google';
const OUTPUT_DIR = path.join(__dirname, '../output');
const CATALOG_PATH = path.join(OUTPUT_DIR, 'google-license-catalog.json');

// Get GitHub Token, Client ID, Client Secret
const token = process.env.GITHUB_TOKEN;
const clientId = process.env.GITHUB_CLIENT_ID || 'Ov23liTKE6VJOy13U6lp';
const clientSecret = process.env.GITHUB_CLIENT_SECRET || '8cd9ba8817255f958a6da97becad1dc1df8ba7ec';

// Helper to make HTTPS requests to GitHub API
function githubRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      headers: {
        'User-Agent': 'Alti-Assistant-Google-Scanner',
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
          reject(new Error(`GitHub API Rate limit exceeded. Resets at ${resetDate}.`));
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}: ${res.statusMessage || data}`));
        }
      });
    }).on('error', reject);
  });
}

// Fetch all repositories in the organization
async function scanGoogleOrg() {
  let repos = [];
  let page = 1;
  const perPage = 100;
  const catalog = [];
  
  console.log(`\n======================================================`);
  console.log(`Starting scan of all repositories in GitHub Org: ${ORG}...`);
  console.log(`======================================================`);
  
  while (true) {
    console.log(`Fetching page ${page} of repositories...`);
    try {
      const result = await githubRequest(`/orgs/${ORG}/repos?per_page=${perPage}&page=${page}`);
      if (!result.data || result.data.length === 0) break;
      
      console.log(`-> Fetched ${result.data.length} repos (Total fetched: ${repos.length + result.data.length}). Remaining limit: ${result.remaining}`);
      
      for (const repo of result.data) {
        const licenseKey = repo.license ? repo.license.key : null;
        
        if (licenseKey === 'mit' || licenseKey === 'apache-2.0') {
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
        }
      }
      
      repos = repos.concat(result.data);
      if (result.data.length < perPage) break;
      page++;
      
      // Preventing spamming
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`Error fetching repos on page ${page}:`, err.message);
      throw err;
    }
  }
  
  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Save completed catalog
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log(`\n======================================================`);
  console.log(`SUCCESS! Google organization scan finished.`);
  console.log(`Filtered out ${catalog.length} repositories matching pure MIT or Apache 2.0.`);
  console.log(`Catalog saved to: ${CATALOG_PATH}`);
  console.log(`======================================================\n`);
}

scanGoogleOrg();
