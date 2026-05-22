/**
 * aviationstack.service.js — AviationStack Real-Time Flight & Aviation Data Service
 *
 * Provides live flight tracking, airport schedules, routes, airline, and aircraft lookups.
 * Supports environment fallback and robust realistic mocks for keyless or failed requests.
 *
 * Base URL: http://api.aviationstack.com/v1/ (HTTPS for premium keys)
 * Auth:     access_key URL parameter (e.g. ?access_key=...)
 */

import dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import {
  getMETARTAFService,
  getFAANasStatusService,
  getFAANotamsService,
  getNTSBSafetyIncidentsService,
  getAlternateAirportsService
} from './aviationOpenData.service.js';

dotenv.config();

// Configuration
const BASE_URL = 'http://api.aviationstack.com/v1';
const getApiKey = () => (process.env.AVIATIONSTACK_API_KEY || '').replace(/^\uFEFF+/, '').trim();

// Local In-Memory Cache for fast fallbacks and static lookups
const memoryCache = new Map();

// Helper to determine if key is premium (https allowed)
const getApiUrl = (endpoint) => {
  const key = getApiKey();
  const protocol = process.env.AVIATIONSTACK_IS_PREMIUM === 'true' ? 'https' : 'http';
  return `${protocol}://api.aviationstack.com/v1/${endpoint}`;
};

// Caching TTLs
const TTL = {
  flights: 60,       // Live flights — 1 min
  routes: 300,       // Schedules — 5 mins
  airports: 3600,    // Airports — 1 hour
  airlines: 3600,    // Airlines — 1 hour
  airplanes: 3600,   // Planes — 1 hour
};

/**
 * Double-layer cache retriever
 */
async function getCachedData(cacheKey) {
  try {
    // 1. Check local memory cache
    if (memoryCache.has(cacheKey)) {
      const { data, expiresAt } = memoryCache.get(cacheKey);
      if (Date.now() < expiresAt) {
        return data;
      }
      memoryCache.delete(cacheKey);
    }

    // 2. Check Redis cache
    if (RedisClient?.enabled) {
      const val = await RedisClient.get(`aviation:${cacheKey}`);
      if (val) {
        const parsed = JSON.parse(val);
        // Sync back to memory cache
        memoryCache.set(cacheKey, { data: parsed, expiresAt: Date.now() + 60000 });
        return parsed;
      }
    }
  } catch (err) {
    logger.warn(`[AviationStack Cache] Read error: ${err.message}`);
  }
  return null;
}

/**
 * Double-layer cache writer
 */
async function setCachedData(cacheKey, data, ttl) {
  try {
    // 1. Save to local memory
    memoryCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + ttl * 1000,
    });

    // 2. Save to Redis
    if (RedisClient?.enabled) {
      await RedisClient.set(`aviation:${cacheKey}`, JSON.stringify(data), { EX: ttl });
    }
  } catch (err) {
    logger.warn(`[AviationStack Cache] Write error: ${err.message}`);
  }
}

/**
 * Universal Request Helper
 */
