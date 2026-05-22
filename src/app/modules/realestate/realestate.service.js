/**
 * realestate.service.js — RealEstateAPI.com Service Layer
 *
 * Replicates the design of predictiondata.service.js and massive.service.js.
 * Target URL: https://api.realestateapi.com
 * Auth: Header `x-api-key`
 *
 * Implements robust mock fallback data when process.env.REALESTATE_API_KEY is not set.
 */

import dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';

dotenv.config();

const BASE_URL = 'https://api.realestateapi.com';

const getApiKey = () => {
  return (process.env.REALESTATE_API_KEY || '').replace(/^\uFEFF+/, '').trim();
};

// Caching TTLs (seconds)
const TTL = {
  detail: 300,  // 5 minutes
  avm: 300,
  comps: 900,   // 15 minutes
  mls: 120,     // 2 minutes
  skip: 1800,   // 30 minutes
};

// ─── Cache & Latency Performance Diagnostics Tracker ─────────────────────────
export const serviceDiagnostics = {
  calls: {},
  cacheStats: { hits: 0, misses: 0 }
};

const registerDiagnostic = (methodName, latencyMs, cacheStatus) => {
  if (!serviceDiagnostics.calls[methodName]) {
    serviceDiagnostics.calls[methodName] = [];
  }
  serviceDiagnostics.calls[methodName].push({
    timestamp: new Date().toISOString(),
    latencyMs,
    cacheStatus
  });
  if (cacheStatus === 'HIT') {
    serviceDiagnostics.cacheStats.hits++;
  } else if (cacheStatus === 'MISS') {
    serviceDiagnostics.cacheStats.misses++;
  }
};

