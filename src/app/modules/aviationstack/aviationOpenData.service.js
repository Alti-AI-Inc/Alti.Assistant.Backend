/**
 * aviationOpenData.service.js — Open Aviation Database Services (FAA, NOAA, NTSB)
 *
 * Implements endpoints and mock adapters for:
 * 1. NOAA/AWC Aviation Weather: METAR (current observations) and TAF (forecasts).
 * 2. FAA NAS Status: U.S. airport status, ground stops, ground delays, and delay reasons.
 * 3. FAA NOTAMs: Notice to Air Missions active flight restrictions and airport notices.
 * 4. NTSB Safety: Historical civil aviation safety reports and accident logs.
 */

import dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';

dotenv.config();

// Helpers to read API configurations if configured by enterprise developers
const getFAAApiKey = () => (process.env.FAA_API_KEY || '').trim();
const getNOAAWeatherUrl = (airport) => `https://aviationweather.gov/api/data/metar?ids=${airport.toUpperCase()}&format=json`;

/**
 * 1. METAR / TAF Weather Service
 */
export async function getMETARTAFService(airportCode) {
  if (!airportCode) return null;
  const airport = airportCode.toUpperCase();

  try {
    // If API endpoint setup is requested, we would fetch from NOAA here
    // const response = await fetch(getNOAAWeatherUrl(airport));
    // ...
    // For now, let's use the robust enterprise mock generator below to simulate high-fidelity data:
    return generateMockMETARTAF(airport);
  } catch (err) {
    logger.error(`[AviationOpenData Service] METAR/TAF failed for ${airport}: ${err.message}`);
    return generateMockMETARTAF(airport);
  }
}

/**
 * 2. FAA NAS Delay & Ground Stop Status Service
 */
export async function getFAANasStatusService(airportCode) {
  if (!airportCode) return null;
  const airport = airportCode.toUpperCase();

  try {
    // Under live FAA conditions: fetch('https://nasstatus.faa.gov/api/airport-status-information')
    return generateMockFAANasStatus(airport);
  } catch (err) {
    logger.error(`[AviationOpenData Service] FAA NAS Status failed for ${airport}: ${err.message}`);
    return generateMockFAANasStatus(airport);
  }
}

/**
 * 3. FAA NOTAM Active Notices Service
 */
export async function getFAANotamsService(airportCode) {
  if (!airportCode) return [];
  const airport = airportCode.toUpperCase();

  try {
    // Under live FAA conditions: fetch NOTAM Management Service
    return generateMockNOTAMs(airport);
  } catch (err) {
    logger.error(`[AviationOpenData Service] NOTAM service failed for ${airport}: ${err.message}`);
    return generateMockNOTAMs(airport);
  }
}

/**
 * 4. NTSB Safety Accident Database Service
 */
export async function getNTSBSafetyIncidentsService(params = {}) {
  const carrier = params.carrier ? params.carrier.toUpperCase() : null;
  const model = params.model ? params.model.toUpperCase() : null;

  try {
    // Under live conditions: query NTSB Aviation API search endpoints
    return generateMockNTSBSafety(carrier, model);
  } catch (err) {
    logger.error(`[AviationOpenData Service] NTSB database failed: ${err.message}`);
    return generateMockNTSBSafety(carrier, model);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HIGH-FIDELITY ENTERPRISE MOCK DATA GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

// Helper to generate a deterministic hash value from a 3-letter IATA code
function getAirportHash(airport) {
  const code = (airport || '').toUpperCase().trim();
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) % 1000000;
  }
  return hash;
}

