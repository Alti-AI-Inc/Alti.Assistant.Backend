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

// ─── Phase 7 compliance & operations data feeds ──────────────────────────────

export async function getFlightFuelPlanningService(model, durationHours) {
  const cleanModel = (model || '737').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let burnRate = 6000; // lbs/hour
  let maxPayload = 50000; // lbs

  if (cleanModel.includes('737')) {
    burnRate = 5500;
    maxPayload = 48500;
  } else if (cleanModel.includes('777')) {
    burnRate = 15000;
    maxPayload = 130000;
  } else if (cleanModel.includes('320')) {
    burnRate = 5200;
    maxPayload = 42000;
  } else if (cleanModel.includes('321')) {
    burnRate = 5800;
    maxPayload = 47000;
  } else if (cleanModel.includes('787')) {
    burnRate = 11500;
    maxPayload = 105000;
  } else if (cleanModel.includes('350')) {
    burnRate = 12000;
    maxPayload = 115000;
  }

  const tripFuel = Math.round(burnRate * (durationHours || 6.5));
  const contingencyFuel = Math.max(1500, Math.round(tripFuel * 0.05));
  const alternateFuel = 2500;
  const holdingFuel = Math.round(0.5 * burnRate); // 30 min hold at burnRate
  const reserveFuel = Math.round(0.75 * burnRate); // 45 min FAA reserve
  const minDispatchFuel = tripFuel + contingencyFuel + alternateFuel + holdingFuel + reserveFuel;

  const targetPayload = Math.round(maxPayload * 0.82);

  return {
    model: model || 'Boeing 737 Max 9',
    burn_rate_lbs_hr: burnRate,
    max_structural_payload_lbs: maxPayload,
    target_payload_lbs: targetPayload,
    trip_fuel_lbs: tripFuel,
    contingency_fuel_lbs: contingencyFuel,
    alternate_fuel_lbs: alternateFuel,
    holding_fuel_lbs: holdingFuel,
    reserve_fuel_lbs: reserveFuel,
    min_dispatch_fuel_lbs: minDispatchFuel,
    payload_margin_lbs: maxPayload - targetPayload,
    compliance_status: '🟢 WITHIN DISPATCH WEIGHT LIMITS'
  };
}

export async function getCurfewComplianceService(airportCode, etaTimeStr) {
  const airport = (airportCode || 'FRA').toUpperCase().trim();
  
  const curfews = {
    FRA: {
      airport: 'FRA',
      name: 'Frankfurt Airport',
      has_curfew: true,
      curfew_hours: '23:00 to 05:00 local',
      ban_type: 'Complete night takeoff and landing ban',
      fine_eur: 50000,
      notes: 'Strict German environmental noise regulations apply. No exceptions except immediate emergencies.'
    },
    SYD: {
      airport: 'SYD',
      name: 'Sydney Kingsford Smith Airport',
      has_curfew: true,
      curfew_hours: '23:00 to 06:00 local',
      ban_type: 'Strict noise curfew quota violations',
      fine_aud: 150000,
      notes: 'Monitored by Airservices Australia. Heavy financial penalties for non-approved landings.'
    },
    LHR: {
      airport: 'LHR',
      name: 'London Heathrow Airport',
      has_curfew: true,
      curfew_hours: '23:30 to 06:00 local',
      ban_type: 'Night quota count points limitation',
      fine_gbp: 40000,
      notes: 'Strict QC/2 and QC/4 aircraft type limitations apply.'
    },
    NRT: {
      airport: 'NRT',
      name: 'Tokyo Narita Airport',
      has_curfew: true,
      curfew_hours: '00:00 to 06:00 local',
      ban_type: 'Complete operational noise freeze',
      fine_jpy: 5000000,
      notes: 'No takeoffs or landings allowed without explicit emergency squawk.'
    }
  };

  const c = curfews[airport] || {
    airport,
    name: `${airport} Regional Hub`,
    has_curfew: false,
    curfew_hours: 'None',
    ban_type: 'None',
    notes: 'No active environmental curfews reported at this station.'
  };

  let violationRisk = '🟢 NORMAL (NO RISK)';
  let notes = c.notes;

  if (c.has_curfew) {
    const hasDelayText = etaTimeStr && (etaTimeStr.toLowerCase().includes('delay') || etaTimeStr.toLowerCase().includes('delayed') || etaTimeStr.toLowerCase().includes('23:') || etaTimeStr.toLowerCase().includes('00:') || etaTimeStr.toLowerCase().includes('01:') || etaTimeStr.toLowerCase().includes('02:'));
    if (hasDelayText) {
      violationRisk = '🛑 CRITICAL CURFEW VIOLATION RISK';
      notes = `⚠️ DELAY WARNING: Projecting arrival during curfew hours (${c.curfew_hours}). Mandatory diversion required unless emergency declared. Estimated fine: ${c.fine_eur ? '€' + c.fine_eur : c.fine_aud ? 'A$' + c.fine_aud : c.fine_gbp ? '£' + c.fine_gbp : '¥' + c.fine_jpy}.`;
    }
  }

  return {
    ...c,
    violation_risk: violationRisk,
    advisory_notes: notes
  };
}