async function makeRequest(endpoint, params = {}) {
  const apiKey = getApiKey();
  const cacheKey = `${endpoint}:${JSON.stringify(params)}`;

  // Try retrieving from cache first for static/slow endpoints
  if (endpoint !== 'flights') {
    const cached = await getCachedData(cacheKey);
    if (cached) {
      logger.info(`[AviationStack Cache Hit] ${endpoint} -> ${JSON.stringify(params)}`);
      return cached;
    }
  }

  if (!apiKey) {
    logger.warn(`[AviationStack] API key missing. Using high-fidelity mock data fallback.`);
    return getMockData(endpoint, params);
  }

  // Construct URL
  const baseUrl = getApiUrl(endpoint);
  const queryParams = new URLSearchParams({
    access_key: apiKey,
    ...params,
  });

  const url = `${baseUrl}?${queryParams.toString()}`;
  logger.info(`[AviationStack API Call] Fetching: ${baseUrl} with params: ${JSON.stringify(params)}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AviationStack Error (${response.status}): ${errorText}`);
    }

    const json = await response.json();

    if (json.error) {
      throw new Error(`AviationStack API Error: ${json.error.message || JSON.stringify(json.error)}`);
    }

    // Cache the successful results
    const ttl = TTL[endpoint] || 60;
    await setCachedData(cacheKey, json.data, ttl);

    return json.data;
  } catch (err) {
    logger.error(`[AviationStack API Failed] ${err.message}. Falling back to mocks.`);
    return getMockData(endpoint, params);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPOSED API SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export const getFlightsService = async (params = {}) => {
  return makeRequest('flights', params);
};

export const getRoutesService = async (params = {}) => {
  return makeRequest('routes', params);
};

export const getAirportsService = async (params = {}) => {
  return makeRequest('airports', params);
};

export const getAirlinesService = async (params = {}) => {
  return makeRequest('airlines', params);
};

export const getAirplanesService = async (params = {}) => {
  return makeRequest('airplanes', params);
};

// Re-export open aviation database services
export {
  getMETARTAFService,
  getFAANasStatusService,
  getFAANotamsService,
  getNTSBSafetyIncidentsService,
  getAlternateAirportsService
};

// ═══════════════════════════════════════════════════════════════════════════════
// HIGH-FIDELITY REALISTIC MOCK DATA ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const AIRPORT_DB = {
  JFK: { name: 'John F Kennedy International', city: 'New York', country: 'United States', iata: 'JFK', icao: 'KJFK', timezone: 'America/New_York' },
  LHR: { name: 'Heathrow', city: 'London', country: 'United Kingdom', iata: 'LHR', icao: 'EGLL', timezone: 'Europe/London' },
  LAX: { name: 'Los Angeles International', city: 'Los Angeles', country: 'United States', iata: 'LAX', icao: 'KLAX', timezone: 'America/Los_Angeles' },
  ORD: { name: 'O\'Hare International', city: 'Chicago', country: 'United States', iata: 'ORD', icao: 'KORD', timezone: 'America/Chicago' },
  CDG: { name: 'Charles de Gaulle', city: 'Paris', country: 'France', iata: 'CDG', icao: 'LFPG', timezone: 'Europe/Paris' },
  AMS: { name: 'Schiphol', city: 'Amsterdam', country: 'Netherlands', iata: 'AMS', icao: 'EHAM', timezone: 'Europe/Amsterdam' },
  HND: { name: 'Haneda', city: 'Tokyo', country: 'Japan', iata: 'HND', icao: 'RJTT', timezone: 'Asia/Tokyo' },
  SIN: { name: 'Changi', city: 'Singapore', country: 'Singapore', iata: 'SIN', icao: 'WSSS', timezone: 'Asia/Singapore' },
  DXB: { name: 'Dubai International', city: 'Dubai', country: 'United Arab Emirates', iata: 'DXB', icao: 'OMDB', timezone: 'Asia/Dubai' },
  FRA: { name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', iata: 'FRA', icao: 'EDDF', timezone: 'Europe/Berlin' },
  SFO: { name: 'San Francisco International', city: 'San Francisco', country: 'United States', iata: 'SFO', icao: 'KSFO', timezone: 'America/Los_Angeles' },
  DFW: { name: 'Dallas/Fort Worth International', city: 'Dallas', country: 'United States', iata: 'DFW', icao: 'KDFW', timezone: 'America/Chicago' },
  DEN: { name: 'Denver International', city: 'Denver', country: 'United States', iata: 'DEN', icao: 'KDEN', timezone: 'America/Denver' },
  ATL: { name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta', country: 'United States', iata: 'ATL', icao: 'KATL', timezone: 'America/New_York' },
  SYD: { name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'Australia', iata: 'SYD', icao: 'YSSY', timezone: 'Australia/Sydney' },
  HKG: { name: 'Hong Kong International', city: 'Hong Kong', country: 'China', iata: 'HKG', icao: 'VHHH', timezone: 'Asia/Hong_Kong' },
  ICN: { name: 'Incheon International', city: 'Seoul', country: 'South Korea', iata: 'ICN', icao: 'RKSI', timezone: 'Asia/Seoul' },
  MUC: { name: 'Munich Airport', city: 'Munich', country: 'Germany', iata: 'MUC', icao: 'EDDM', timezone: 'Europe/Berlin' },
  ZRH: { name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland', iata: 'ZRH', icao: 'LSZH', timezone: 'Europe/Zurich' },
  CLT: { name: 'Charlotte Douglas International', city: 'Charlotte', country: 'United States', iata: 'CLT', icao: 'KCLT', timezone: 'America/New_York' },
  MIA: { name: 'Miami International', city: 'Miami', country: 'United States', iata: 'MIA', icao: 'KMIA', timezone: 'America/New_York' },
  SEA: { name: 'Seattle-Tacoma International', city: 'Seattle', country: 'United States', iata: 'SEA', icao: 'KSEA', timezone: 'America/Los_Angeles' },
};

const AIRLINE_DB = {
  UA: { name: 'United Airlines', iata: 'UA', icao: 'UAL', country: 'United States', fleet_size: 890, active: 850 },
  AA: { name: 'American Airlines', iata: 'AA', icao: 'AAL', country: 'United States', fleet_size: 960, active: 920 },
  DL: { name: 'Delta Air Lines', iata: 'DL', icao: 'DAL', country: 'United States', fleet_size: 940, active: 890 },
  BA: { name: 'British Airways', iata: 'BA', icao: 'BAW', country: 'United Kingdom', fleet_size: 280, active: 250 },
  LH: { name: 'Lufthansa', iata: 'LH', icao: 'DLH', country: 'Germany', fleet_size: 295, active: 270 },
  AF: { name: 'Air France', iata: 'AF', icao: 'AFR', country: 'France', fleet_size: 210, active: 190 },
  SQ: { name: 'Singapore Airlines', iata: 'SQ', icao: 'SIA', country: 'Singapore', fleet_size: 150, active: 140 },
  EK: { name: 'Emirates', iata: 'EK', icao: 'UAE', country: 'United Arab Emirates', fleet_size: 260, active: 250 },
  WN: { name: 'Southwest Airlines', iata: 'WN', icao: 'SWA', country: 'United States', fleet_size: 810, active: 790 },
  B6: { name: 'JetBlue', iata: 'B6', icao: 'JBU', country: 'United States', fleet_size: 290, active: 270 },
  NK: { name: 'Spirit Airlines', iata: 'NK', icao: 'NKS', country: 'United States', fleet_size: 200, active: 180 },
  FR: { name: 'Ryanair', iata: 'FR', icao: 'RYR', country: 'Ireland', fleet_size: 560, active: 540 },
  U2: { name: 'EasyJet', iata: 'U2', icao: 'EZY', country: 'United Kingdom', fleet_size: 330, active: 310 },
  QR: { name: 'Qatar Airways', iata: 'QR', icao: 'QTR', country: 'Qatar', fleet_size: 240, active: 230 },
  CX: { name: 'Cathay Pacific', iata: 'CX', icao: 'CPA', country: 'Hong Kong', fleet_size: 180, active: 160 },
  NH: { name: 'All Nippon Airways', iata: 'NH', icao: 'ANA', country: 'Japan', fleet_size: 210, active: 200 },
  QF: { name: 'Qantas', iata: 'QF', icao: 'QFA', country: 'Australia', fleet_size: 130, active: 120 },
  KL: { name: 'KLM Royal Dutch Airlines', iata: 'KL', icao: 'KLM', country: 'Netherlands', fleet_size: 110, active: 100 },
  AS: { name: 'Alaska Airlines', iata: 'AS', icao: 'ASA', country: 'United States', fleet_size: 330, active: 310 },
  VS: { name: 'Virgin Atlantic', iata: 'VS', icao: 'VIR', country: 'United Kingdom', fleet_size: 42, active: 39 },
  VA: { name: 'Virgin Australia', iata: 'VA', icao: 'VOZ', country: 'Australia', fleet_size: 90, active: 84 },
  AC: { name: 'Air Canada', iata: 'AC', icao: 'ACA', country: 'Canada', fleet_size: 190, active: 180 },
  JL: { name: 'Japan Airlines', iata: 'JL', icao: 'JAL', country: 'Japan', fleet_size: 165, active: 155 },
  KE: { name: 'Korean Air', iata: 'KE', icao: 'KAL', country: 'South Korea', fleet_size: 160, active: 150 },
  EY: { name: 'Etihad Airways', iata: 'EY', icao: 'ETD', country: 'United Arab Emirates', fleet_size: 85, active: 80 },
  TK: { name: 'Turkish Airlines', iata: 'TK', icao: 'THY', country: 'Turkey', fleet_size: 400, active: 380 },
};

function getMockData(endpoint, params) {
  const todayStr = new Date().toISOString().split('T')[0];

  if (endpoint === 'flights') {
    // Query by flight number
    const flightIata = (params.flight_iata || params.flight_icao || '').toUpperCase();
    let depIata = (params.dep_iata || '').toUpperCase();
    let arrIata = (params.arr_iata || '').toUpperCase();

    let flightNum = '123';
    let carrierCode = 'UA';

    if (params.airline_iata) {
      carrierCode = params.airline_iata.toUpperCase();
    } else if (flightIata) {
      // Prioritize standard 2-letter alphabetic carriers (like UA, AA, DL) so they don't get greedily matched as 3-char keys (like UA3)
      const match = flightIata.match(/^([A-Z]{2})(\d{1,4})$/) || flightIata.match(/^([A-Z0-9]{2,3})(\d{1,4})$/);
      if (match) {
        carrierCode = match[1];
        flightNum = match[2];
      }
    }

    const carrier = AIRLINE_DB[carrierCode] || { name: 'Global Carrier', iata: carrierCode, icao: carrierCode + 'L' };

    // Standard high-fidelity route setups
    if (!depIata && !arrIata) {
      if (carrierCode === 'BA' || carrierCode === 'BAW') {
        depIata = 'LHR';
        arrIata = 'JFK';
      } else {
        depIata = 'JFK';
        arrIata = 'LHR';
      }
    } else if (!depIata) {
      depIata = arrIata === 'JFK' ? 'LHR' : 'JFK';
    } else if (!arrIata) {
      arrIata = depIata === 'JFK' ? 'LHR' : 'JFK';
    }

    const depAirport = AIRPORT_DB[depIata] || { name: `${depIata} Airport`, city: depIata, country: 'International', iata: depIata, icao: 'K' + depIata, timezone: 'UTC' };
    const arrAirport = AIRPORT_DB[arrIata] || { name: `${arrIata} Airport`, city: arrIata, country: 'International', iata: arrIata, icao: 'E' + arrIata, timezone: 'UTC' };

    // Set timestamps dynamically
    const depTime = new Date();
    depTime.setHours(18, 0, 0, 0);
    const arrTime = new Date();
    arrTime.setHours(depTime.getHours() + 7, 30, 0, 0); // 7h30m flight

    const mockFlight = {
      flight_date: todayStr,
      flight_status: params.flight_status || 'active',
      departure: {
        airport: depAirport.name,
        timezone: depAirport.timezone,
        iata: depAirport.iata,
        icao: depAirport.icao,
        terminal: '4',
        gate: 'B22',
        delay: carrierCode === 'AA' ? 35 : null, // AA delayed in our mocks for diversity
        scheduled: depTime.toISOString(),
        estimated: depTime.toISOString(),
        actual: depTime.toISOString(),
        estimated_runway: null,
        actual_runway: null
      },
      arrival: {
        airport: arrAirport.name,
        timezone: arrAirport.timezone,
        iata: arrAirport.iata,
        icao: arrAirport.icao,
        terminal: '2',
        gate: 'A10',
        baggage: '5',
        delay: null,
        scheduled: arrTime.toISOString(),
        estimated: arrTime.toISOString(),
        actual: null,
        estimated_runway: null,
        actual_runway: null
      },
      airline: {
        name: carrier.name,
        iata: carrier.iata,
        icao: carrier.icao
      },
      flight: {
        number: flightNum,
        iata: `${carrier.iata}${flightNum}`,
        icao: `${carrier.icao}${flightNum}`,
        codeshared: null
      },
      aircraft: {
        registration: 'N104UA',
        iata: 'B772',
        icao: 'B772',
        icao24: 'A01E2E'
      },
      live: {
        updated: new Date().toISOString(),
        latitude: 45.1234,
        longitude: -40.5678,
        altitude: 35000,
        direction: 78,
        speed_horizontal: 540,
        speed_vertical: 0,
        is_ground: false
      }
    };

    return [mockFlight];
  }

  if (endpoint === 'routes') {
    const depIata = (params.dep_iata || 'JFK').toUpperCase();
    const arrIata = (params.arr_iata || 'LHR').toUpperCase();

    const routes = [
      {
        departure: { airport: AIRPORT_DB[depIata]?.name || depIata, iata: depIata, icao: 'K' + depIata, terminal: '4', time: '08:00:00' },
        arrival: { airport: AIRPORT_DB[arrIata]?.name || arrIata, iata: arrIata, icao: 'E' + arrIata, terminal: '2', time: '20:15:00' },
        airline: { name: 'United Airlines', iata: 'UA', icao: 'UAL' },
        flight: { number: '84', iata: 'UA84', icao: 'UAL84' }
      },
      {
        departure: { airport: AIRPORT_DB[depIata]?.name || depIata, iata: depIata, icao: 'K' + depIata, terminal: '8', time: '18:30:00' },
        arrival: { airport: AIRPORT_DB[arrIata]?.name || arrIata, iata: arrIata, icao: 'E' + arrIata, terminal: '3', time: '06:45:00' },
        airline: { name: 'British Airways', iata: 'BA', icao: 'BAW' },
        flight: { number: '178', iata: 'BA178', icao: 'BAW178' }
      },
      {
        departure: { airport: AIRPORT_DB[depIata]?.name || depIata, iata: depIata, icao: 'K' + depIata, terminal: '4', time: '21:00:00' },
        arrival: { airport: AIRPORT_DB[arrIata]?.name || arrIata, iata: arrIata, icao: 'E' + arrIata, terminal: '4', time: '09:20:00' },
        airline: { name: 'Delta Air Lines', iata: 'DL', icao: 'DAL' },
        flight: { number: '401', iata: 'DL401', icao: 'DAL401' }
      }
    ];

    return routes;
  }

  if (endpoint === 'airports') {
    const iata = (params.iata_code || '').toUpperCase();
    const icao = (params.icao_code || '').toUpperCase();
    const cityName = (params.city_name || '').toLowerCase();
    const countryName = (params.country_name || '').toLowerCase();

    // Try finding specific matches in database
    let matches = [];
    if (iata && AIRPORT_DB[iata]) {
      matches.push(AIRPORT_DB[iata]);
    } else if (icao) {
      const found = Object.values(AIRPORT_DB).find(a => a.icao === icao);
      if (found) matches.push(found);
    } else if (cityName || countryName) {
      matches = Object.values(AIRPORT_DB).filter(a => 
        (cityName && a.city.toLowerCase().includes(cityName)) ||
        (countryName && a.country.toLowerCase().includes(countryName))
      );
    }

    if (matches.length > 0) {
      return matches.map(airport => ({
        airport_name: airport.name,
        iata_code: airport.iata,
        icao_code: airport.icao,
        latitude: '40.639751',
        longitude: '-73.778925',
        timezone: airport.timezone,
        gmt: '-5',
        city_name: airport.city,
        country_name: airport.country,
        country_iso2: 'US'
      }));
    }

    // Default fallback
    const code = iata || 'JFK';
    return [
      {
        airport_name: `${code} International Airport`,
        iata_code: code,
        icao_code: `K${code}`,
        latitude: '0.000000',
        longitude: '0.000000',
        timezone: 'UTC',
        gmt: '0',
        city_name: 'Metropolis',
        country_name: 'United States',
        country_iso2: 'US'
      }
    ];
  }

  if (endpoint === 'airlines') {
    const iata = (params.iata_code || '').toUpperCase();
    const icao = (params.icao_code || '').toUpperCase();
    const airlineName = (params.airline_name || '').toLowerCase();

    let matches = [];
    if (iata && AIRLINE_DB[iata]) {
      matches.push(AIRLINE_DB[iata]);
    } else if (icao) {
      const found = Object.values(AIRLINE_DB).find(al => al.icao === icao);
      if (found) matches.push(found);
    } else if (airlineName) {
      matches = Object.values(AIRLINE_DB).filter(al => 
        al.name.toLowerCase().includes(airlineName)
      );
    }

    if (matches.length > 0) {
      return matches.map(airline => ({
        airline_name: airline.name,
        iata_code: airline.iata,
        icao_code: airline.icao,
        fleet_size: airline.fleet_size,
        fleet_average_age: '9.2',
        headquarters: `${airline.country}`,
        type: 'scheduled',
        status: 'active'
      }));
    }

    const code = iata || 'UA';
    return [{
      airline_name: 'Global Air Group',
      iata_code: code,
      icao_code: `${code}W`,
      fleet_size: '120',
      fleet_average_age: '8.4',
      headquarters: 'International',
      type: 'scheduled',
      status: 'active'
    }];
  }

  if (endpoint === 'airplanes') {
    const reg = (params.registration_number || 'N104UA').toUpperCase();
    return [{
      registration_number: reg,
      production_line: 'Boeing 777',
      model_name: '777-200ER',
      model_code: 'B772',
      iata_type: 'B772',
      icao_type: 'B772',
      airline_name: 'United Airlines',
      delivery_date: '1999-10-15',
      first_flight_date: '1999-09-02',
      plane_age: '26',
      engines_count: 2,
      engines_type: 'turbofan',
      plane_status: 'active'
    }];
  }

  return [];
}