function generateMockMETARTAF(airport) {
  const now = new Date();
  const timeStr = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const obsDay = now.getUTCDate().toString().padStart(2, '0');
  const obsHour = now.getUTCHours().toString().padStart(2, '0');
  const obsMin = now.getUTCMinutes().toString().padStart(2, '0');

  // Dynamically assign weather profile based on airport code for realistic output variety
  let flightCategory = 'VFR';
  let windSpeed = 12;
  let windGust = 0;
  let windDir = 270;
  let visibility = 10;
  let temp = 16;
  let dewpoint = 8;
  let altimeter = 29.92;
  let rawSkyCover = 'FEW025';
  let skyConditions = [{ sky_cover: 'FEW', cloud_base_ft_agl: 2500 }];

  if (airport === 'JFK') {
    flightCategory = 'IFR';
    windSpeed = 18;
    windGust = 25;
    windDir = 190;
    visibility = 2;
    temp = 12;
    dewpoint = 11;
    altimeter = 29.74;
    rawSkyCover = 'OVC008';
    skyConditions = [
      { sky_cover: 'OVC', cloud_base_ft_agl: 800 }
    ];
  } else if (airport === 'LHR') {
    flightCategory = 'MVFR';
    windSpeed = 8;
    windDir = 240;
    visibility = 4;
    temp = 14;
    dewpoint = 11;
    altimeter = 30.12;
    rawSkyCover = 'BKN018';
    skyConditions = [
      { sky_cover: 'BKN', cloud_base_ft_agl: 1800 }
    ];
  } else if (airport === 'ORD') {
    flightCategory = 'LIFR';
    windSpeed = 22;
    windGust = 30;
    windDir = 330;
    visibility = 0.5;
    temp = 3;
    dewpoint = 2;
    altimeter = 29.56;
    rawSkyCover = 'OVC003';
    skyConditions = [
      { sky_cover: 'OVC', cloud_base_ft_agl: 300 }
    ];
  } else {
    // Deterministic hashing generator for any other global airport queried keylessly
    const hash = getAirportHash(airport);
    
    windSpeed = 5 + (hash % 21); // 5 to 25 knots
    windGust = (hash % 7 === 0) ? windSpeed + 5 + (hash % 10) : 0;
    windDir = ((hash * 13) % 36) * 10;
    temp = 5 + (hash % 26); // 5 to 30 deg C
    dewpoint = Math.max(-5, temp - 1 - (hash % 6)); // Dewpoint <= temp
    altimeter = Number((29.50 + ((hash % 100) / 100) * 0.8).toFixed(2));
    
    const catIndex = hash % 4;
    if (catIndex === 0) {
      flightCategory = 'VFR';
      visibility = 10;
      rawSkyCover = 'FEW035';
      skyConditions = [{ sky_cover: 'FEW', cloud_base_ft_agl: 3500 }];
    } else if (catIndex === 1) {
      flightCategory = 'MVFR';
      visibility = 4;
      rawSkyCover = 'BKN022';
      skyConditions = [{ sky_cover: 'BKN', cloud_base_ft_agl: 2200 }];
    } else if (catIndex === 2) {
      flightCategory = 'IFR';
      visibility = 2;
      rawSkyCover = 'OVC009';
      skyConditions = [{ sky_cover: 'OVC', cloud_base_ft_agl: 900 }];
    } else {
      flightCategory = 'LIFR';
      visibility = 0.75;
      rawSkyCover = 'OVC004';
      skyConditions = [{ sky_cover: 'OVC', cloud_base_ft_agl: 400 }];
    }
  }

  const windStr = windGust > 0 ? `${windDir}${windSpeed}G${windGust}KT` : `${windDir}${windSpeed}KT`;
  const tempStr = temp < 10 ? `0${temp}` : `${temp}`;
  const dpStr = dewpoint < 10 ? `0${dewpoint}` : `${dewpoint}`;
  const rawMetarText = `${airport} ${obsDay}${obsHour}${obsMin}Z ${windStr} ${visibility}SM ${rawSkyCover} ${tempStr}/${dpStr} A${altimeter.toString().replace('.', '')} NOSIG`;

  const getNextCategory = (cat) => {
    if (cat === 'VFR') return 'MVFR';
    if (cat === 'MVFR') return 'IFR';
    if (cat === 'IFR') return 'LIFR';
    return 'VFR';
  };
  const getCategoryVisibility = (cat) => {
    if (cat === 'VFR') return 10;
    if (cat === 'MVFR') return 4;
    if (cat === 'IFR') return 2;
    return 0.5;
  };
  let cat1, cat2, cat3, cat4;
  if (airport === 'JFK') {
    cat1 = 'VFR';
    cat2 = 'MVFR';
    cat3 = 'IFR';
    cat4 = 'LIFR';
  } else {
    cat1 = flightCategory;
    cat2 = getNextCategory(cat1);
    cat3 = getNextCategory(cat2);
    cat4 = getNextCategory(cat3);
  }

  return {
    airport,
    metar: {
      raw_text: rawMetarText,
      station_id: airport,
      observation_time: now.toISOString(),
      temp_c: temp,
      dewpoint_c: dewpoint,
      wind_dir_degrees: windDir,
      wind_speed_kt: windSpeed,
      wind_gust_kt: windGust > 0 ? windGust : null,
      visibility_statute_mi: visibility,
      altim_in_hg: altimeter,
      flight_category: flightCategory,
      sky_condition: skyConditions
    },
    taf: {
      station_id: airport,
      issue_time: now.toISOString(),
      raw_text: `TAF ${airport} ${obsDay}1730Z ${obsDay}18/${obsDay+1}24 ${windStr} P6SM ${rawSkyCover} FM${obsDay}2200 27014KT P6SM BKN030`,
      forecasts: [
        {
          start_time: now.toISOString(),
          end_time: new Date(now.getTime() + 3 * 3600000).toISOString(),
          wind_dir_degrees: windDir,
          wind_speed_kt: windSpeed,
          visibility_statute_mi: getCategoryVisibility(cat1),
          flight_category: cat1,
          sky_condition: [{ sky_cover: cat1 === 'VFR' ? 'FEW' : 'OVC', cloud_base_ft_agl: cat1 === 'VFR' ? 3500 : 800 }]
        },
        {
          start_time: new Date(now.getTime() + 3 * 3600000).toISOString(),
          end_time: new Date(now.getTime() + 6 * 3600000).toISOString(),
          wind_dir_degrees: (windDir + 20) % 360,
          wind_speed_kt: Math.max(5, windSpeed - 2),
          visibility_statute_mi: getCategoryVisibility(cat2),
          flight_category: cat2,
          sky_condition: [{ sky_cover: cat2 === 'VFR' ? 'FEW' : 'OVC', cloud_base_ft_agl: cat2 === 'VFR' ? 3500 : 800 }]
        },
        {
          start_time: new Date(now.getTime() + 6 * 3600000).toISOString(),
          end_time: new Date(now.getTime() + 9 * 3600000).toISOString(),
          wind_dir_degrees: (windDir + 40) % 360,
          wind_speed_kt: Math.max(5, windSpeed + 4),
          visibility_statute_mi: getCategoryVisibility(cat3),
          flight_category: cat3,
          sky_condition: [{ sky_cover: cat3 === 'VFR' ? 'FEW' : 'OVC', cloud_base_ft_agl: cat3 === 'VFR' ? 3500 : 800 }]
        },
        {
          start_time: new Date(now.getTime() + 9 * 3600000).toISOString(),
          end_time: new Date(now.getTime() + 12 * 3600000).toISOString(),
          wind_dir_degrees: windDir,
          wind_speed_kt: windSpeed,
          visibility_statute_mi: getCategoryVisibility(cat4),
          flight_category: cat4,
          sky_condition: [{ sky_cover: cat4 === 'VFR' ? 'FEW' : 'OVC', cloud_base_ft_agl: cat4 === 'VFR' ? 3500 : 800 }]
        }
      ]
    }
  };
}

