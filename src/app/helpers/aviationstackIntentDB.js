/**
 * aviationstackIntentDB.js — Aviation Intent Classification & Database Parser
 *
 * Utilizes regex patterns to detect real-time aviation questions.
 * Helps classify queries into: flight status, flight schedules / routes,
 * airport metadata, airline fleets, and aircraft tail lookups.
 */

// Resolution dictionaries mapping natural language terms to IATA codes
const AIRPORT_NAME_TO_IATA = {
  'heathrow': 'LHR',
  'london heathrow': 'LHR',
  'jfk': 'JFK',
  'john f kennedy': 'JFK',
  'lax': 'LAX',
  'los angeles': 'LAX',
  'o\'hare': 'ORD',
  'ohare': 'ORD',
  'chicago ohare': 'ORD',
  'charles de gaulle': 'CDG',
  'cdg': 'CDG',
  'schiphol': 'AMS',
  'amsterdam schiphol': 'AMS',
  'haneda': 'HND',
  'tokyo haneda': 'HND',
  'changi': 'SIN',
  'singapore changi': 'SIN',
  'dubai': 'DXB',
  'dubai international': 'DXB',
  'frankfurt': 'FRA',
  'gatwick': 'LGW',
  'london gatwick': 'LGW',
  'san francisco': 'SFO',
  'sfo': 'SFO',
  'dallas': 'DFW',
  'dfw': 'DFW',
  'denver': 'DEN',
  'den': 'DEN',
  'atlanta': 'ATL',
  'atl': 'ATL',
  'sydney': 'SYD',
  'syd': 'SYD',
  'hong kong': 'HKG',
  'hkg': 'HKG',
  'incheon': 'ICN',
  'icn': 'ICN',
  'seoul': 'ICN',
  'munich': 'MUC',
  'muc': 'MUC',
  'zurich': 'ZRH',
  'zrh': 'ZRH',
  'charlotte': 'CLT',
  'clt': 'CLT',
  'miami': 'MIA',
  'mia': 'MIA',
  'seattle': 'SEA',
  'sea': 'SEA'
};

const AIRLINE_NAME_TO_IATA = {
  'united': 'UA',
  'united airlines': 'UA',
  'american': 'AA',
  'american airlines': 'AA',
  'delta': 'DL',
  'delta air lines': 'DL',
  'delta airlines': 'DL',
  'british airways': 'BA',
  'british': 'BA',
  'lufthansa': 'LH',
  'air france': 'AF',
  'singapore': 'SQ',
  'singapore airlines': 'SQ',
  'emirates': 'EK',
  'southwest': 'WN',
  'southwest airlines': 'WN',
  'jetblue': 'B6',
  'spirit': 'NK',
  'spirit airlines': 'NK',
  'ryanair': 'FR',
  'easyjet': 'U2',
  'qatar': 'QR',
  'qatar airways': 'QR',
  'cathay': 'CX',
  'cathay pacific': 'CX',
  'all nippon': 'NH',
  'ana': 'NH',
  'qantas': 'QF',
  'klm': 'KL',
  'alaska': 'AS',
  'alaska airlines': 'AS',
  'alaskan airlines': 'AS',
  'virgin': 'VS',
  'virgin atlantic': 'VS',
  'virgin airlines': 'VS',
  'virgin australia': 'VA',
  'air canada': 'AC',
  'japan airlines': 'JL',
  'jal': 'JL',
  'korean air': 'KE',
  'etihad': 'EY',
  'etihad airways': 'EY',
  'turkish': 'TK',
  'turkish airlines': 'TK',
  'fly emirates': 'EK'
};

const CITY_TO_IATA = {
  'new york': 'JFK',
  'nyc': 'JFK',
  'london': 'LHR',
  'los angeles': 'LAX',
  'chicago': 'ORD',
  'paris': 'CDG',
  'tokyo': 'HND',
  'singapore': 'SIN',
  'dubai': 'DXB',
  'frankfurt': 'FRA',
  'amsterdam': 'AMS',
  'san francisco': 'SFO',
  'dallas': 'DFW',
  'denver': 'DEN',
  'atlanta': 'ATL',
  'sydney': 'SYD',
  'hong kong': 'HKG',
  'seoul': 'ICN',
  'munich': 'MUC',
  'zurich': 'ZRH',
  'charlotte': 'CLT',
  'miami': 'MIA',
  'seattle': 'SEA'
};

/**
 * Parses and extracts intent from a natural language query.
 * Supports flight tracking numbers, IATA route pairs, resolved city-to-city routes,
 * resolved airport names, and resolved airline names.
 *
 * @param {string} query — User search query
 * @returns {Object|null} Classified intent or null if not an aviation query
 */
