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

/**
 * The base URL for the RealEstateAPI.com API.
 * @type {string}
 */
const BASE_URL = 'https://api.realestateapi.com';

/**
 * Retrieves the RealEstateAPI.com API key from environment variables.
 * It also cleans up potential Byte Order Mark (BOM) and trims whitespace.
 * If the key is not set, a warning is logged by `reFetch`.
 * @returns {string} The cleaned API key, or an empty string if not found.
 */
const getApiKey = () => {
  return (process.env.REALESTATE_API_KEY || '').replace(/^\uFEFF+/, '').trim();
};

/**
 * @typedef {Object} CacheTTLs
 * @property {number} detail - Time-to-live for property detail cache in seconds (5 minutes).
 * @property {number} avm - Time-to-live for AVM (Automated Valuation Model) cache in seconds (5 minutes).
 * @property {number} comps - Time-to-live for comparable sales cache in seconds (15 minutes).
 * @property {number} mls - Time-to-live for MLS search results cache in seconds (2 minutes).
 * @property {number} skip - Time-to-live for skip trace results cache in seconds (30 minutes).
 */

/**
 * Caching Time-To-Live (TTL) values in seconds for different API endpoints.
 * @type {CacheTTLs}
 */
const TTL = {
  detail: 300,  // 5 minutes
  avm: 300,
  comps: 900,   // 15 minutes
  mls: 120,     // 2 minutes
  skip: 1800,   // 30 minutes
};

/**
 * @typedef {Object} ServiceDiagnosticCall
 * @property {string} timestamp - ISO string of when the call was made.
 * @property {number} latencyMs - Latency of the API call or mock data retrieval in milliseconds.
 * @property {'HIT' | 'MISS'} cacheStatus - Indicates if the data was served from cache or fetched from the API/mock.
 */

/**
 * @typedef {Object} ServiceDiagnostics
 * @property {Object.<string, ServiceDiagnosticCall[]>} calls - A map where keys are service method names and values are arrays of diagnostic call records.
 * @property {Object} cacheStats - Statistics for cache hits and misses.
 * @property {number} cacheStats.hits - Total number of cache hits.
 * @property {number} cacheStats.misses - Total number of cache misses.
 */

/**
 * Global object to track service call diagnostics, including latency and cache performance.
 * @type {ServiceDiagnostics}
 */
export const serviceDiagnostics = {
  calls: {},
  cacheStats: { hits: 0, misses: 0 }
};

/**
 * Registers a diagnostic entry for a service method call.
 * Tracks latency and cache status for performance monitoring.
 * @param {string} methodName - The name of the service method being called.
 * @param {number} latencyMs - The time taken for the operation in milliseconds.
 * @param {'HIT' | 'MISS'} cacheStatus - The cache status of the operation ('HIT' if from cache, 'MISS' otherwise).
 * @returns {void}
 */
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

/**
 * @typedef {Object} RealEstateAPIResponse
 * @property {Array<Object>} [results] - An array of results, common in RealEstateAPI responses.
 * @property {string} [message] - An optional message from the API.
 * // ... other potential properties
 */

/**
 * Core HTTP helper function to make requests to the RealEstateAPI.com API.
 * Handles API key authentication, JSON serialization, and error responses.
 * If `REALESTATE_API_KEY` is not configured, it returns `null` to trigger mock fallback.
 * @param {string} path - The API endpoint path (e.g., '/v2/PropertyDetail').
 * @param {Object} [body={}] - The request body for POST/PUT requests.
 * @param {'GET' | 'POST' | 'PUT' | 'DELETE'} [method='POST'] - The HTTP method to use.
 * @returns {Promise<RealEstateAPIResponse | null>} A promise that resolves to the JSON response from the API,
 *   or `null` if the API key is missing, or throws an error if the response is not OK.
 * @throws {Error} If the API response is not successful (response.ok is false).
 */
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

/**
 * Retrieves a value from the Redis cache.
 * The key is prefixed with 'realestate:' to avoid collisions.
 * @param {string} key - The unique identifier for the cached item.
 * @returns {Promise<Object | null>} A promise that resolves to the parsed JSON object if found, otherwise `null`.
 */
async function cacheGet(key) {
  try {
    const val = await RedisClient.get(`realestate:${key}`);
    return val ? JSON.parse(val) : null;
  } catch (error) {
    // Log the error but don't prevent the main logic from proceeding without cache
    logger.error(`[RealEstateService] Error getting from cache for key ${key}: ${error.message}`);
    return null;
  }
}

/**
 * Sets a value in the Redis cache with an expiration time.
 * The key is prefixed with 'realestate:' to avoid collisions.
 * @param {string} key - The unique identifier for the item to cache.
 * @param {Object} val - The JavaScript object to be cached (will be JSON.stringified).
 * @param {number} ttlSeconds - The time-to-live for the cached item in seconds.
 * @returns {Promise<void>} A promise that resolves when the item is set in cache.
 */