function generateMockFAANasStatus(airport) {
  // Delays vary dynamically based on the airport input
  let status = 'Normal Operations';
  let groundStopActive = false;
  let groundDelayActive = false;
  let stopDetails = null;
  let delayDetails = null;

  if (airport === 'JFK') {
    status = 'FAA Ground Stop Active';
    groundStopActive = true;
    stopDetails = {
      reason: 'Thunderstorms / Low Visibility',
      end_time: '23:30 UTC',
      avg_delay: '55 minutes',
      scope: 'All arrivals from East Coast / Midwest'
    };
  } else if (airport === 'SFO') {
    status = 'FAA Ground Delay Program Active';
    groundDelayActive = true;
    delayDetails = {
      reason: 'Volume / SFO Runway Surface Maintenance',
      avg_delay: '42 minutes',
      max_delay: '78 minutes',
      scope: 'Domestic arrivals'
    };
  } else if (airport === 'ORD') {
    status = 'General Operational Airspace Delays';
    delayDetails = {
      reason: 'Staffing / Heavy Snow Volume',
      avg_delay: '18 minutes',
      max_delay: '35 minutes',
      scope: 'Standard terminal arrivals'
    };
  } else {
    // Deterministic hashing generator for any other airport
    const hash = getAirportHash(airport);
    const delayType = hash % 5;
    
    if (delayType === 0) {
      status = 'FAA Ground Stop Active';
      groundStopActive = true;
      stopDetails = {
        reason: 'Severe Convective Activity & Lightning',
        end_time: '22:00 UTC',
        avg_delay: `${30 + (hash % 60)} minutes`,
        scope: 'All incoming flights'
      };
    } else if (delayType === 1) {
      status = 'FAA Ground Delay Program Active';
      groundDelayActive = true;
      delayDetails = {
        reason: 'Airspace Congestion / Low Ceiling',
        avg_delay: `${25 + (hash % 35)} minutes`,
        max_delay: `${50 + (hash % 50)} minutes`,
        scope: 'Arrivals within 500nm'
      };
    } else if (delayType === 2) {
      status = 'General Operational Airspace Delays';
      delayDetails = {
        reason: 'High Wind Advisories',
        avg_delay: `${15 + (hash % 15)} minutes`,
        max_delay: `${30 + (hash % 20)} minutes`,
        scope: 'Westbound routes'
      };
    } else {
      status = 'Normal Operations';
    }
  }

  return {
    airport,
    national_airspace_system_status: status,
    ground_stop: groundStopActive ? stopDetails : null,
    ground_delay: groundDelayActive ? delayDetails : null,
    gate_holds: airport === 'LAX' ? { reason: 'Volume', avg_delay: '15m' } : null,
    updated_at: new Date().toISOString()
  };
}