// ─── Core HTTP Helper ──────────────────────────────────────────────────────────
async function reFetch(path, body = {}, method = 'POST') {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('[RealEstateAPI] REALESTATE_API_KEY is not configured. Falling back to high-fidelity mocks.');
    return null;
  }

  const url = `${BASE_URL}${path}`;
  logger.info(`[RealEstateAPI] ${method} ${path}`);

  const response = await fetch(url, {
    method,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`RealEstateAPI ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

// ─── Caching Helpers ──────────────────────────────────────────────────────────
async function cacheGet(key) {
  try {
    const val = await RedisClient.get(`realestate:${key}`);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function cacheSet(key, val, ttlSeconds) {
  try {
    await RedisClient.setEx(`realestate:${key}`, ttlSeconds, JSON.stringify(val));
  } catch {}
}

// ─── High-Fidelity Mock Data ──────────────────────────────────────────────────
const MOCK_PROPERTIES = [
  {
    id: 'prop_90210_1',
    address: '123 Main St',
    city: 'Atlanta',
    state: 'GA',
    zip: '30303',
    ownerName: 'Altis Holdings LLC',
    yearBuilt: 2012,
    beds: 4,
    baths: 3.5,
    sqft: 3150,
    lotSizeAcres: 0.45,
    lastSalePrice: 585000,
    lastSaleDate: '2021-08-14',
    taxAssessedValue: 545000,
  },
  {
    id: 'prop_90210_2',
    address: '456 Oak Ln',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    ownerName: 'Jane R. Miller',
    yearBuilt: 2018,
    beds: 3,
    baths: 2.5,
    sqft: 2200,
    lotSizeAcres: 0.22,
    lastSalePrice: 495000,
    lastSaleDate: '2022-03-22',
    taxAssessedValue: 475000,
  },
  {
    id: 'prop_90210_3',
    address: '1600 Pennsylvania Ave NW',
    city: 'Washington',
    state: 'DC',
    zip: '20500',
    ownerName: 'United States Government',
    yearBuilt: 1800,
    beds: 16,
    baths: 35,
    sqft: 55000,
    lotSizeAcres: 18.0,
    lastSalePrice: 0,
    lastSaleDate: null,
    taxAssessedValue: 450000000,
  }
];

const MOCK_AVM = {
  prop_90210_1: { valuation: 672000, highValue: 710000, lowValue: 635000, confidenceScore: 88, rentalValuation: 3950 },
  prop_90210_2: { valuation: 535000, highValue: 565000, lowValue: 505000, confidenceScore: 92, rentalValuation: 3200 },
  prop_90210_3: { valuation: 485000000, highValue: 520000000, lowValue: 450000000, confidenceScore: 75, rentalValuation: 120000 }
};

const MOCK_COMPS = {
  prop_90210_1: [
    { address: '129 Main St', distanceMiles: 0.05, beds: 4, baths: 3.5, sqft: 3050, salePrice: 599000, saleDate: '2025-11-10' },
    { address: '144 Main St', distanceMiles: 0.12, beds: 4, baths: 4, sqft: 3300, salePrice: 615000, saleDate: '2026-01-14' },
    { address: '98 Oak Ave', distanceMiles: 0.25, beds: 3, baths: 2.5, sqft: 2800, salePrice: 575000, saleDate: '2025-09-08' },
  ],
  prop_90210_2: [
    { address: '468 Oak Ln', distanceMiles: 0.03, beds: 3, baths: 2.5, sqft: 2250, salePrice: 512000, saleDate: '2025-12-05' },
    { address: '502 Pine St', distanceMiles: 0.18, beds: 3, baths: 3, sqft: 2400, salePrice: 540000, saleDate: '2026-02-28' },
  ],
  prop_90210_3: [
    { address: '800 16th St NW', distanceMiles: 0.15, beds: 10, baths: 12, sqft: 25000, salePrice: 180000000, saleDate: '2024-04-11' },
  ]
};

const MOCK_MLS = [
  { address: '789 Maple Ave', city: 'Atlanta', state: 'GA', zip: '30303', price: 625000, beds: 4, baths: 3.5, sqft: 2950, status: 'Active', listDate: '2026-05-10', daysOnMarket: 11, propertyType: 'SingleFamily' },
  { address: '221 Elmwood Dr', city: 'Atlanta', state: 'GA', zip: '30303', price: 549000, beds: 3, baths: 2.5, sqft: 2400, status: 'Pending', listDate: '2026-04-18', daysOnMarket: 33, propertyType: 'SingleFamily' },
  { address: '55 Peachtree St NW #12A', city: 'Atlanta', state: 'GA', zip: '30303', price: 295000, beds: 2, baths: 2, sqft: 1150, status: 'Active', listDate: '2026-05-01', daysOnMarket: 20, propertyType: 'Condominium' },
  { address: '124 Piedmont Ave NE', city: 'Atlanta', state: 'GA', zip: '30303', price: 425000, beds: 3, baths: 2, sqft: 1800, status: 'Active', listDate: '2026-05-14', daysOnMarket: 7, propertyType: 'Townhouse' },
  { address: '100 10th St NW', city: 'Atlanta', state: 'GA', zip: '30309', price: 895000, beds: 5, baths: 4.5, sqft: 4200, status: 'Active', listDate: '2026-05-05', daysOnMarket: 16, propertyType: 'SingleFamily' },
  { address: '300 West Broadway #3B', city: 'New York', state: 'NY', zip: '10013', price: 1850000, beds: 2, baths: 2, sqft: 1450, status: 'Active', listDate: '2026-05-12', daysOnMarket: 9, propertyType: 'Condominium' },
  { address: '150 Sunset Blvd', city: 'Los Angeles', state: 'CA', zip: '90028', price: 2400000, beds: 4, baths: 4.5, sqft: 3800, status: 'Active', listDate: '2026-04-29', daysOnMarket: 22, propertyType: 'SingleFamily' },
  { address: '88 Geary St', city: 'San Francisco', state: 'CA', zip: '94108', price: 1250000, beds: 3, baths: 2.5, sqft: 2100, status: 'Active', listDate: '2026-05-08', daysOnMarket: 13, propertyType: 'Townhouse' },
  { address: '44 Brickell Ave #1502', city: 'Miami', state: 'FL', zip: '33131', price: 750000, beds: 2, baths: 2, sqft: 1350, status: 'Active', listDate: '2026-05-15', daysOnMarket: 6, propertyType: 'Condominium' },
  { address: '1240 Eighth St', city: 'Austin', state: 'TX', zip: '78701', price: 685000, beds: 3, baths: 3, sqft: 2250, status: 'Active', listDate: '2026-05-02', daysOnMarket: 19, propertyType: 'SingleFamily' }
];

const MOCK_SKIP = {
  prop_90210_1: {
    owner: 'Altis Holdings LLC',
    phoneNumbers: ['(404) 555-0199', '(404) 555-0144'],
    emails: ['admin@altisholdings.com', 'acquisitions@altisholdings.com'],
    currentAddress: '990 Peach Tree St, Suite 400, Atlanta, GA 30309',
    demographics: { netWorth: '$5,000,000+', creditRange: '750-800' }
  },
  prop_90210_2: {
    owner: 'Jane R. Miller',
    phoneNumbers: ['(512) 555-3211'],
    emails: ['jane.miller@gmail.com'],
    currentAddress: '456 Oak Ln, Austin, TX 78701',
    demographics: { netWorth: '$750,000 - $1,000,000', creditRange: '700-750' }
  },
  prop_90210_3: {
    owner: 'United States Government',
    phoneNumbers: ['(202) 456-1111'],
    emails: ['president@whitehouse.gov'],
    currentAddress: '1600 Pennsylvania Ave NW, Washington, DC 20500',
    demographics: { netWorth: '$450,000,000', creditRange: '800-850' }
  }
};

// ─── Service API Implementations ──────────────────────────────────────────────

/**
 * AutoComplete address strings to suggest real properties or standard layouts
 */
export const autoCompleteService = async (text) => {
  const start = Date.now();
  logger.info(`[RealEstateService] AutoComplete: ${text}`);
  const apiKey = getApiKey();
  if (!apiKey) {
    const data = MOCK_PROPERTIES
      .filter(p => p.address.toLowerCase().includes(text.toLowerCase()) || p.city.toLowerCase().includes(text.toLowerCase()))
      .map(p => ({ address: `${p.address}, ${p.city}, ${p.state} ${p.zip}`, propId: p.id }));
    registerDiagnostic('autoCompleteService', Date.now() - start, 'MISS');
    return data;
  }

  const res = await reFetch('/v2/AutoComplete', { text });
  registerDiagnostic('autoCompleteService', Date.now() - start, 'MISS');
  return res;
};

/**
 * Searches properties on criteria
 */
export const searchPropertyService = async (criteria) => {
  const start = Date.now();
  logger.info(`[RealEstateService] Property Search: ${JSON.stringify(criteria)}`);
  const apiKey = getApiKey();
  if (!apiKey) {
    // Locate match in mock array based on simple queries
    const addr = (criteria.address || '').toLowerCase();
    const city = (criteria.city || '').toLowerCase();
    const matches = MOCK_PROPERTIES.filter(p => 
      (addr && p.address.toLowerCase().includes(addr)) || 
      (city && p.city.toLowerCase().includes(city))
    );
    const data = matches.length > 0 ? matches : [MOCK_PROPERTIES[0]];
    registerDiagnostic('searchPropertyService', Date.now() - start, 'MISS');
    return data;
  }

  const response = await reFetch('/v2/PropertySearch', criteria);
  registerDiagnostic('searchPropertyService', Date.now() - start, 'MISS');
  return response?.results || response;
};

/**
 * Fetches comprehensive public record details for a property ID
 */
export const getPropertyDetailService = async (idParams) => {
  const start = Date.now();
  const propId = typeof idParams === 'string' ? idParams : idParams.id || idParams.propertyId;
  logger.info(`[RealEstateService] Property Detail: ${propId}`);

  const cacheKey = `detail:${propId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    registerDiagnostic('getPropertyDetailService', Date.now() - start, 'HIT');
    return cached;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    const prop = MOCK_PROPERTIES.find(p => p.id === propId || p.address.toLowerCase().includes(String(propId).toLowerCase())) || MOCK_PROPERTIES[0];
    await cacheSet(cacheKey, prop, TTL.detail);
    registerDiagnostic('getPropertyDetailService', Date.now() - start, 'MISS');
    return prop;
  }

  const response = await reFetch('/v2/PropertyDetail', typeof idParams === 'string' ? { propertyId: idParams } : idParams);
  const data = response?.results?.[0] || response;
  await cacheSet(cacheKey, data, TTL.detail);
  registerDiagnostic('getPropertyDetailService', Date.now() - start, 'MISS');
  return data;
};

/**
 * Retreives lender-grade property valuation estimates (AVM)
 */
export const getPropertyAvmService = async (idParams) => {
  const start = Date.now();
  const propId = typeof idParams === 'string' ? idParams : idParams.id || idParams.propertyId;
  logger.info(`[RealEstateService] Property AVM: ${propId}`);

  const cacheKey = `avm:${propId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    registerDiagnostic('getPropertyAvmService', Date.now() - start, 'HIT');
    return cached;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    const avm = MOCK_AVM[propId] || MOCK_AVM.prop_90210_1;
    await cacheSet(cacheKey, avm, TTL.avm);
    registerDiagnostic('getPropertyAvmService', Date.now() - start, 'MISS');
    return avm;
  }

  const response = await reFetch('/v2/PropertyAvm', typeof idParams === 'string' ? { propertyId: idParams } : idParams);
  const data = response?.results?.[0] || response;
  await cacheSet(cacheKey, data, TTL.avm);
  registerDiagnostic('getPropertyAvmService', Date.now() - start, 'MISS');
  return data;
};

/**
 * Returns comparable sales in the nearby neighborhood
 */
export const getPropertyCompsService = async (idParams) => {
  const start = Date.now();
  const propId = typeof idParams === 'string' ? idParams : idParams.id || idParams.propertyId;
  const radiusMiles = idParams?.radiusMiles || null;
  const compsLimit = idParams?.compsLimit || null;
  logger.info(`[RealEstateService] Property Comps: ${propId}`);

  const cacheKey = `comps:${propId}:${radiusMiles}:${compsLimit}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    registerDiagnostic('getPropertyCompsService', Date.now() - start, 'HIT');
    return cached;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    let comps = MOCK_COMPS[propId] || MOCK_COMPS.prop_90210_1;
    if (radiusMiles) {
      comps = comps.filter(c => c.distanceMiles <= radiusMiles);
    }
    if (compsLimit) {
      comps = comps.slice(0, compsLimit);
    }
    await cacheSet(cacheKey, comps, TTL.comps);
    registerDiagnostic('getPropertyCompsService', Date.now() - start, 'MISS');
    return comps;
  }

  // Use the verified /v3/PropertyComps endpoint as recommended
  const response = await reFetch('/v3/PropertyComps', typeof idParams === 'string' ? { propertyId: idParams } : idParams);
  const data = response?.results || response;
  await cacheSet(cacheKey, data, TTL.comps);
  registerDiagnostic('getPropertyCompsService', Date.now() - start, 'MISS');
  return data;
};

