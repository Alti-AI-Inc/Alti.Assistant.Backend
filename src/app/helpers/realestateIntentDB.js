/**
 * realestateIntentDB.js — Real Estate Query Intent Classifier
 *
 * Implements high-performance intent matching and address extraction.
 */

// Regular expressions to match common address fragments
const ZIP_REGEX = /\b\d{5}(-\d{4})?\b/;
const STATE_REGEX = /\b(AL|AK|AS|AZ|AR|CA|CO|CT|DE|DC|FL|GA|GU|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|MP|OH|OK|OR|PW|PA|PR|RI|SC|SD|TN|TX|UT|VT|VI|VA|WA|WV|WI|WY)\b/i;

// Regex to capture typical street addresses: e.g., "123 Main St", "1600 Pennsylvania Ave NW", "456 Oak Lane"
const STREET_ADDRESS_REGEX = /\b\d+\s+[a-z0-9\.\s]+?\s+(street|st|avenue|ave|lane|ln|drive|dr|court|ct|road|rd|boulevard|blvd|way|circle|cir|highway|hwy|terrace|ter|place|pl|nw|ne|sw|se)\b/i;

// Keyword dictionaries
const INTENT_KEYWORDS = {
  property_avm: [
    'valuation', 'avm', 'home value', 'house worth', 'estimated value', 'appraisal', 
    'what is it worth', 'price estimate', 'property value', 'dscr', 'pmi', 'loan-to-value', 'ltv',
    'sell', 'commission', 'net sheet', 'net proceeds', 'netsheet',
    'buy box', 'buybox', 'prospectus', 'matching engine', 'investor criteria'
  ],
  property_comps: [
    'comps', 'comparable sales', 'sold homes near', 'recent sales', 'neighborhood sales', 
    'comparables', 'sold near'
  ],
  skip_trace: [
    'skip trace', 'owner contact', 'owner phone', 'owner email', 'lookup owner', 
    'who owns', 'property owner'
  ],
  mls_search: [
    'mls', 'listings', 'for sale', 'active listings', 'active properties', 'homes for sale',
    'real estate listings'
  ],
  property_detail: [
    'property details', 'lot size', 'year built', 'square footage', 'sqft', 'bedrooms', 
    'bathrooms', 'public records', 'tax assessment', 'zoning', 'insurance', 'hazard risk', 
    'replacement cost', 'premium', 'hazard',
    'flood', 'fema', 'zone a', 'zone ae', 'flood zone', 'flood risk'
  ]
};

/**
 * Parses address entities out of an unstructured query string.
 */
/**
 * Helper to parse price/numeric abbreviations like "500k" -> 500000, "1.2m" -> 1200000
 */
const parseNumericAbbreviation = (str) => {
  if (!str) return null;
  const clean = str.toLowerCase().replace(/[\$,]/g, '').trim();
  if (clean.endsWith('k')) {
    return parseFloat(clean) * 1000;
  }
  if (clean.endsWith('m') || clean.endsWith('million')) {
    return parseFloat(clean) * 1000000;
  }
  return parseFloat(clean);
};