function generateMockNOTAMs(airport) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);

  const baseNotams = [
    {
      id: `A${Math.floor(Math.random() * 8000 + 1000)}/26`,
      class: 'Runway Operations',
      priority: 'Immediate',
      effective_start: now.toISOString(),
      effective_end: tomorrow.toISOString(),
      text: `RWY 28L/10R CLOSED FOR ANNUAL RETAR AND REFACING MAINTENANCE INC SIGNALS`
    },
    {
      id: `B${Math.floor(Math.random() * 8000 + 1000)}/26`,
      class: 'Navigational Aids',
      priority: 'Standard',
      effective_start: now.toISOString(),
      effective_end: new Date(now.getTime() + 5 * 86400000).toISOString(),
      text: `VOR/DME INTERMITTENT OR UNUSABLE ON RADIALS 090 THROUGH 120 DUE TO TRANSIENT CALIBRATION TEST`
    },
    {
      id: `C${Math.floor(Math.random() * 8000 + 1000)}/26`,
      class: 'Airport Safety Services',
      priority: 'Standard',
      effective_start: now.toISOString(),
      effective_end: new Date(now.getTime() + 10 * 86400000).toISOString(),
      text: `OBSTRUCTION LIGHT ON TOWER 1.5 MILES WEST OF FIELD DEGRADED / OUT OF SERVICE`
    }
  ];

  return baseNotams;
}

function generateMockNTSBSafety(carrier, model) {
  const incidents = [
    {
      accident_number: 'ERA26FA142',
      event_date: '2026-04-12',
      location: 'Boston Logan Int\'l Airport, MA',
      operator: 'United Airlines (UA)',
      aircraft_model: 'Boeing 737 Max 9',
      severity: 'Non-fatal / Substantial Damage',
      summary: 'Nose landing gear steering cylinder sensor malfunction resulting in landing centerline excursion. Investigation indicates sensor calibration error from supplier. Safety Recommendation FAA-26-402 issued immediately to inspect all 737 Max landing gears.'
    },
    {
      accident_number: 'WPR25IA084',
      event_date: '2025-11-28',
      location: 'Los Angeles International Airport, CA',
      operator: 'Delta Air Lines (DL)',
      aircraft_model: 'Airbus A321Neo',
      severity: 'Non-fatal / No Damage',
      summary: 'Cabin altitude warning decompression event at flight level 340. The crew successfully executed emergency descent to 10,000 ft and landed safely. Discovered faulty cabin outflow valve feedback transducer.'
    },
    {
      accident_number: 'CEN25FA192',
      event_date: '2025-06-15',
      location: 'Dallas Fort Worth Int\'l Airport, TX',
      operator: 'American Airlines (AA)',
      aircraft_model: 'Boeing 777-200ER',
      severity: 'Non-fatal / Minor Damage',
      summary: 'Left engine bird strike during climb-out. Turbine blade deformation occurred. The crew executed immediate engine shutdown and returned to DFW without further incident. Post-flight check confirmed ingested bird remains.'
    }
  ];

  // Filtering logic to simulate accurate database matching
  return incidents.filter(inc => {
    if (carrier) {
      const match = inc.operator.toLowerCase().includes(carrier.toLowerCase());
      if (!match) return false;
    }
    if (model) {
      const cleanModel = model.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanDbModel = inc.aircraft_model.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = cleanDbModel.includes(cleanModel) || cleanModel.includes(cleanDbModel);
      if (!match) return false;
    }
    return true;
  });
}

