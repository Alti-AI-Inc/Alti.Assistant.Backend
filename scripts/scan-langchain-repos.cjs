// Load environment variables from .env
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const ORG = 'langchain-ai';
const OUTPUT_DIR = path.join(__dirname, '../output');
const CATALOG_PATH = path.join(OUTPUT_DIR, 'langchain-license-catalog.json');

// Get GitHub Credentials from env
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
        'User-Agent': 'Alti-Assistant-Langchain-Scanner',
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
        } else if (res.statusCode === 404) {
          resolve({
            data: null,
            remaining: remaining ? parseInt(remaining) : null,
            resetTime: resetTime ? parseInt(resetTime) : null
          });
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

// Fetch specific repository license metadata as fallback
async function getLicenseFallback(repoName) {
  try {
    const result = await githubRequest(`/repos/${ORG}/${repoName}/license`);
    return result?.data?.license ? result.data.license.key : null;
  } catch (err) {
    return null;
  }
}

// Fetch and filter all LangChain repositories
async function scanLangchainOrg() {
  let repos = [];
  let page = 1;
  const perPage = 100;
  const catalog = [];
  
  console.log(`\n======================================================`);
  console.log(`Starting scan of all repositories in GitHub Org: ${ORG}...`);
  console.log(`======================================================`);
  
  if (token) {
    console.log(`[INFO] Authenticating using GITHUB_TOKEN.`);
  } else if (clientId && clientSecret) {
    console.log(`[INFO] Authenticating using GITHUB_CLIENT_ID/SECRET basic auth.`);
  } else {
    console.log(`[WARNING] Unauthenticated scan. You may experience rate limits (60/hr).`);
  }
  
  while (true) {
    console.log(`Fetching page ${page} of repositories...`);
    try {
      const result = await githubRequest(`/orgs/${ORG}/repos?per_page=${perPage}&page=${page}`);
      if (!result.data || result.data.length === 0) break;
      
      console.log(`-> Fetched ${result.data.length} repos (Total fetched: ${repos.length + result.data.length}). Remaining limit: ${result.remaining}`);
      
      for (const repo of result.data) {
        let licenseKey = repo.license ? repo.license.key : null;
        
        // Fallback check if license key is null
        if (!licenseKey) {
          process.stdout.write(`  Checking fallback license for ${repo.name}... `);
          licenseKey = await getLicenseFallback(repo.name);
          if (licenseKey) {
            console.log(`Found (${licenseKey})`);
          } else {
            console.log(`None`);
          }
          // Brief throttle for fallback requests
          await new Promise(r => setTimeout(r, 100));
        }
        
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
      
      // Prevent spamming
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
  
  // Sort catalog by stars descending
  catalog.sort((a, b) => b.stars - a.stars);
  
  // Save completed catalog
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log(`\n======================================================`);
  console.log(`SUCCESS! LangChain organization scan finished.`);
  console.log(`Filtered out ${catalog.length} repositories matching pure MIT or Apache 2.0.`);
  console.log(`Catalog saved to: ${CATALOG_PATH}`);
  console.log(`======================================================\n`);
}

scanLangchainOrg().catch(err => {
  console.error("Scanning failed:", err.message);
  process.exit(1);
});
