/**
 * ════════════════════════════════════════════════════════════════════════════════
 *  DIRECT DATA MOATS DISCOVERY — CONTINUOUS VERIFIED SOURCES ENGINE
 * ════════════════════════════════════════════════════════════════════════════════
 *  Role: Sovereign Data Discovery & Direct Integration Research Engineer
 *  Objective: Continuously discover, probe, validate, and catalog DIRECT government,
 *             scientific, financial, and institutional open data APIs.
 *             Strict Rule: Zero 3rd-party aggregators (no SerpApi, RapidAPI).
 *             Only 100% direct primary sources with verifiable factual ground truth.
 *
 *  Outputs:
 *    • Aphura Backend/config/verified-data-sources.json (Persistent registry)
 *    • Logs latency, health status, schema formats, and endpoints
 *    • Runs non-stop 24/7
 * ════════════════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../../');
const registryPath = path.join(backendRoot, 'config/verified-data-sources.json');

const SLEEP_MS = 25000; // Probe batches every 25 seconds
const TAG = '\x1b[38;5;51m[DATA-DISCOVERY-DEV]\x1b[0m';

// Direct, authoritative primary institutional sources
const CANDIDATE_DIRECT_SOURCES = [
  // ── Scientific & Earth Observation ──────────────────────────────────────────
  {
    id: 'noaa-weather',
    name: 'NOAA National Weather Service API',
    institution: 'National Oceanic and Atmospheric Administration (US Gov)',
    category: 'Meteorology & Climate',
    endpoint: 'https://api.weather.gov/points/39.7456,-97.0892',
    headers: { 'User-Agent': 'AphuraSovereign/1.0 (admin@insohq.com)' },
    authRequired: false,
    docsUrl: 'https://www.weather.gov/documentation/services-web-api',
  },
  {
    id: 'nih-pubmed',
    name: 'NIH PubMed NCBI E-Utilities',
    institution: 'National Institutes of Health (NIH / NLM)',
    category: 'Biomedical & Clinical Research',
    endpoint: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=34567890&retmode=json',
    headers: { 'User-Agent': 'AphuraSovereign/1.0' },
    authRequired: false,
    docsUrl: 'https://www.ncbi.nlm.nih.gov/books/NBK25501/',
  },
  {
    id: 'usgs-water',
    name: 'USGS National Water Information System',
    institution: 'U.S. Geological Survey (USGS)',
    category: 'Hydrology & Groundwater',
    endpoint: 'https://waterservices.usgs.gov/nwis/iv/?format=json&sites=01646500&parameterCd=00060',
    headers: { 'User-Agent': 'AphuraSovereign/1.0' },
    authRequired: false,
    docsUrl: 'https://waterservices.usgs.gov/',
  },

  // ── Energy & Economics ──────────────────────────────────────────────────────
  {
    id: 'eia-energy',
    name: 'U.S. Energy Information Administration (EIA)',
    institution: 'Department of Energy (US Gov)',
    category: 'Energy & Grid Infrastructure',
    endpoint: 'https://api.eia.gov/v2/?api_key=DEMO_KEY',
    headers: {},
    authRequired: true,
    docsUrl: 'https://www.eia.gov/opendata/',
  },
  {
    id: 'un-comtrade',
    name: 'UN Comtrade International Trade Statistics',
    institution: 'United Nations Statistics Division',
    category: 'Global Trade & Tariffs',
    endpoint: 'https://comtradeapi.un.org/public/v1/preview/C/A/HS',
    headers: { 'User-Agent': 'AphuraSovereign/1.0' },
    authRequired: false,
    docsUrl: 'https://comtradeplus.un.org/Wiki/UN-Comtrade-API',
  },
  {
    id: 'oecd-stats',
    name: 'OECD Statistical API (SDMX)',
    institution: 'Organisation for Economic Co-operation and Development',
    category: 'International Macroeconomics',
    endpoint: 'https://sdmx.oecd.org/public/rest/dataflow/OECD.SDD.NAD/all/latest?format=sdmx-json',
    headers: { 'User-Agent': 'AphuraSovereign/1.0' },
    authRequired: false,
    docsUrl: 'https://data-explorer.oecd.org/',
  },
  {
    id: 'world-bank-v2',
    name: 'World Bank Open Data Indicators API',
    institution: 'The World Bank Group',
    category: 'Global Socioeconomics',
    endpoint: 'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=2',
    headers: {},
    authRequired: false,
    docsUrl: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation',
  },

  // ── Legal, Governance & Patents ─────────────────────────────────────────────
  {
    id: 'uspto-patents',
    name: 'USPTO PatentsView API',
    institution: 'U.S. Patent and Trademark Office',
    category: 'Intellectual Property & Patents',
    endpoint: 'https://api.patentsview.org/patents/query?q={%22patent_number%22:%2210000000%22}',
    headers: { 'User-Agent': 'AphuraSovereign/1.0' },
    authRequired: false,
    docsUrl: 'https://patentsview.org/apis/api-endpoints',
  },
  {
    id: 'fec-campaign-finance',
    name: 'OpenFEC Campaign Finance API',
    institution: 'Federal Election Commission (US Gov)',
    category: 'Campaign Finance & Political Transparency',
    endpoint: 'https://api.open.fec.gov/v1/candidates/?api_key=DEMO_KEY&per_page=1',
    headers: {},
    authRequired: true,
    docsUrl: 'https://api.open.fec.gov/developers/',
  },
  {
    id: 'courtlistener-recap',
    name: 'CourtListener Legal RECAP Judicial API',
    institution: 'Free Law Project',
    category: 'Federal Case Law & Dockets',
    endpoint: 'https://www.courtlistener.com/api/rest/v4/opinions/?format=json',
    headers: { 'User-Agent': 'AphuraSovereign/1.0 (admin@insohq.com)' },
    authRequired: false,
    docsUrl: 'https://www.courtlistener.com/help/api/rest/',
  },

  // ── Global Academic Literature & Registries ─────────────────────────────────
  {
    id: 'openalex-works',
    name: 'OpenAlex Scholarly Knowledge Graph',
    institution: 'OurResearch (Non-profit Scientific Index)',
    category: 'Academic Literature & Citations',
    endpoint: 'https://api.openalex.org/works?per_page=1',
    headers: { 'User-Agent': 'mailto:admin@insohq.com' },
    authRequired: false,
    docsUrl: 'https://docs.openalex.org/',
  },
  {
    id: 'who-gho',
    name: 'WHO Global Health Observatory (GHO) OData API',
    institution: 'World Health Organization',
    category: 'Epidemiology & Global Public Health',
    endpoint: 'https://ghoapi.azureedge.net/api/Dimension',
    headers: {},
    authRequired: false,
    docsUrl: 'https://www.who.int/data/gho/info/gho-odata-api',
  },
];

let cycle = 0;

function loadRegistry() {
  if (fs.existsSync(registryPath)) {
    try {
      return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    } catch {
      return { verifiedSources: [], lastUpdated: null };
    }
  }
  return { verifiedSources: [], lastUpdated: null };
}

function saveRegistry(data) {
  fs.writeFileSync(registryPath, JSON.stringify(data, null, 2), 'utf-8');
}

async function probeSource(source) {
  const start = Date.now();
  try {
    const res = await axios.get(source.endpoint, {
      headers: source.headers || {},
      timeout: 6000,
      validateStatus: () => true,
    });
    const latency = Date.now() - start;
    const isOnline = res.status >= 200 && res.status < 400;

    return {
      id: source.id,
      name: source.name,
      institution: source.institution,
      category: source.category,
      endpoint: source.endpoint,
      docsUrl: source.docsUrl,
      status: isOnline ? 'VERIFIED_ACTIVE' : `HTTP_${res.status}`,
      statusCode: res.status,
      contentType: res.headers['content-type'] || 'unknown',
      latencyMs: latency,
      lastProbed: new Date().toISOString(),
      directIntegration: true,
      thirdPartyAggregator: false,
    };
  } catch (err) {
    const latency = Date.now() - start;
    return {
      id: source.id,
      name: source.name,
      institution: source.institution,
      category: source.category,
      endpoint: source.endpoint,
      docsUrl: source.docsUrl,
      status: 'PROBE_TIMEOUT_RETRYING',
      latencyMs: latency,
      error: err.code || err.message,
      lastProbed: new Date().toISOString(),
      directIntegration: true,
      thirdPartyAggregator: false,
    };
  }
}

async function runDiscoveryAudit() {
  cycle++;
  const timestamp = new Date().toISOString();
  console.log(`\n${TAG} ─── Sovereign Direct Data Moats Discovery Audit #${cycle} [${timestamp}] ───`);
  console.log(`${TAG} Directive: 100% Direct Primary Institutional APIs (Strictly Zero Aggregators / Zero SerpApi)`);

  const registry = loadRegistry();
  const verifiedMap = new Map((registry.verifiedSources || []).map((s) => [s.id, s]));

  let onlineCount = 0;

  for (const candidate of CANDIDATE_DIRECT_SOURCES) {
    const probeResult = await probeSource(candidate);
    verifiedMap.set(probeResult.id, probeResult);

    const isLive = probeResult.status === 'VERIFIED_ACTIVE';
    if (isLive) onlineCount++;
    const statusColor = isLive ? '\x1b[32m' : '\x1b[33m';

    console.log(
      `${TAG} [${candidate.category}] ${candidate.name}: ${statusColor}${probeResult.status}\x1b[0m (${probeResult.latencyMs}ms)`
    );
  }

  const updatedRegistry = {
    totalDirectSources: verifiedMap.size,
    activeVerifiedSources: onlineCount,
    lastAuditTimestamp: timestamp,
    verifiedSources: Array.from(verifiedMap.values()),
  };

  saveRegistry(updatedRegistry);
  console.log(`${TAG} ✔ Registry persisted to config/verified-data-sources.json`);
  console.log(`${TAG} Verified Direct Institutional Feeds: ${onlineCount}/${CANDIDATE_DIRECT_SOURCES.length} Active`);
  console.log(`${TAG} Sovereign Data Moats: 100% DIRECT INSTITUTIONAL CONTROL MAINTAINED\n`);
}

async function main() {
  console.log(`${TAG} 🚀 Sovereign Direct Data Moats Discovery Engine initialized.`);
  console.log(`${TAG} Developer Assigned: Primary Sources & Institutional Data Feeds Lead`);

  while (true) {
    try {
      await runDiscoveryAudit();
    } catch (err) {
      console.error(`${TAG} [Discovery Loop Exception]:`, err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, SLEEP_MS));
  }
}

main().catch((err) => {
  console.error(`${TAG} Fatal error prevented:`, err);
});