export async function getOceanicTracksService(trackId) {
  const tracks = {
    A: {
      track_id: 'NAT-OTS Track A',
      entry_point: 'PIKIL',
      exit_point: 'RESNO',
      coordinates: '50N050W 51N040W 52N030W 52N020W',
      flight_levels: 'FL310, FL330, FL350, FL370, FL390',
      active_sigmets: [
        {
          id: 'SIGMET CHARLIE 3',
          type: 'Volcanic Ash Advisory (VAAC Reykjavik)',
          hazard: 'Volcanic ash cloud drifting south-east over Iceland towards Track A.',
          vertical_limits: 'SFC to FL200',
          severity: '🛑 SEVERE HAZARD - FLIGHT PATH DIVERSION MANDATORY UNDER FL200'
        }
      ]
    },
    B: {
      track_id: 'NAT-OTS Track B',
      entry_point: 'DOGAL',
      exit_point: 'MALOT',
      coordinates: '49N050W 50N040W 51N030W 51N020W',
      flight_levels: 'FL320, FL340, FL360, FL380, FL400',
      active_sigmets: [
        {
          id: 'SIGMET BRAVO 12',
          type: 'Convective Turbulence & Thunderstorms',
          hazard: 'Severe mountain-wave turbulence and embedded thunderstorms reported.',
          vertical_limits: 'FL310 to FL370',
          severity: '⚠️ ELEVATED HAZARD - TURBULENCE PENETRATION PROCEDURES IN EFFECT'
        }
      ]
    },
    C: {
      track_id: 'NAT-OTS Track C',
      entry_point: 'BEDRA',
      exit_point: 'LIMRI',
      coordinates: '48N050W 49N040W 50N030W 50N020W',
      flight_levels: 'FL310, FL330, FL350, FL370, FL390',
      active_sigmets: []
    }
  };

  const id = (trackId || 'B').toUpperCase().trim();
  return tracks[id] || tracks['B'];
}

export async function getETOPSPlanningService(departureCode, arrivalCode, model) {
  const dep = (departureCode || 'LHR').toUpperCase().trim();
  const arr = (arrivalCode || 'JFK').toUpperCase().trim();
  const cleanModel = (model || '777').toUpperCase().replace(/[^A-Z0-9]/g, '');

  let ruleMinutes = 180;
  let singleEngineSpeed = 380; // knots cruise
  let maxDiversionDistance = 1140; // nm

  if (cleanModel.includes('737') || cleanModel.includes('320') || cleanModel.includes('321')) {
    ruleMinutes = 120;
    singleEngineSpeed = 350;
    maxDiversionDistance = 700;
  } else if (cleanModel.includes('777') || cleanModel.includes('787') || cleanModel.includes('350')) {
    ruleMinutes = 180;
    singleEngineSpeed = 410;
    maxDiversionDistance = 1230;
  }

  // Designated alternates weather statuses
  const alternateDetails = [
    {
      code: 'KEF',
      name: 'Keflavik International Airport (Iceland)',
      distance_to_track_nm: 420,
      flight_category: 'VFR',
      weather_text: 'KEF 221530Z 26010KT 10SM FEW030 11/06 A2992 NOSIG',
      acceptability: '🟢 APPROVED ETOPS ALTERNATE'
    },
    {
      code: 'BGSF',
      name: 'Kangerlussuaq Airport (Greenland)',
      distance_to_track_nm: 680,
      flight_category: 'MVFR',
      weather_text: 'BGSF 221530Z 09015KT 4SM OVC018 M02/M05 A2965 NOSIG',
      acceptability: '🟡 CAUTION - SNOW REMOVAL ACTIVE - CRITICAL CEILING'
    },
    {
      code: 'LPLA',
      name: 'Lajes Field (Azores)',
      distance_to_track_nm: 750,
      flight_category: 'IFR',
      weather_text: 'LPLA 221530Z 18022G30KT 2SM OVC008 14/13 A2974 NOSIG',
      acceptability: '🔴 RESTRICTED - WEATHER BELOW ETOPS ALTERNATE MINIMUMS'
    }
  ];

  return {
    route: `${dep} ➔ ${arr}`,
    aircraft_model: model || 'Boeing 777-200ER',
    etops_rule_minutes: ruleMinutes,
    single_engine_cruise_kt: singleEngineSpeed,
    max_diversion_distance_nm: maxDiversionDistance,
    equal_time_point: '52N035W (ETP-1 KEF/LPLA)',
    alternates: alternateDetails,
    compliance_advisory: '⚠️ ETOPS COMPLIANCE ADVISORY: designated alternate LPLA is currently below ETOPS landing minimums (IFR conditions). Dispatchers must route via Northern Tracks using KEF and BGSF only.'
  };
}