// Alternates database for dynamic dispatcher auto-routing contingencies
const ALTERNATES_DB = {
  JFK: [
    { code: 'LGA', name: 'LaGuardia Airport', distance_nm: 9, bearing: 340 },
    { code: 'EWR', name: 'Newark Liberty International', distance_nm: 18, bearing: 260 },
    { code: 'PHL', name: 'Philadelphia International', distance_nm: 83, bearing: 235 }
  ],
  LHR: [
    { code: 'LGW', name: 'London Gatwick', distance_nm: 25, bearing: 165 },
    { code: 'STN', name: 'London Stansted', distance_nm: 41, bearing: 35 },
    { code: 'LTN', name: 'London Luton', distance_nm: 27, bearing: 345 }
  ],
  ORD: [
    { code: 'MDW', name: 'Chicago Midway', distance_nm: 13, bearing: 145 },
    { code: 'MKE', name: 'Milwaukee Mitchell International', distance_nm: 58, bearing: 355 },
    { code: 'IND', name: 'Indianapolis International', distance_nm: 154, bearing: 150 }
  ],
  ATL: [
    { code: 'CLT', name: 'Charlotte Douglas International', distance_nm: 196, bearing: 65 },
    { code: 'BHM', name: 'Birmingham-Shuttlesworth International', distance_nm: 116, bearing: 265 },
    { code: 'GSP', name: 'Greenville-Spartanburg International', distance_nm: 133, bearing: 50 }
  ]
};

export async function getAlternateAirportsService(airportCode) {
  if (!airportCode) return [];
  const airport = airportCode.toUpperCase().trim();
  let alternatesList = ALTERNATES_DB[airport];
  
  if (!alternatesList) {
    const hash = getAirportHash(airport);
    // Generate deterministic 3-letter IATA codes for alternates that aren't the same as airport
    const codes = [
      String.fromCharCode(65 + (hash % 26), 65 + ((hash + 3) % 26), 65 + ((hash + 7) % 26)),
      String.fromCharCode(65 + ((hash + 11) % 26), 65 + ((hash + 17) % 26), 65 + ((hash + 19) % 26)),
      String.fromCharCode(65 + ((hash + 23) % 26), 65 + ((hash + 29) % 26), 65 + ((hash + 31) % 26))
    ].map(c => c === airport ? (c === 'JFK' ? 'LAX' : 'JFK') : c);

    alternatesList = [
      { code: codes[0], name: `${codes[0]} Regional Airport`, distance_nm: 15 + (hash % 45), bearing: (hash * 7) % 360 },
      { code: codes[1], name: `${codes[1]} Municipal Airport`, distance_nm: 40 + (hash % 65), bearing: (hash * 13) % 360 },
      { code: codes[2], name: `${codes[2]} International Airport`, distance_nm: 95 + (hash % 110), bearing: (hash * 19) % 360 }
    ];
  }

  // Now, fetch the METAR and NAS delays for each alternate!
  const results = await Promise.all(
    alternatesList.map(async (alt) => {
      try {
        const weather = await getMETARTAFService(alt.code);
        const nas = await getFAANasStatusService(alt.code);
        return {
          ...alt,
          weather,
          nas
        };
      } catch (e) {
        return {
          ...alt,
          weather: null,
          nas: null
        };
      }
    })
  );

  return results;
}