export function detectAviationIntent(query) {
  if (!query || typeof query !== 'string') return null;

  const lowerQuery = query.toLowerCase();

  // Phase 3: New Enterprise FAA & Airline Intelligence Suite Intents
  
  // 1. NOAA METAR / TAF Weather Report
  if (/\b(metar|taf)\b/i.test(lowerQuery) || /\b(weather|wind|visibility|clouds|flight rules|ceiling)\b/i.test(lowerQuery)) {
    let airportCode = null;
    const words = lowerQuery.match(/\b([a-z]{3,4})\b/gi) || [];
    for (const w of words) {
      const code = w.toUpperCase();
      if (AIRPORT_NAME_TO_IATA[w] || CITY_TO_IATA[w]) {
        airportCode = AIRPORT_NAME_TO_IATA[w] || CITY_TO_IATA[w];
        break;
      }
      if (/^[A-Z]{3,4}$/.test(code) && !/^(AND|THE|FOR|OUT|BET|SGP|EV|RSI|EMA|SMA|FED|CPI|GDP|USD|EUR|WIND|TAF|METAR)$/.test(code)) {
        airportCode = code.length === 4 && code.startsWith('K') ? code.substring(1) : code;
        break;
      }
    }
    if (!airportCode) airportCode = 'JFK';
    return {
      type: 'metar_taf',
      airportCode,
      queryText: query
    };
  }

  // 2. FAA NAS Delays & Ground Stops Status
  if (/\b(faa|ground\s*stop|ground\s*delay|nas\s*status|nas\s*delays?|gate\s*hold|faa\s*status)\b/i.test(lowerQuery) || 
      (/\b(delay|delays)\b/i.test(lowerQuery) && /\b(airport|faa|nas|ground|gate)\b/i.test(lowerQuery))) {
    let airportCode = null;
    const words = lowerQuery.match(/\b([a-z]{3,4})\b/gi) || [];
    for (const w of words) {
      const code = w.toUpperCase();
      if (AIRPORT_NAME_TO_IATA[w] || CITY_TO_IATA[w]) {
        airportCode = AIRPORT_NAME_TO_IATA[w] || CITY_TO_IATA[w];
        break;
      }
      if (/^[A-Z]{3,4}$/.test(code) && !/^(AND|THE|FOR|OUT|BET|SGP|EV|RSI|EMA|SMA|FED|CPI|GDP|USD|EUR|GATE|HOLD|STOP|DELAY|NAS|FAA)$/.test(code)) {
        airportCode = code.length === 4 && code.startsWith('K') ? code.substring(1) : code;
        break;
      }
    }
    if (!airportCode) airportCode = 'JFK';
    return {
      type: 'faa_nas',
      airportCode,
      queryText: query
    };
  }

  // 3. FAA NOTAM Active Notices
  if (/\b(notam|notams|notice\s+to\s+air\s+missions|notices?\s+to\s+air\s+missions|active\s+notices|runway\s+closure)\b/i.test(lowerQuery)) {
    let airportCode = null;
    const words = lowerQuery.match(/\b([a-z]{3,4})\b/gi) || [];
    for (const w of words) {
      const code = w.toUpperCase();
      if (AIRPORT_NAME_TO_IATA[w] || CITY_TO_IATA[w]) {
        airportCode = AIRPORT_NAME_TO_IATA[w] || CITY_TO_IATA[w];
        break;
      }
      if (/^[A-Z]{3,4}$/.test(code) && !/^(AND|THE|FOR|OUT|BET|SGP|EV|RSI|EMA|SMA|FED|CPI|GDP|USD|EUR|NOTAM|NOTAMS)$/.test(code)) {
        airportCode = code.length === 4 && code.startsWith('K') ? code.substring(1) : code;
        break;
      }
    }
    if (!airportCode) airportCode = 'JFK';
    return {
      type: 'notam',
      airportCode,
      queryText: query
    };
  }

  // 4. NTSB Safety Accidents Database
  if (/\b(ntsb|accident|incident|crash|crashes|safety\s*record|safety\s*report|safety\s*incident)\b/i.test(lowerQuery)) {
    let carrier = null;
    let model = null;

    for (const [name, code] of Object.entries(AIRLINE_NAME_TO_IATA)) {
      if (lowerQuery.includes(name)) {
        carrier = code;
        break;
      }
    }
    const carrierWords = lowerQuery.match(/\b([a-z]{2})\b/gi) || [];
    for (const w of carrierWords) {
      const code = w.toUpperCase();
      if (AIRLINE_NAME_TO_IATA[w.toLowerCase()]) {
        carrier = code;
        break;
      }
    }

    const boeingMatch = lowerQuery.match(/\b(boeing\s*\d{3}(?:\s*max\s*\d?)?|\b7\d{2}\b)/i);
    const airbusMatch = lowerQuery.match(/\b(airbus\s*a\d{3}|\ba\d{3}\b)/i);
    if (boeingMatch) {
      model = boeingMatch[0];
    } else if (airbusMatch) {
      model = airbusMatch[0];
    } else {
      const genModelMatch = lowerQuery.match(/\b(boeing|airbus|embraer|bombardier)\b/i);
      if (genModelMatch) model = genModelMatch[0];
    }

    return {
      type: 'safety_incident',
      carrier,
      model,
      queryText: query
    };
  }

  // 1. Flight status / search by flight number (e.g. "UA342 status", "flight AA123", "DL 456 delayed")
  // Matches carrier codes (2-3 letters) followed by 1-4 digits
  const flightRegex = /\b([a-z]{2,3})\s*(\d{1,4})\b/i;
  const flightMatch = lowerQuery.match(flightRegex);
  if (flightMatch) {
    const code = flightMatch[1].toUpperCase();
    const num = flightMatch[2];

    // Exclude false positives like standard currency codes, technical indices, and sports leagues
    const excludedCodes = new Set([
      'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'HKD', 'NZD', 'SEK',
      'RSI', 'EMA', 'SMA', 'MACD', 'EV', 'SGP', 'NFL', 'NBA', 'MLB', 'NHL', 'UFC',
      'JFK', 'LAX', 'LHR', 'ORD', 'CDG', 'DXB', 'AMS', 'HND', 'SIN', 'FRA',
      'AND', 'THE', 'FOR', 'OUT', 'BET', 'CPI', 'GDP'
    ]);

    if (/^[A-Z]{2,3}$/.test(code) && !excludedCodes.has(code)) {
      return {
        type: 'flight',
        flightNumber: `${code}${num}`,
        carrier: code,
        number: num,
      };
    }
  }

  // 2. Natural Language Route / Schedule search (e.g. "flights from London to Paris", "schedules between New York and London")
  const routeNLRegex = /(?:flights\s+(?:from|between)|schedules?\s+(?:from|between))\s+([a-z\s'\-]+?)\s+(?:to|and|->)\s+([a-z\s'\-]+?)(?:\s+tomorrow|\s+today|\s+flights|\s*$)/i;
  const routeNLMatch = lowerQuery.match(routeNLRegex);
  if (routeNLMatch) {
    const depStr = routeNLMatch[1].trim();
    const arrStr = routeNLMatch[2].trim();

    const resolveToIata = (str) => {
      const clean = str.toLowerCase().replace(/airport/g, '').trim();
      if (AIRPORT_NAME_TO_IATA[clean]) return AIRPORT_NAME_TO_IATA[clean];
      if (CITY_TO_IATA[clean]) return CITY_TO_IATA[clean];
      if (/^[A-Z]{3}$/.test(str.toUpperCase())) return str.toUpperCase();
      return null;
    };

    const depCode = resolveToIata(depStr);
    const arrCode = resolveToIata(arrStr);

    if (depCode && arrCode && depCode !== arrCode) {
      return {
        type: 'route',
        departure: depCode,
        arrival: arrCode,
      };
    }
  }

  // 3. IATA-based route schedule search (e.g. "JFK to LHR", "JFK -> LHR schedule", "schedules between LAX and ORD")
  // Matches airport pairs (3 letters each) separated by standard transit words
  const routeRegex = /\b([a-z]{3})\s*(?:to|->|-|arr|arrival|depart|departure|and)\s*([a-z]{3})\b/i;
  const routeMatch = lowerQuery.match(routeRegex);
  if (routeMatch) {
    const dep = routeMatch[1].toUpperCase();
    const arr = routeMatch[2].toUpperCase();

    // Verify both codes look like valid 3-letter IATA airport codes
    const isAirport = (code) => /^[A-Z]{3}$/.test(code) && !/^(AND|THE|FOR|OUT|BET|SGP|EV|RSI|EMA|SMA|FED|CPI|GDP|USD|EUR)$/.test(code);

    if (isAirport(dep) && isAirport(arr)) {
      return {
        type: 'route',
        departure: dep,
        arrival: arr,
      };
    }
  }

  // 4. Resolved Airport name search (e.g. "Heathrow airport status", "gate details for Changi")
  for (const [name, code] of Object.entries(AIRPORT_NAME_TO_IATA)) {
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(lowerQuery)) {
      if (/\b(airport|status|gate|delay|info|details|board|departures|arrivals|depart|arrive)\b/i.test(lowerQuery) || lowerQuery.includes(name)) {
        let boardType = 'both';
        if (/\b(departures|depart|departure)\b/i.test(lowerQuery)) {
          boardType = 'departures';
        } else if (/\b(arrivals|arrive|arrival)\b/i.test(lowerQuery)) {
          boardType = 'arrivals';
        }
        
        let carrier = null;
        for (const [alName, alCode] of Object.entries(AIRLINE_NAME_TO_IATA)) {
          if (new RegExp(`\\b${alName}\\b`, 'i').test(lowerQuery)) {
            carrier = alCode;
            break;
          }
        }

        return {
          type: 'airport',
          airportCode: code,
          boardType,
          carrier,
        };
      }
    }
  }

  // 5. Standard IATA-based Airport search (e.g. "JFK airport status", "airport details for LHR")
  const airportRegex = /\b([a-z]{3})\s*(?:airport|status|gate|delay|info|details|board|departures|arrivals|depart|arrive)\b/i;
  const airportMatch = lowerQuery.match(airportRegex);
  if (airportMatch) {
    const code = airportMatch[1].toUpperCase();
    if (/^[A-Z]{3}$/.test(code) && !/^(AND|THE|FOR|OUT|BET|SGP|EV|RSI|EMA|SMA|FED|CPI|GDP|USD|EUR)$/.test(code)) {
      let boardType = 'both';
      if (/\b(departures|depart|departure)\b/i.test(lowerQuery)) {
        boardType = 'departures';
      } else if (/\b(arrivals|arrive|arrival)\b/i.test(lowerQuery)) {
        boardType = 'arrivals';
      }

      let carrier = null;
      for (const [alName, alCode] of Object.entries(AIRLINE_NAME_TO_IATA)) {
        if (new RegExp(`\\b${alName}\\b`, 'i').test(lowerQuery)) {
          carrier = alCode;
          break;
        }
      }

      return {
        type: 'airport',
        airportCode: code,
        boardType,
        carrier,
      };
    }
  }

  // 6. Resolved Airline name search (e.g. "United Airlines fleet details", "Lufthansa operational status")
  for (const [name, code] of Object.entries(AIRLINE_NAME_TO_IATA)) {
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(lowerQuery)) {
      if (/\b(airline|carrier|fleet|details|info|status|operational|size|age|headquarters)\b/i.test(lowerQuery) || lowerQuery.includes(name)) {
        return {
          type: 'airline',
          carrier: code,
        };
      }
    }
  }

  // 7. Airplane tail number registration search (e.g. "plane tail number N104UA", "airplane registration N104UA")
  // Tail numbers typically start with N (US) or general standard formats
  const tailRegex = /\b(tail|registration|reg|plane|airplane|aircraft)\b.*\b([a-z0-9\-]{4,8})\b/i;
  const tailMatch = lowerQuery.match(tailRegex);
  if (tailMatch) {
    const reg = tailMatch[2].toUpperCase();
    // Verify it fits common registration length formats (e.g., N104UA, G-BOAC)
    if (/^[A-Z0-9\-]{4,8}$/.test(reg) && !/^(STATUS|DELAY|ROUTE|AIRLINE|AIRPORT|FLIGHT)$/.test(reg)) {
      return {
        type: 'airplane',
        registrationNumber: reg,
      };
    }
  }

  // General keyword checks for broad intent fallback
  const isAviationQuery = /\b(flight|flights|airline|airlines|airport|airports|airplane|airplanes|aircraft|tracking|delayed|cancelled|terminal|gate|takeoff|landing|boarding|baggage claim|luggage)\b/i.test(lowerQuery);
  if (isAviationQuery) {
    if (lowerQuery.includes('airport')) {
      return { type: 'airport_query' };
    }
    if (lowerQuery.includes('airline') || lowerQuery.includes('carrier') || lowerQuery.includes('fleet')) {
      return { type: 'airline_query' };
    }
    if (lowerQuery.includes('plane') || lowerQuery.includes('airplane') || lowerQuery.includes('aircraft') || lowerQuery.includes('tail number') || lowerQuery.includes('registration')) {
      return { type: 'airplane_query' };
    }
    return { type: 'general_aviation' };
  }

  return null;
}
export default { detectAviationIntent };