/**
 * 5. Passenger Compensation & Delay Cost Auditor Service (EU261 / US DOT / Montreal)
 */
export async function getPassengerCompensationService(delayMinutes, departureCode, arrivalCode, reasonCode) {
  const mins = parseInt(delayMinutes || '240', 10);
  const dep = (departureCode || 'JFK').toUpperCase().trim();
  const arr = (arrivalCode || 'LHR').toUpperCase().trim();
  const reason = (reasonCode || 'CREW').toUpperCase().trim();

  // Helper to determine if airport is EU/UK-regulated
  const isEU = (code) => [
    'LHR', 'CDG', 'FRA', 'AMS', 'MAD', 'FCO', 'CPH', 'MUC', 'DUB', 'LGW', 
    'BRU', 'ATH', 'LIS', 'VIE', 'MAN', 'EDI', 'OSL', 'ARN', 'HEL'
  ].includes(code);

  const isUS = (code) => [
    'JFK', 'LAX', 'SFO', 'ORD', 'ATL', 'MIA', 'DFW', 'DEN', 'SEA', 'BOS',
    'EWR', 'LGA', 'PHL', 'CLT', 'PHX', 'LAS', 'MCO', 'IAH', 'MSP', 'DTW'
  ].includes(code);

  // Approximate distance (great-circle) using deterministic hashing if not standard
  let distanceKm = 5500; // Default JFK-LHR
  if (dep === 'LHR' && arr === 'CDG' || dep === 'CDG' && arr === 'LHR') distanceKm = 350;
  else if (dep === 'JFK' && arr === 'LAX' || dep === 'LAX' && arr === 'JFK') distanceKm = 3975;
  else if (dep === 'FRA' && arr === 'JFK' || dep === 'JFK' && arr === 'FRA') distanceKm = 6200;
  else if (dep === 'SYD' && arr === 'LAX' || dep === 'LAX' && arr === 'SYD') distanceKm = 12000;
  else {
    distanceKm = 500 + (getAirportHash(dep) + getAirportHash(arr)) % 11500;
  }

  // EU261 / UK261 Compensation Auditing
  let euCompensation = 0;
  let euApplies = isEU(dep) || isEU(arr); // Simplified for dispatch RAG grounding
  let euEligible = false;
  let delayHours = mins / 60;
  let isForceMajeure = ['WEATHER', 'ATC', 'STRIKE', 'FORCE_MAJEURE', 'VOLCANO', 'ACT_OF_GOD'].includes(reason);
  let dutyOfCare = '🟢 NOT REQUIRED (Delay under limits)';

  if (euApplies && mins >= 120) {
    dutyOfCare = '⚠️ REQUIRED - Carrier must provide meals, refreshments, and 2 free phone calls/emails.';
    if (mins >= 300) {
      dutyOfCare += ' Hotel accommodation mandatory if delay extends overnight.';
    }
  }

  if (euApplies && mins >= 180) {
    if (isForceMajeure) {
      euCompensation = 0;
      euEligible = false;
    } else {
      euEligible = true;
      if (distanceKm <= 1500) euCompensation = 250;
      else if (distanceKm > 1500 && distanceKm <= 3500) euCompensation = 400;
      else euCompensation = 600;
    }
  }

  // US DOT Tarmac Rules & Refunds
  let usDOTApplies = isUS(dep) || isUS(arr);
  let tarmacViolation = '🟢 NORMAL';
  let refundEntitlement = '🟢 NO REFUND DUE';
  let usFines = 0;

  if (usDOTApplies) {
    // Refund rules under significant delay
    const sigDelayLimit = (isUS(dep) && isUS(arr)) ? 180 : 360; // 3h domestic, 6h intl
    if (mins >= sigDelayLimit) {
      refundEntitlement = '⚠️ REFUND MANDATORY - If passenger cancels instead of traveling, full refund required.';
    }

    // Tarmac limits
    const tarmacLimit = (isUS(dep) && isUS(arr)) ? 180 : 240; // 3h domestic, 4h intl
    if (mins >= tarmacLimit) {
      tarmacViolation = `🛑 SEVERE VIOLATION - Exceeded tarmac limit of ${tarmacLimit / 60} hours.`;
      usFines = 27500; // civil penalty warning per passenger
    } else if (mins >= tarmacLimit - 30) {
      tarmacViolation = `⚠️ CRITICAL WARNING - Tarmac delay approaching regulatory limit within 30 minutes.`;
    }
  }

  // Montreal Convention Liability Limits
  let montrealApplies = true; // Governs almost all international carriage
  let montrealLimitSDR = 5739; // SDR cap for delay damages per passenger

  return {
    delay_minutes: mins,
    delay_hours: delayHours.toFixed(1),
    departure: dep,
    arrival: arr,
    reason: reason,
    distance_km: distanceKm,
    eu261: {
      applies: euApplies,
      eligible: euEligible,
      payout_eur: euCompensation,
      force_majeure: isForceMajeure,
      duty_of_care_status: dutyOfCare
    },
    us_dot: {
      applies: usDOTApplies,
      tarmac_status: tarmacViolation,
      refund_entitlement: refundEntitlement,
      warning_civil_penalty_usd: usFines
    },
    montreal_convention: {
      applies: montrealApplies,
      limit_sdr: montrealLimitSDR,
      liability_cap_usd: Math.round(montrealLimitSDR * 1.33) // ~7,600 USD
    }
  };
}