async function cacheSet(key, val, ttlSeconds) {
  try {
    await RedisClient.setEx(`realestate:${key}`, ttlSeconds, JSON.stringify(val));
  } catch (error) {
    // Log the error but don't prevent the main logic from proceeding without cache
    logger.error(`[RealEstateService] Error setting to cache for key ${key}: ${error.message}`);
  }
}

/**
 * Helper for consistent cache keys for objects by sorting keys before stringifying.
 * This prevents cache misses due to inconsistent key order in JSON.stringify.
 * @param {Object | string | number | boolean | null | undefined} obj - The object or primitive to generate a stable cache key for.
 * @returns {string} A stable string representation of the object suitable for use as a cache key.
 */
const getStableCacheKey = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return String(obj);
  }
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = obj[key];
  }
  return JSON.stringify(sortedObj);
};

/**
 * @typedef {Object} MockProperty
 * @property {string} id - Unique identifier for the property.
 * @property {string} address - Street address.
 * @property {string} city - City.
 * @property {string} state - State abbreviation.
 * @property {string} zip - Zip code.
 * @property {string} ownerName - Name of the property owner.
 * @property {number} yearBuilt - Year the property was built.
 * @property {number} beds - Number of bedrooms.
 * @property {number} baths - Number of bathrooms.
 * @property {number} sqft - Square footage of the property.
 * @property {number} lotSizeAcres - Lot size in acres.
 * @property {number} lastSalePrice - Price of the last sale.
 * @property {string | null} lastSaleDate - Date of the last sale (YYYY-MM-DD).
 * @property {number} taxAssessedValue - Tax assessed value of the property.
 */

/**
 * High-fidelity mock data for property details.
 * Used when the RealEstateAPI.com API key is not configured.
 * @type {MockProperty[]}
 */