export const parseAddressEntities = (query) => {
  const q = query.toLowerCase();

  const zipMatch = q.match(ZIP_REGEX);
  const zip = zipMatch ? zipMatch[0] : null;

  const stateMatch = q.match(STATE_REGEX);
  const state = stateMatch ? stateMatch[0].toUpperCase() : null;

  const addressMatch = q.match(STREET_ADDRESS_REGEX);
  const streetAddress = addressMatch ? addressMatch[0].trim() : null;

  // Extract all recognized locations dynamically
  const locations = [];
  const recognizedCities = [
    { key: 'atlanta', name: 'Atlanta', state: 'GA' },
    { key: 'atl', name: 'Atlanta', state: 'GA' },
    { key: 'austin', name: 'Austin', state: 'TX' },
    { key: 'washington', name: 'Washington', state: 'DC' },
    { key: 'los angeles', name: 'Los Angeles', state: 'CA' },
    { key: 'la', name: 'Los Angeles', state: 'CA' },
    { key: 'san francisco', name: 'San Francisco', state: 'CA' },
    { key: 'sf', name: 'San Francisco', state: 'CA' },
    { key: 'new york', name: 'New York', state: 'NY' },
    { key: 'nyc', name: 'New York', state: 'NY' },
    { key: 'miami', name: 'Miami', state: 'FL' },
    { key: 'mia', name: 'Miami', state: 'FL' }
  ];

  recognizedCities.forEach(c => {
    const regex = new RegExp(`\\b${c.key}\\b`, 'i');
    if (regex.test(q)) {
      if (!locations.some(loc => loc.city === c.name)) {
        locations.push({ city: c.name, state: c.state });
      }
    }
  });

  // Attempt to extract city: e.g., "in Atlanta, GA" or "in Atlanta"
  let city = null;
  const inCityMatch = q.match(/in\s+([a-z\s]+?)(?:,\s*|\s+)?(?:al|ak|az|ar|ca|co|ct|de|dc|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|\b)/i);
  if (inCityMatch) {
    city = inCityMatch[1].trim();
  }

  const CITY_NORMALIZATION_MAP = {
    'la': 'Los Angeles',
    'los angeles': 'Los Angeles',
    'nyc': 'New York',
    'new york': 'New York',
    'sf': 'San Francisco',
    'san francisco': 'San Francisco',
    'atl': 'Atlanta',
    'atlanta': 'Atlanta',
    'mia': 'Miami',
    'miami': 'Miami'
  };

  if (city && CITY_NORMALIZATION_MAP[city.toLowerCase()]) {
    city = CITY_NORMALIZATION_MAP[city.toLowerCase()];
  }

  if (!city) {
    if (q.includes(' nyc') || q.startsWith('nyc')) city = 'New York';
    else if (q.includes(' la ') || q.endsWith(' la') || q.startsWith('la ')) city = 'Los Angeles';
    else if (q.includes(' sf ') || q.endsWith(' sf') || q.startsWith('sf ')) city = 'San Francisco';
    else if (q.includes(' atl') || q.startsWith('atl')) city = 'Atlanta';
    else if (q.includes(' mia') || q.startsWith('mia')) city = 'Miami';
  }

  // Ensure primary city matches the first element in locations if available
  if (locations.length > 0) {
    city = locations[0].city;
  } else if (city) {
    const mapped = recognizedCities.find(c => c.name.toLowerCase() === city.toLowerCase());
    locations.push({ city, state: mapped ? mapped.state : state });
  }

  // ─── Price Limit Parsing
  let minPrice = null;
  let maxPrice = null;

  // "between X and Y"
  const betweenMatch = q.match(/between\s+\$?([\d\.,]+k|m|million|\d+)\s+and\s+\$?([\d\.,]+k|m|million|\d+)/i);
  if (betweenMatch) {
    minPrice = parseNumericAbbreviation(betweenMatch[1]);
    maxPrice = parseNumericAbbreviation(betweenMatch[2]);
  } else {
    // "under X", "below X", "less than X", "max price X", "up to X"
    const maxMatch = q.match(/(?:under|below|less\s+than|max|maximum|up\s+to)\s+\$?([\d\.,]+k|m|million|\d+)/i);
    if (maxMatch) {
      maxPrice = parseNumericAbbreviation(maxMatch[1]);
    }
    // "over X", "above X", "greater than X", "min price X", "at least X"
    const minMatch = q.match(/(?:over|above|greater\s+than|min|minimum|at\s+least)\s+\$?([\d\.,]+k|m|million|\d+)/i);
    if (minMatch) {
      minPrice = parseNumericAbbreviation(minMatch[1]);
    }
  }

  // ─── Beds/Baths Extraction
  let minBeds = null;
  let minBaths = null;

  const bedMatch = q.match(/(\d+)(?:\+|-|\s+)(?:bed|bd|bedroom|rooms?)/i) || q.match(/(?:at\s+least|min|minimum)\s+(\d+)\s+(?:bed|bd|bedroom)/i);
  if (bedMatch) {
    minBeds = parseInt(bedMatch[1], 10);
  }

  const bathMatch = q.match(/([\d\.]+)(?:\+|-|\s+)(?:bath|ba|bathroom)/i) || q.match(/(?:at\s+least|min|minimum)\s+([\d\.]+)\s+(?:bath|ba|bathroom)/i);
  if (bathMatch) {
    minBaths = parseFloat(bathMatch[1]);
  }

  // ─── Property Type Extraction
  let propertyType = null;
  if (q.includes('condo') || q.includes('condominium')) {
    propertyType = 'Condominium';
  } else if (q.includes('townhouse') || q.includes('townhome')) {
    propertyType = 'Townhouse';
  } else if (q.includes('multi-family') || q.includes('multi family') || q.includes('duplex') || q.includes('triplex') || q.includes('fourplex')) {
    propertyType = 'MultiFamily';
  } else if (q.includes('single family') || q.includes('single-family')) {
    propertyType = 'SingleFamily';
  }

  // ─── Custom Underwriting Parameters (e.g. "10% down", "7.5% interest")
  let downPaymentPct = null;
  let interestRate = null;
  let opexRatio = null;
  let customRent = null;

  const downPctMatch = q.match(/(\d+(?:\.\d+)?)\s*%\s*(?:down|downpayment|down\s+payment)/i);
  if (downPctMatch) {
    downPaymentPct = parseFloat(downPctMatch[1]) / 100;
  }

  const interestMatch = q.match(/(\d+(?:\.\d+)?)\s*%\s*(?:interest|rate|mortgage\s+rate|apr)/i) || q.match(/(?:interest\s+rate\s+of|rate\s+of)\s*(\d+(?:\.\d+)?)\s*%/i);
  if (interestMatch) {
    interestRate = parseFloat(interestMatch[1]) / 100;
  }

  const opexMatch = q.match(/(\d+(?:\.\d+)?)\s*%\s*(?:opex|operating\s+expense|operating\s+expenses|operating\s+ratio)/i);
  if (opexMatch) {
    opexRatio = parseFloat(opexMatch[1]) / 100;
  }

  const rentMatch = q.match(/(?:rent\s+of|rent\s+at|renting\s+for)\s*\$?([\d\.,]+)(?:\/mo|mo|monthly)?/i);
  if (rentMatch) {
    customRent = parseFloat(rentMatch[1].replace(/,/g, ''));
  }

  // ─── Buy-Box Constraints Extraction
  let minCapRate = null;
  const capRateMatch = q.match(/(?:min\s+cap\s+rate|minimum\s+cap\s+rate|cap\s+rate\s+of|target\s+cap\s+rate|min\s+cap)\s*(\d+(?:\.\d+)?)\s*%/i);
  if (capRateMatch) {
    minCapRate = parseFloat(capRateMatch[1]) / 100;
  }

  let minNetCashFlow = null;
  const cashFlowMatch = q.match(/(?:min\s+cash\s+flow|minimum\s+cash\s+flow|net\s+cash\s+flow\s+of|cash\s+flow\s+of|min\s+cashflow|min\s+flow)\s*\$?(-?\d+(?:\.\d+)?)(?:\/mo|mo|monthly)?/i);
  if (cashFlowMatch) {
    minNetCashFlow = parseFloat(cashFlowMatch[1].replace(/,/g, ''));
  }

  // Fallbacks for specific standard mock entities
  let baseEntities = {};
  if (q.includes('pennsylvania ave') || q.includes('white house')) {
    baseEntities = {
      propertyId: 'prop_90210_3',
      address: '1600 Pennsylvania Ave NW',
      city: 'Washington',
      state: 'DC',
      zip: '20500'
    };
  } else if (q.includes('main st') || q.includes('atlanta')) {
    baseEntities = {
      propertyId: 'prop_90210_1',
      address: '123 Main St',
      city: 'Atlanta',
      state: 'GA',
      zip: '30303'
    };
  } else if (q.includes('oak ln') || q.includes('austin')) {
    baseEntities = {
      propertyId: 'prop_90210_2',
      address: '456 Oak Ln',
      city: 'Austin',
      state: 'TX',
      zip: '78701'
    };
  } else {
    baseEntities = {
      address: streetAddress,
      city: city || (streetAddress ? null : 'Atlanta'), // Default mock fallback city
      state,
      zip
    };
  }

  // ─── Flood/FEMA Underwriting Flag
  const isMiamiQuery = (baseEntities.city || city || '').toLowerCase() === 'miami';
  const femaFloodActive = isMiamiQuery || ['flood', 'fema', 'zone a', 'zone ae'].some(k => q.includes(k));

  return {
    ...baseEntities,
    locations,
    minPrice,
    maxPrice,
    minBeds,
    minBaths,
    propertyType,
    downPaymentPct,
    interestRate,
    opexRatio,
    customRent,
    minCapRate,
    minNetCashFlow,
    femaFloodActive
  };
};

/**
 * Detects real estate query intent.
 * Returns { type: string, entities: Object } or null if query does not relate to real estate.
 */
export const detectRealEstateIntent = (query) => {
  if (!query || typeof query !== 'string') return null;

  const q = query.toLowerCase();

  // Broad real estate keywords
  const isRealEstateRelated = [
    'real estate', 'property', 'house', 'home value', 'owner of', 'mls listing', 
    'skip trace', 'comps', 'comparable sales', 'year built', 'tax assessed',
    'bedrooms', 'bathrooms', '123 main st', '456 oak ln', '1600 pennsylvania',
    'listings', 'active listings', 'for sale'
  ].some(k => q.includes(k));

  if (!isRealEstateRelated) return null;

  const entities = parseAddressEntities(query);

  // Check intent types by priority keywords
  for (const [intentType, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some(k => q.includes(k))) {
      return { type: intentType, entities };
    }
  }

  // Default intent fallback
  if (entities.address) {
    return { type: 'property_detail', entities };
  } else if (entities.city) {
    return { type: 'mls_search', entities };
  }

  return { type: 'property_detail', entities };
};