/**
 * 6. Volcanic Ash Cloud Trajectory Projection & Router (VAAC)
 */
export async function getVolcanicAshProjectionService(vaacStationId, routePoints) {
  const station = (vaacStationId || 'REYKJAVIK').toUpperCase().trim();
  const route = (routePoints || 'NAT TRACK A').toUpperCase().trim();

  const vaacDB = {
    REYKJAVIK: {
      station: 'Reykjavik VAAC',
      volcano: 'Katla Volcano (Iceland)',
      wind_vector: 'SE at 25 kts',
      cone_coords: '63N019W - 61N015W - 59N012W',
      plume_height: 'SFC to FL200',
      active_sigmet: 'SIGMET CHARLIE 3',
      trajectory_12h: '61N016W - 60N014W',
      trajectory_24h: '59N013W - 58N011W',
      trajectory_36h: '57N010W - 56N008W'
    },
    ANCHORAGE: {
      station: 'Anchorage VAAC',
      volcano: 'Pavlof Volcano (Alaska)',
      wind_vector: 'NE at 30 kts',
      cone_coords: '55N161W - 57N155W - 59N150W',
      plume_height: 'SFC to FL250',
      active_sigmet: 'SIGMET ALASKA 5',
      trajectory_12h: '57N156W - 58N152W',
      trajectory_24h: '59N149W - 60N145W',
      trajectory_36h: '61N140W - 62N135W'
    },
    DARWIN: {
      station: 'Darwin VAAC',
      volcano: 'Mount Merapi (Indonesia)',
      wind_vector: 'NW at 15 kts',
      cone_coords: '07S110E - 05S105E - 03S100E',
      plume_height: 'SFC to FL180',
      active_sigmet: 'SIGMET JAVAN 8',
      trajectory_12h: '06S107E - 05S104E',
      trajectory_24h: '04S101E - 03S098E',
      trajectory_36h: '02S095E - 01S092E'
    }
  };

  const currentPlume = vaacDB[station] || vaacDB.REYKJAVIK;

  // Audit route path against plume trajectory
  let hazardLevel = '🟢 CLEAR';
  let detourDirective = 'Route clear of active ash advisories. Normal high-altitude cruise permitted.';

  if (station === 'REYKJAVIK') {
    if (route.includes('TRACK A') || route.includes('NAT-OTS A') || route.includes('PIKIL')) {
      hazardLevel = '🛑 CRITICAL';
      detourDirective = `🛑 DETOUR REQUIRED: Flight path directly intersects ${currentPlume.volcano} ash plume. Plume height (${currentPlume.plume_height}) overlaps authorized tracks. Reroute via Track C or South NAT-OTS.`;
    } else if (route.includes('TRACK B') || route.includes('NAT-OTS B') || route.includes('DOGAL')) {
      hazardLevel = '⚠️ CAUTION';
      detourDirective = `⚠️ CAUTION: Route operates adjacent to active ash cloud boundaries. Maintain continuous ash density checking and coordinate with Shanwick Oceanic Control for immediate FL changes if required.`;
    }
  } else if (station === 'ANCHORAGE') {
    if (route.includes('PACOTS 2') || route.includes('TRACK 2') || route.includes('ALASKA')) {
      hazardLevel = '🛑 CRITICAL';
      detourDirective = `🛑 DETOUR REQUIRED: Flight path directly intersects ${currentPlume.volcano} ash plume. Vertical airspace restricted up to ${currentPlume.plume_height}. Reroute south via PACOTS Track 5.`;
    }
  }

  return {
    ...currentPlume,
    queried_route: route,
    hazard_level: hazardLevel,
    dispatch_directive: detourDirective
  };
}