const MOCK_PROPERTIES = [
  {
    id: 'prop_90210_1',
    address: '123 Main St',
    city: 'Atlanta',
    state: 'GA',
    zip: '30303',
    ownerName: 'Inso AIs Holdings LLC',
    yearBuilt: 2012,
    beds: 4,
    baths: 3.5,
    sqft: 3150,
    lotSizeAcres: 0.45,
    lastSalePrice: 334000,
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

/**
 * @typedef {Object} MockAvm
 * @property {number} valuation - Estimated property valuation.
 * @property {number} highValue - High end of the valuation range.
 * @property {number} lowValue - Low end of the valuation range.
 * @property {number} confidenceScore - Confidence score of the valuation (0-100).
 * @property {number} rentalValuation - Estimated monthly rental valuation.
 */

/**
 * High-fidelity mock data for Automated Valuation Model (AVM) results.
 * Used when the RealEstateAPI.com API key is not configured.
 * @type {Object.<string, MockAvm>}
 */
const MOCK_AVM = {
  prop_90210_1: { valuation: 672000, highValue: 710000, lowValue: 635000, confidenceScore: 88, rentalValuation: 3950 },
  prop_90210_2: { valuation: 535000, highValue: 565000, lowValue: 505000, confidenceScore: 92, rentalValuation: 3200 },
  prop_90210_3: { valuation: 485000000, highValue: 520000000, lowValue: 450000000, confidenceScore: 75, rentalValuation: 120000 }
};

/**
 * @typedef {Object} MockComp
 * @property {string} address - Address of the comparable property.
 * @property {number} distanceMiles - Distance from the subject property in miles.
 * @property {number} beds - Number of bedrooms.
 * @property {number} baths - Number of bathrooms.
 * @property {number} sqft - Square footage.
 * @property {number} salePrice - Sale price of the comparable.
 * @property {string} saleDate - Sale date (YYYY-MM-DD).
 */

/**
 * High-fidelity mock data for comparable sales.
 * Used when the RealEstateAPI.com API key is not configured.
 * @type {Object.<string, MockComp[]>}
 */
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

/**
 * @typedef {'SingleFamily' | 'Condominium' | 'Townhouse' | 'MultiFamily' | 'Land'} PropertyType
 */

/**
 * @typedef {Object} MockMlsListing
 * @property {string} address - Street address.
 * @property {string} city - City.
 * @property {string} state - State abbreviation.
 * @property {string} zip - Zip code.
 * @property {number} price - Listing price.
 * @property {number} beds - Number of bedrooms.
 * @property {number} baths - Number of bathrooms.
 * @property {number} sqft - Square footage.
 * @property {string} status - Listing status (e.g., 'Active', 'Pending', 'Sold').
 * @property {string} listDate - Date the property was listed (YYYY-MM-DD).
 * @property {number} daysOnMarket - Number of days the property has been on the market.
 * @property {PropertyType} propertyType - Type of property.
 */

/**
 * High-fidelity mock data for MLS listings.
 * Used when the RealEstateAPI.com API key is not configured.
 * @type {MockMlsListing[]}
 */
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

/**
 * @typedef {Object} MockSkipTraceDemographics
 * @property {string} netWorth - Estimated net worth range.
 * @property {string} creditRange - Estimated credit score range.
 */

/**
 * @typedef {Object} MockSkipTraceResult
 * @property {string} owner - Name of the owner.
 * @property {string[]} phoneNumbers - Array of phone numbers associated with the owner.
 * @property {string[]} emails - Array of email addresses associated with the owner.
 * @property {string} currentAddress - Current mailing address of the owner.
 * @property {MockSkipTraceDemographics} demographics - Demographic information about the owner.
 */

/**
 * High-fidelity mock data for skip trace results.
 * Used when the RealEstateAPI.com API key is not configured.
 * @type {Object.<string, MockSkipTraceResult>}
 */
const MOCK_SKIP = {
  prop_90210_1: {
    owner: 'Inso AIs Holdings LLC',
    phoneNumbers: ['(404) 555-0199', '(404) 555-0144'],
    emails: ['admin@insoaisholdings.com', 'acquisitions@insoaisholdings.com'],
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

/**
 * @typedef {Object} AutoCompleteResult
 * @property {string} address - The suggested full address.
 * @property {string} propId - The property ID associated with the suggested address.
 */

/**
 * AutoCompletes address strings to suggest real properties or standard layouts.
 * Fetches suggestions from RealEstateAPI.com or provides mock data if the API key is missing.
 * @param {string} text - The partial address string to autocomplete.
 * @returns {Promise<AutoCompleteResult[]>} A promise that resolves to an array of autocomplete suggestions.
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
 * @typedef {Object} PropertySearchCriteria
 * @property {string} [address] - Street address to search for.
 * @property {string} [city] - City to search within.
 * @property {string} [state] - State abbreviation to search within.
 * @property {string} [zip] - Zip code to search within.
 * // ... other potential search criteria
 */

/**
 * Searches properties based on specified criteria.
 * Fetches property search results from RealEstateAPI.com or provides mock data if the API key is missing.
 * @param {PropertySearchCriteria} criteria - An object containing search parameters like address, city, state, zip.
 * @returns {Promise<MockProperty[]>} A promise that resolves to an array of properties matching the criteria.
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
    // Bug fix: Return empty array if no matches, instead of an arbitrary first mock property.
    const data = matches;
    registerDiagnostic('searchPropertyService', Date.now() - start, 'MISS');
    return data;
  }

  const response = await reFetch('/v2/PropertySearch', criteria);
  registerDiagnostic('searchPropertyService', Date.now() - start, 'MISS');
  return response?.results || response;
};

/**
 * @typedef {string | { id?: string, propertyId?: string }} PropertyIdParams
 * Represents parameters for identifying a property, either by a direct ID string or an object containing `id` or `propertyId`.
 */

/**
 * Fetches comprehensive public record details for a property ID.
 * Retrieves data from cache, RealEstateAPI.com, or provides mock data.
 * @param {PropertyIdParams} idParams - The property ID as a string, or an object with `id` or `propertyId`.
 * @returns {Promise<MockProperty | null>} A promise that resolves to the detailed property object, or `null` if not found.
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
    // Bug fix: Return null if no mock property matches, instead of an arbitrary first mock property.
    const prop = MOCK_PROPERTIES.find(p => p.id === propId || p.address.toLowerCase().includes(String(propId).toLowerCase())) || null;
    if (prop) {
      await cacheSet(cacheKey, prop, TTL.detail);
    }
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
 * Retreives lender-grade property valuation estimates (AVM).
 * Retrieves data from cache, RealEstateAPI.com, or provides mock data.
 * @param {PropertyIdParams} idParams - The property ID as a string, or an object with `id` or `propertyId`.
 * @returns {Promise<MockAvm | null>} A promise that resolves to the AVM object, or `null` if not found.
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
    // Bug fix: Return null if no mock AVM matches, instead of an arbitrary first mock AVM.
    const avm = MOCK_AVM[propId] || null;
    if (avm) {
      await cacheSet(cacheKey, avm, TTL.avm);
    }
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
 * @typedef {Object} PropertyCompsParams
 * @property {string} [id] - The property ID.
 * @property {string} [propertyId] - The property ID (alternative to `id`).
 * @property {number} [radiusMiles] - Optional radius in miles to search for comps.
 * @property {number} [compsLimit] - Optional limit on the number of comparable properties to return.
 */

/**
 * Returns comparable sales in the nearby neighborhood for a given property.
 * Retrieves data from cache, RealEstateAPI.com, or provides mock data.
 * @param {PropertyIdParams | PropertyCompsParams} idParams - The property ID as a string, or an object with `id`, `propertyId`, `radiusMiles`, and `compsLimit`.
 * @returns {Promise<MockComp[]>} A promise that resolves to an array of comparable properties.
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
    // Bug fix: Return empty array if no mock comps match, instead of an arbitrary first mock comps.
    let comps = MOCK_COMPS[propId] || [];
    if (radiusMiles) {
      comps = comps.filter(c => c.distanceMiles <= radiusMiles);
    }
    if (compsLimit) {
      comps = comps.slice(0, compsLimit);
    }
    if (comps.length > 0) {
      await cacheSet(cacheKey, comps, TTL.comps);
    }
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
 * @typedef {Object} MlsSearchCriteria
 * @property {string} [city] - City to search within.
 * @property {string} [state] - State abbreviation to search within.
 * @property {string} [zip] - Zip code to search within.
 * @property {number} [minBeds] - Minimum number of bedrooms.
 * @property {number} [minBaths] - Minimum number of bathrooms.
 * @property {number} [minPrice] - Minimum listing price.
 * @property {number} [maxPrice] - Maximum listing price.
 * @property {PropertyType} [propertyType] - Type of property (e.g., 'SingleFamily', 'Condominium').
 * // ... other potential MLS search criteria
 */

/**
 * Queries the active listing MLS database for specific properties or city regions.
 * Retrieves data from cache, RealEstateAPI.com, or provides mock data.
 * @param {MlsSearchCriteria} criteria - An object containing search parameters for MLS listings.
 * @returns {Promise<MockMlsListing[]>} A promise that resolves to an array of MLS listings.
 */
export const searchMlsService = async (criteria) => {
  const start = Date.now();
  logger.info(`[RealEstateService] MLS Search: ${JSON.stringify(criteria)}`);

  // Bug fix: Use a stable cache key for criteria objects to prevent cache misses due to key order.
  const cacheKey = `mls:${getStableCacheKey(criteria)}`;
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

    // Bug fix: If no results match, return an empty array instead of an arbitrary default.
    // The previous logic `if (filtered.length === 0) { filtered = MOCK_MLS.filter(p => p.city.toLowerCase() === 'atlanta'); }`
    // was removed to ensure accurate mock behavior.
    if (filtered.length > 0) {
      await cacheSet(cacheKey, filtered, TTL.mls);
    }
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
 * Fetch skipped owner records (phones, emails, etc.) for a property ID.
 * Retrieves data from cache, RealEstateAPI.com, or provides mock data.
 * @param {PropertyIdParams} idParams - The property ID as a string, or an object with `id` or `propertyId`.
 * @returns {Promise<MockSkipTraceResult | null>} A promise that resolves to the skip trace result object, or `null` if not found.
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
    // Bug fix: Return null if no mock skip trace matches, instead of an arbitrary first mock trace.
    const trace = MOCK_SKIP[propId] || null;
    if (trace) {
      await cacheSet(cacheKey, trace, TTL.skip);
    }
    registerDiagnostic('getSkipTraceService', Date.now() - start, 'MISS');
    return trace;
  }

  const response = await reFetch('/v2/SkipTrace', typeof idParams === 'string' ? { propertyId: idParams } : idParams);
  const data = response?.results?.[0] || response;
  await cacheSet(cacheKey, data, TTL.skip);
  registerDiagnostic('getSkipTraceService', Date.now() - start, 'MISS');
  return data;
};

/**
 * Consolidated object exporting all RealEstateAPI service functions and diagnostics.
 * @type {Object}
 * @property {function(string): Promise<AutoCompleteResult[]>} autoCompleteService - Function to autocomplete addresses.
 * @property {function(PropertySearchCriteria): Promise<MockProperty[]>} searchPropertyService - Function to search properties by criteria.
 * @property {function(PropertyIdParams): Promise<MockProperty | null>} getPropertyDetailService - Function to get detailed property information.
 * @property {function(PropertyIdParams): Promise<MockAvm | null>} getPropertyAvmService - Function to get property AVM.
 * @property {function(PropertyIdParams | PropertyCompsParams): Promise<MockComp[]>} getPropertyCompsService - Function to get comparable sales.
 * @property {function(MlsSearchCriteria): Promise<MockMlsListing[]>} searchMlsService - Function to search MLS listings.
 * @property {function(PropertyIdParams): Promise<MockSkipTraceResult | null>} getSkipTraceService - Function to get skip trace records.
 * @property {ServiceDiagnostics} serviceDiagnostics - Object containing service call diagnostics.
 */
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