/**
 * Query active listing MLS database for specific properties or city regions
 */
export const searchMlsService = async (criteria) => {
  const start = Date.now();
  logger.info(`[RealEstateService] MLS Search: ${JSON.stringify(criteria)}`);

  const cacheKey = `mls:${JSON.stringify(criteria)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    registerDiagnostic('searchMlsService', Date.now() - start, 'HIT');
    return cached;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    let filtered = [...MOCK_MLS];

    // Filter by city
    if (criteria.city) {
      filtered = filtered.filter(p => p.city.toLowerCase() === criteria.city.toLowerCase());
    }
    // Filter by state
    if (criteria.state) {
      filtered = filtered.filter(p => p.state.toLowerCase() === criteria.state.toLowerCase());
    }
    // Filter by zip
    if (criteria.zip) {
      filtered = filtered.filter(p => p.zip === criteria.zip);
    }
    // Filter by beds minimum
    if (criteria.minBeds) {
      filtered = filtered.filter(p => p.beds >= criteria.minBeds);
    }
    // Filter by baths minimum
    if (criteria.minBaths) {
      filtered = filtered.filter(p => p.baths >= criteria.minBaths);
    }
    // Filter by price limits
    if (criteria.minPrice) {
      filtered = filtered.filter(p => p.price >= criteria.minPrice);
    }
    if (criteria.maxPrice) {
      filtered = filtered.filter(p => p.price <= criteria.maxPrice);
    }
    // Filter by property type
    if (criteria.propertyType) {
      filtered = filtered.filter(p => p.propertyType === criteria.propertyType);
    }

    // Default mock fallback if no results match
    if (filtered.length === 0) {
      filtered = MOCK_MLS.filter(p => p.city.toLowerCase() === 'atlanta');
    }

    await cacheSet(cacheKey, filtered, TTL.mls);
    registerDiagnostic('searchMlsService', Date.now() - start, 'MISS');
    return filtered;
  }

  const response = await reFetch('/v2/MLSSearch', criteria);
  const data = response?.results || response;
  await cacheSet(cacheKey, data, TTL.mls);
  registerDiagnostic('searchMlsService', Date.now() - start, 'MISS');
  return data;
};

/**
 * Fetch skipped owner records (phones, emails, etc.) for a property ID
 */
export const getSkipTraceService = async (idParams) => {
  const start = Date.now();
  const propId = typeof idParams === 'string' ? idParams : idParams.id || idParams.propertyId;
  logger.info(`[RealEstateService] Skip Trace: ${propId}`);

  const cacheKey = `skip:${propId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    registerDiagnostic('getSkipTraceService', Date.now() - start, 'HIT');
    return cached;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    const trace = MOCK_SKIP[propId] || MOCK_SKIP.prop_90210_1;
    await cacheSet(cacheKey, trace, TTL.skip);
    registerDiagnostic('getSkipTraceService', Date.now() - start, 'MISS');
    return trace;
  }

  const response = await reFetch('/v2/SkipTrace', typeof idParams === 'string' ? { propertyId: idParams } : idParams);
  const data = response?.results?.[0] || response;
  await cacheSet(cacheKey, data, TTL.skip);
  registerDiagnostic('getSkipTraceService', Date.now() - start, 'MISS');
  return data;
};

// Export consolidated object
export const realestateService = {
  autoCompleteService,
  searchPropertyService,
  getPropertyDetailService,
  getPropertyAvmService,
  getPropertyCompsService,
  searchMlsService,
  getSkipTraceService,
  serviceDiagnostics
};