/**
 * 7. IATA Dangerous Goods Regulations (DGR) HAZMAT Manifest Auditor
 */
export async function getCargoHazmatComplianceService(manifestItems) {
  let items = [];
  try {
    if (typeof manifestItems === 'string') {
      items = JSON.parse(manifestItems);
    } else if (Array.isArray(manifestItems)) {
      items = manifestItems;
    } else {
      // Default sample manifest
      items = [
        { un_number: 'UN3480', name: 'Lithium-Ion Batteries', class_id: 9, weight_kg: 42, packing_group: 'PI965' },
        { un_number: 'UN1263', name: 'Paint (Flammable Liquid)', class_id: 3, weight_kg: 15, packing_group: 'PGII' }
      ];
    }
  } catch (e) {
    items = [
      { un_number: 'UN3480', name: 'Lithium-Ion Batteries', class_id: 9, weight_kg: 42, packing_group: 'PI965' }
    ];
  }

  let conflicts = [];
  let auditedItems = [];
  let isCompliant = true;

  // Flags for segregation tracking
  let hasUN3480 = false;
  let hasClass3 = false;
  let hasClass8 = false;

  items.forEach(item => {
    let status = '🟢 APPROVED';
    let remarks = 'Approved for transport under standard DGR limits.';
    const classId = parseInt(item.class_id || '9', 10);
    const weight = parseFloat(item.weight_kg || '0');
    const un = (item.un_number || '').toUpperCase().trim();

    if (un === 'UN3480') hasUN3480 = true;
    if (classId === 3) hasClass3 = true;
    if (classId === 8) hasClass8 = true;

    // Check Class 1 Explosives
    if (classId === 1) {
      status = '🛑 FORBIDDEN';
      remarks = '🛑 PROHIBITED: Class 1 Explosives are strictly forbidden on passenger aircraft under IATA DGR Subsection 4.2.';
      isCompliant = false;
      conflicts.push(`Item ${un} (${item.name}) Class 1 is strictly forbidden on passenger airframes.`);
    }

    // Check UN3480 Weight Limit on Passenger flights (Limit is 35kg net per package)
    if (un === 'UN3480' && weight > 35) {
      status = '🛑 FORBIDDEN (CAO)';
      remarks = '🛑 PROHIBITED: UN3480 Lithium-Ion batteries > 35kg net weight per package are Cargo Aircraft Only (CAO) and forbidden on passenger flights.';
      isCompliant = false;
      conflicts.push(`UN3480 Lithium-Ion Batteries net weight (${weight}kg) exceeds the 35kg passenger limit (IATA DGR Section 5, PI 965).`);
    }

    auditedItems.push({
      ...item,
      class_id: classId,
      weight_kg: weight,
      status: status,
      remarks: remarks
    });
  });

  // Segregation Audit
  if (hasUN3480 && (hasClass3 || hasClass8)) {
    isCompliant = false;
    const conflictMsg = '🛑 SEGREGATION CONFLICT: UN3480 Lithium-Ion batteries must not be loaded adjacent to Class 3 Flammable Liquids or Class 8 Corrosives under IATA DGR Table 9.3.A due to thermal runaway propagation risk.';
    conflicts.push(conflictMsg);
    
    // Update remarks for conflicts
    auditedItems = auditedItems.map(item => {
      if (item.un_number === 'UN3480' || item.class_id === 3 || item.class_id === 8) {
        return {
          ...item,
          status: '🛑 SEPARATION FAIL',
          remarks: '🛑 CRITICAL SEGREGATION CONFLICT: Must be separated by a minimum of 3 meters or loaded in different cargo holds.'
        };
      }
      return item;
    });
  }

  return {
    compliance_status: isCompliant ? '🟢 PASS' : '🛑 FAIL - DGR VIOLATION',
    total_items_audited: auditedItems.length,
    audited_manifest: auditedItems,
    segregation_conflicts: conflicts,
    dispatcher_directive: isCompliant 
      ? 'Manifest approved for flight. Ensure all items are strapped in according to standard loading instructions.'
      : '🛑 CARGO REJECTED: Manifest violates IATA Dangerous Goods packaging, weight, or segregation rules. Correct the issues before flight clearance.'
  };
}

/**
 * 8. Jet Stream High-Altitude Turbulence (CAT) Forecaster
 */
export async function getJetStreamTurbulenceService(departureCode, arrivalCode, routePoints) {
  const dep = (departureCode || 'JFK').toUpperCase().trim();
  const arr = (arrivalCode || 'LHR').toUpperCase().trim();
  const route = (routePoints || 'NAT TRACK B').toUpperCase().trim();

  // Generate deterministic shear maps based on flight routes
  let jetVelocityKts = 145;
  let shearGradient = 8; // kts per 1,000 ft
  let catIndex = '⚠️ MODERATE';
  let optimalFlightLevel = 'FL310';
  let cautionMsg = '⚠️ MODERATE CLEAR-AIR TURBULENCE (CAT) reported. Airspace shear layers active near jet stream core.';

  if (route.includes('TRACK A') || dep === 'FRA' || route.includes('PIKIL')) {
    jetVelocityKts = 175;
    shearGradient = 12; // severe
    catIndex = '🛑 SEVERE';
    optimalFlightLevel = 'FL390';
    cautionMsg = '🛑 SEVERE CLEAR-AIR TURBULENCE (CAT) WARNING: Convective shear layer gradient exceeding 10 kts/1,000 ft. Extreme risk of aircraft structural strain. Reroute or adjust flight levels immediately.';
  } else if (route.includes('TRACK C') || route.includes('BEDRA')) {
    jetVelocityKts = 90;
    shearGradient = 3; // light
    catIndex = '🟢 LIGHT';
    optimalFlightLevel = 'FL350';
    cautionMsg = '🟢 LIGHT TURBULENCE: Minor wave shear detected. Normal cruising operations.';
  }

  // Turbulence penetration speed database by aircraft family
  const speedProfile = {
    B777: { model: 'Boeing 777', penetration_speed: '280 KIAS / Mach 0.78' },
    B737: { model: 'Boeing 737 Max', penetration_speed: '280 KIAS / Mach 0.76' },
    A320: { model: 'Airbus A320neo', penetration_speed: '275 KIAS / Mach 0.76' },
    A350: { model: 'Airbus A350', penetration_speed: '280 KIAS / Mach 0.80' }
  };

  return {
    assigned_route: `${dep} ➔ ${arr} (${route})`,
    jet_stream_core_altitude: 'FL350',
    core_wind_velocity_kts: jetVelocityKts,
    vertical_shear_gradient: `${shearGradient} kts / 1,000 ft`,
    clear_air_turbulence_index: catIndex,
    hazard_warning: cautionMsg,
    recommended_optimal_fl: optimalFlightLevel,
    aircraft_penetration_speeds: Object.values(speedProfile)
  };
}


