import { classifyAviationQuery } from './src/app/modules/search/services/queryClassifier.js';
import { aviationstackSmartRouter } from './src/app/helpers/aviationstackSmartRouter.js';
import {
  getFlightsService,
  getRoutesService,
  getAirportsService,
  getAirlinesService,
  getAirplanesService,
  getMETARTAFService,
  getFAANasStatusService,
  getFAANotamsService,
  getNTSBSafetyIncidentsService,
  getFlightFuelPlanningService,
  getCurfewComplianceService,
  getOceanicTracksService,
  getETOPSPlanningService,
  getPassengerCompensationService,
  getVolcanicAshProjectionService,
  getCargoHazmatComplianceService,
  getJetStreamTurbulenceService
} from './src/app/modules/aviationstack/aviationstack.service.js';

console.log('✈️ Starting AviationStack Real-Time Service Integration Tests...');

// 1. Test query classification and enhancement
const classificationTests = [
  {
    query: 'UA342 status',
    expectedClass: 'flight',
    shouldEnhance: true
  },
  {
    query: 'flights from JFK to LHR tomorrow',
    expectedClass: 'route',
    shouldEnhance: true
  },
  {
    query: 'flights from London to Paris',
    expectedClass: 'route',
    shouldEnhance: true
  },
  {
    query: 'heathrow airport status',
    expectedClass: 'airport',
    shouldEnhance: true
  },
  {
    query: 'united airlines fleet details',
    expectedClass: 'airline',
    shouldEnhance: true
  },
  {
    query: 'plane tail number N104UA info',
    expectedClass: 'airplane',
    shouldEnhance: true
  },
  {
    query: 'SFO departures board',
    expectedClass: 'airport',
    shouldEnhance: true
  },
  {
    query: 'flights from Dallas to Sydney',
    expectedClass: 'route',
    shouldEnhance: true
  },
  {
    query: 'Qatar Airways operational details',
    expectedClass: 'airline',
    shouldEnhance: true
  },
  // Phase 3 Tests: Enterprise FAA, Weather, NOTAM, Safety
  {
    query: 'JFK METAR weather report',
    expectedClass: 'metar_taf',
    shouldEnhance: true
  },
  {
    query: 'FAA ground stop at ORD',
    expectedClass: 'faa_nas',
    shouldEnhance: true
  },
  {
    query: 'LAX airport active NOTAMs',
    expectedClass: 'notam',
    shouldEnhance: true
  },
  {
    query: 'Boeing 737 Max NTSB safety record',
    expectedClass: 'safety_incident',
    shouldEnhance: true
  },
  // Phase 4 Tests: Global Airline Operations, Carrier-Filtered Airport Boards, Fleets
  {
    query: 'Lufthansa operations status',
    expectedClass: 'airline',
    shouldEnhance: true
  },
  {
    query: 'Delta departures board at ATL',
    expectedClass: 'airport',
    shouldEnhance: true
  },
  {
    query: 'Alaska Airlines fleet info',
    expectedClass: 'airline',
    shouldEnhance: true
  },
  // Phase 7 Tests: Elite Dispatcher Operations & Compliance Suite
  {
    query: 'Boeing 777 fuel burn over 8 hours',
    expectedClass: 'fuel_planning',
    shouldEnhance: true
  },
  {
    query: 'active Oceanic Track B coordinates and weather SIGMETs',
    expectedClass: 'oceanic_track',
    shouldEnhance: true
  },
  {
    query: 'noise curfew hours at Sydney Airport under flight delays',
    expectedClass: 'noise_curfew',
    shouldEnhance: true
  },
  {
    query: 'ETOPS ruleset alternates and planning for LHR to JFK Boeing 777',
    expectedClass: 'etops_planner',
    shouldEnhance: true
  },
  // Phase 8 Tests: Global Fleet Dispatch & Commercial Operations Suite
  {
    query: 'passenger compensation DL123 delayed 4 hours from JFK to LHR',
    expectedClass: 'passenger_compensation',
    shouldEnhance: true
  },
  {
    query: 'volcanic ash cloud trajectory Reykjavik Katla volcano',
    expectedClass: 'volcanic_ash_model',
    shouldEnhance: true
  },
  {
    query: 'IATA dangerous goods cargo manifest compliance Lithium Batteries Paint',
    expectedClass: 'cargo_hazmat',
    shouldEnhance: true
  },
  {
    query: 'jet stream wind shear forecast moderate turbulence speed',
    expectedClass: 'jet_stream_shear',
    shouldEnhance: true
  },
  {
    query: 'What is the stock price of Apple?',
    expectedClass: null,
    shouldEnhance: false
  }
];

let passCount = 0;
let failCount = 0;

console.log('\n--- Test 1: Query Classification & RAG Enhancement ---');
for (const test of classificationTests) {
  const classification = classifyAviationQuery(test.query);
  const isMatch = classification.isAviation;
  const intentType = classification.intentType;
  
  const correctClassification = isMatch === test.shouldEnhance && (!isMatch || intentType === test.expectedClass);
  
  if (correctClassification) {
    console.log(`✅ Classification Correct: "${test.query}" -> isAviation: ${isMatch}, type: ${intentType}`);
    passCount++;
  } else {
    console.log(`❌ Classification Failed: "${test.query}" -> expected ${test.shouldEnhance} (${test.expectedClass}), got ${isMatch} (${intentType})`);
    failCount++;
  }

  if (isMatch) {
    try {
      const enhanced = await aviationstackSmartRouter.routeAndEnhancePrompt(test.query);
      const hasProperHeader = enhanced.includes('[Source: AviationStack.com]') || enhanced.includes('[Source: FAA Open Data / NTSB]');
      if (enhanced !== test.query && hasProperHeader) {
        console.log(`   ✅ RAG Enhancement Success: Prompt was beautifully structured & includes proper citation.`);
        passCount++;
      } else {
        console.log(`   ❌ RAG Enhancement Failed: Response matches query or is missing proper citation.`);
        failCount++;
      }
    } catch (err) {
      console.log(`   ❌ RAG Enhancement Crashed: ${err.message}`);
      failCount++;
    }
  }
}

// 2. Test direct services (which execute in mock fallback since we haven't set process.env.AVIATIONSTACK_API_KEY)
console.log('\n--- Test 2: Service API and High-Fidelity Mocks ---');

try {
  const flightResult = await getFlightsService({ flight_iata: 'UA342' });
  if (flightResult && flightResult.length > 0 && flightResult[0].flight.number === '342') {
    console.log(`✅ getFlightsService: retrieved flight details successfully!`);
    passCount++;
  } else {
    console.log(`❌ getFlightsService: failed to retrieve UA342 flight details.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getFlightsService crashed: ${err.message}`);
  failCount++;
}

try {
  const routeResult = await getRoutesService({ dep_iata: 'JFK', arr_iata: 'LHR' });
  if (routeResult && routeResult.length > 0) {
    console.log(`✅ getRoutesService: retrieved routes successfully!`);
    passCount++;
  } else {
    console.log(`❌ getRoutesService: failed to retrieve routes.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getRoutesService crashed: ${err.message}`);
  failCount++;
}

try {
  const airportResult = await getAirportsService({ iata_code: 'JFK' });
  if (airportResult && airportResult.length > 0 && airportResult[0].iata_code === 'JFK') {
    console.log(`✅ getAirportsService: retrieved airport details successfully!`);
    passCount++;
  } else {
    console.log(`❌ getAirportsService: failed to retrieve JFK details.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getAirportsService crashed: ${err.message}`);
  failCount++;
}

// NOAA METAR/TAF Service Test
try {
  const weatherResult = await getMETARTAFService('JFK');
  if (weatherResult && weatherResult.metar && weatherResult.metar.flight_category === 'IFR') {
    console.log(`✅ getMETARTAFService: successfully fetched and decoded IFR weather for JFK!`);
    passCount++;
  } else {
    console.log(`❌ getMETARTAFService: failed to retrieve proper JFK weather profile.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getMETARTAFService crashed: ${err.message}`);
  failCount++;
}

// FAA NAS Airport Status Test
try {
  const nasResult = await getFAANasStatusService('JFK');
  if (nasResult && nasResult.ground_stop && nasResult.ground_stop.reason.includes('Thunderstorms')) {
    console.log(`✅ getFAANasStatusService: successfully retrieved Ground Stop details for JFK!`);
    passCount++;
  } else {
    console.log(`❌ getFAANasStatusService: failed to retrieve proper ground stop status.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getFAANasStatusService crashed: ${err.message}`);
  failCount++;
}

// FAA NOTAMs Test
try {
  const notamResult = await getFAANotamsService('JFK');
  if (notamResult && notamResult.length > 0 && notamResult[0].class === 'Runway Operations') {
    console.log(`✅ getFAANotamsService: successfully retrieved active runway closure notices!`);
    passCount++;
  } else {
    console.log(`❌ getFAANotamsService: failed to retrieve active NOTAM advisories.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getFAANotamsService crashed: ${err.message}`);
  failCount++;
}

// NTSB safety records Test
try {
  const safetyResult = await getNTSBSafetyIncidentsService({ carrier: 'UA', model: 'Boeing 737 Max 9' });
  if (safetyResult && safetyResult.length > 0 && safetyResult[0].accident_number === 'ERA26FA142') {
    console.log(`✅ getNTSBSafetyIncidentsService: successfully retrieved UA 737 Max nose gear incident!`);
    passCount++;
  } else {
    console.log(`❌ getNTSBSafetyIncidentsService: failed to retrieve historical accident profile.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getNTSBSafetyIncidentsService crashed: ${err.message}`);
  failCount++;
}

// Phase 4: Airline operations dashboard formatting verification
try {
  const enhancedLH = await aviationstackSmartRouter.routeAndEnhancePrompt('Lufthansa operations status');
  if (
    enhancedLH.includes('Lufthansa') && 
    enhancedLH.includes('FRA') && 
    enhancedLH.includes('Unified Hub Operations') &&
    enhancedLH.includes('OPERATIONAL COMPLIANCE STATUS')
  ) {
    console.log(`✅ Phase 4: Lufthansa Operations & FRA Hub Dashboard formatted beautifully!`);
    passCount++;
  } else {
    console.log(`❌ Phase 4: Lufthansa operations status formatting incomplete.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 4: Lufthansa operations status crashed: ${err.message}`);
  failCount++;
}

// Phase 4: Carrier-filtered departures board verification
try {
  const enhancedDLBoard = await aviationstackSmartRouter.routeAndEnhancePrompt('Delta departures board at ATL');
  if (
    enhancedDLBoard.includes('ATL') && 
    enhancedDLBoard.includes('Active Departures Board') &&
    enhancedDLBoard.includes('Filtered: **DL**')
  ) {
    console.log(`✅ Phase 4: Delta carrier-filtered ATL Departures Board formatted beautifully!`);
    passCount++;
  } else {
    console.log(`❌ Phase 4: Delta carrier-filtered board formatting incomplete.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 4: Delta departures board crashed: ${err.message}`);
  failCount++;
}

// Phase 4: Alaska Airlines fleet and hub verification
try {
  const enhancedAlaska = await aviationstackSmartRouter.routeAndEnhancePrompt('Alaska Airlines fleet info');
  if (
    enhancedAlaska.includes('Alaska Airlines') && 
    enhancedAlaska.includes('SEA') && 
    enhancedAlaska.includes('Unified Hub Operations') &&
    enhancedAlaska.includes('NTSB Fleet Safety & Incident Registry')
  ) {
    console.log(`✅ Phase 4: Alaska Airlines Fleet & SEA Hub Dashboard formatted beautifully!`);
    passCount++;
  } else {
    console.log(`❌ Phase 4: Alaska Airlines fleet formatting incomplete.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 4: Alaska Airlines fleet crashed: ${err.message}`);
  failCount++;
}

// ==========================================
// Phase 5: Global Dispatcher Operations Suite Tests
// ==========================================

console.log('\n--- Test 3: Phase 5 Global Dispatcher Operations Suite ---');

// 1. Multi-Hub Operational Dashboard Verification (Delta - DL)
try {
  const enhancedDL = await aviationstackSmartRouter.routeAndEnhancePrompt('Delta operations status');
  if (
    enhancedDL.includes('Delta Air Lines') &&
    enhancedDL.includes('Unified Hub Operations Dashboard (Global Hubs)') &&
    enhancedDL.includes('ATL') &&
    enhancedDL.includes('JFK') &&
    enhancedDL.includes('MSP') &&
    enhancedDL.includes('DTW') &&
    enhancedDL.includes('SLC') &&
    enhancedDL.includes('Weather Rules') &&
    enhancedDL.includes('Airspace Program Status')
  ) {
    console.log('✅ Phase 5: DL Multi-Hub Operations Dashboard rendered successfully!');
    passCount++;
  } else {
    console.log('❌ Phase 5: DL Multi-Hub Operations Dashboard missing expected dispatcher grid elements.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 5: DL Multi-Hub Operations Dashboard crashed: ${err.message}`);
  failCount++;
}

// 2. Endpoint Weather & Delay Side-by-Side Route Analysis
try {
  const enhancedRoute = await aviationstackSmartRouter.routeAndEnhancePrompt('flights from JFK to LHR tomorrow');
  if (
    enhancedRoute.includes('Route Dispatch Dashboard') &&
    enhancedRoute.includes('| Dispatch Metric | Departure Airport (**JFK**) | Arrival Airport (**LHR**) |') &&
    enhancedRoute.includes('Flight Category') &&
    enhancedRoute.includes('Airspace Delays') &&
    enhancedRoute.includes('Winds & Conditions') &&
    enhancedRoute.includes('DISPATCH ADVISORY')
  ) {
    console.log('✅ Phase 5: Side-by-side dispatcher route analysis table formatted beautifully!');
    passCount++;
  } else {
    console.log('❌ Phase 5: Side-by-side dispatcher route analysis missing table headers or advisory.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 5: Side-by-side route analysis crashed: ${err.message}`);
  failCount++;
}

// 3. NOTAM Runway Closure & Category Categorization
try {
  const enhancedNotam = await aviationstackSmartRouter.routeAndEnhancePrompt('JFK airport active NOTAMs');
  if (
    enhancedNotam.includes('CRITICAL NOTAM ADVISORY') &&
    enhancedNotam.includes('Active runway closure(s) reported') &&
    enhancedNotam.includes('Runway & Taxiway Operations / Closures') &&
    enhancedNotam.includes('Navigational & Communication Aids') &&
    enhancedNotam.includes('General Facility Notices & Obstructions')
  ) {
    console.log('✅ Phase 5: NOTAMs successfully categorized with Runway Closure alert raised!');
    passCount++;
  } else {
    console.log('❌ Phase 5: NOTAMs missing categorization or critical caution warning.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 5: NOTAMs crashed: ${err.message}`);
  failCount++;
}

// 4. Active Flight Weather & Destination Diversion Warning
try {
  const enhancedFlight = await aviationstackSmartRouter.routeAndEnhancePrompt('BA178 status');
  if (
    enhancedFlight.includes('DIVERSION HAZARD WARNING') &&
    enhancedFlight.includes('destination field **JFK** is experiencing') &&
    enhancedFlight.includes('restricted low-visibility conditions') &&
    enhancedFlight.includes('active Ground Stop program')
  ) {
    console.log('✅ Phase 5: Active flight destination diversion hazard warnings detected and flagged!');
    passCount++;
  } else {
    console.log('❌ Phase 5: Active flight failed to raise destination diversion warnings.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 5: Active flight diversion warning crashed: ${err.message}`);
  failCount++;
}

// 5. Deterministic Global Mock Weather & Delay Engine
try {
  const metarSIN = await getMETARTAFService('SIN');
  const nasSIN = await getFAANasStatusService('SIN');
  const metarDXB = await getMETARTAFService('DXB');
  const nasDXB = await getFAANasStatusService('DXB');

  if (
    metarSIN && metarSIN.metar && metarSIN.metar.flight_category &&
    nasSIN && nasSIN.national_airspace_system_status &&
    metarDXB && metarDXB.metar && metarDXB.metar.flight_category &&
    nasDXB && nasDXB.national_airspace_system_status
  ) {
    // Assert determinism: multiple calls must yield identical profiles
    const call2SIN = await getMETARTAFService('SIN');
    const isDeterministic = metarSIN.metar.raw_text === call2SIN.metar.raw_text;

    if (isDeterministic) {
      console.log('✅ Phase 5: Deterministic keyless mock generator verified successfully for SIN/DXB!');
      passCount++;
    } else {
      console.log('❌ Phase 5: Keyless mock generator is not deterministic.');
      failCount++;
    }
  } else {
    console.log('❌ Phase 5: Keyless mock generator returned incomplete structures.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 5: Keyless mock generator crashed: ${err.message}`);
  failCount++;
}

// ==========================================
// Phase 6: Elite Dispatch & Operations Intelligence Tests
// ==========================================

console.log('\n--- Test 4: Phase 6 Elite Dispatch & Operations Intelligence ---');

// 1. Alternate Auto-Router Contingency Block (BA178 arriving at JFK)
try {
  const enhancedFlight = await aviationstackSmartRouter.routeAndEnhancePrompt('BA178 status');
  if (
    enhancedFlight.includes('Dynamic Alternate Airport Auto-Router') &&
    enhancedFlight.includes('JFK Diversion Planning') &&
    enhancedFlight.includes('LGA') &&
    enhancedFlight.includes('EWR') &&
    enhancedFlight.includes('PHL') &&
    enhancedFlight.includes('nm @') &&
    enhancedFlight.includes('DISPATCH NOTE')
  ) {
    console.log('   ✅ Phase 6: Flight tracking alternates auto-router contingency table generated successfully!');
    passCount++;
  } else {
    console.log('   ❌ Phase 6: Flight tracking alternates auto-router contingency table missing or incomplete.');
    failCount++;
  }
} catch (err) {
  console.log(`   ❌ Phase 6: Flight alternates auto-router crashed: ${err.message}`);
  failCount++;
}

// 2. Weather TAF Trend Deconstruction Timeline & Drop Alert
try {
  const enhancedWeather = await aviationstackSmartRouter.routeAndEnhancePrompt('JFK METAR weather report');
  if (
    enhancedWeather.includes('Chronological Operations Category Timeline') &&
    enhancedWeather.includes('➔') &&
    enhancedWeather.includes('VFR') &&
    enhancedWeather.includes('MVFR') &&
    enhancedWeather.includes('IFR') &&
    enhancedWeather.includes('LIFR') &&
    enhancedWeather.includes('OPERATIONAL DROP ADVISORY')
  ) {
    console.log('   ✅ Phase 6: Weather timeline and dispatcher drop alerts parsed and formatted successfully!');
    passCount++;
  } else {
    console.log('   ❌ Phase 6: Weather timeline or drop alerts missing from output.');
    failCount++;
  }
} catch (err) {
  console.log(`   ❌ Phase 6: Weather timeline crashed: ${err.message}`);
  failCount++;
}

// 3. Tail Safety & Equipment Risk Assessment Audit
try {
  const enhancedAirplane = await aviationstackSmartRouter.routeAndEnhancePrompt('plane tail number N104UA info');
  if (
    enhancedAirplane.includes('Tail Safety & Equipment Risk Assessment') &&
    enhancedAirplane.includes('EQUIPMENT RISK INDEX:') &&
    enhancedAirplane.includes('ELEVATED ADVISORY') &&
    enhancedAirplane.includes('Dallas Fort Worth') &&
    enhancedAirplane.includes('CEN25FA192') &&
    enhancedAirplane.includes('bird-strike engine ingestion turbine inspection')
  ) {
    console.log('   ✅ Phase 6: Aircraft tail safety risk index and manufacturer audit card generated successfully!');
    passCount++;
  } else {
    console.log('   ❌ Phase 6: Aircraft tail safety risk index card missing or incomplete.');
    failCount++;
  }
} catch (err) {
  console.log(`   ❌ Phase 6: Aircraft tail safety risk index crashed: ${err.message}`);
  failCount++;
}

// ==========================================
// Phase 7: Elite Dispatcher Operations & Compliance Suite Tests
// ==========================================

console.log('\n--- Test 5: Phase 7 Elite Dispatcher Operations & Compliance Suite ---');

// 1. Dynamic Flight Plan Fuel & Payload Optimizer RAG
try {
  const enhancedFuel = await aviationstackSmartRouter.routeAndEnhancePrompt('Boeing 777 fuel burn over 8 hours');
  if (
    enhancedFuel.includes('Flight Plan Fuel & Payload Optimizer') &&
    enhancedFuel.includes('ICAO FUEL COMPLIANCE SUMMARY') &&
    enhancedFuel.includes('Trip Fuel') &&
    enhancedFuel.includes('Alternate Fuel') &&
    enhancedFuel.includes('Reserve Fuel') &&
    enhancedFuel.includes('Maximum Structural Payload')
  ) {
    console.log('✅ Phase 7: Dynamic Fuel & Payload Optimizer formatted successfully!');
    passCount++;
  } else {
    console.log('❌ Phase 7: Dynamic Fuel & Payload Optimizer missing expected elements.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 7: Dynamic Fuel & Payload Optimizer crashed: ${err.message}`);
  failCount++;
}

// 2. Volcanic Ash & Oceanic Track (NAT-OTS) Router RAG
try {
  const enhancedTrack = await aviationstackSmartRouter.routeAndEnhancePrompt('active Oceanic Track B coordinates and weather SIGMETs');
  if (
    enhancedTrack.includes('Transoceanic Oceanic Tracks Router') &&
    enhancedTrack.includes('ACTIVE WEATHER/VAAC SIGMET WARNING') &&
    enhancedTrack.includes('Oceanic Route Coordinates Grid') &&
    enhancedTrack.includes('DOGAL') &&
    enhancedTrack.includes('MALOT')
  ) {
    console.log('✅ Phase 7: Oceanic Track & VAAC Volcanic Ash Router formatted successfully!');
    passCount++;
  } else {
    console.log('❌ Phase 7: Oceanic Track & VAAC Volcanic Ash Router missing expected elements.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 7: Oceanic Track & VAAC Volcanic Ash Router crashed: ${err.message}`);
  failCount++;
}

// 3. Airport Noise Curfew Advisor RAG
try {
  const enhancedCurfew = await aviationstackSmartRouter.routeAndEnhancePrompt('noise curfew hours at Sydney Airport under flight delays');
  if (
    enhancedCurfew.includes('Airport Noise Curfew Advisor') &&
    enhancedCurfew.includes('CRITICAL CURFEW VIOLATION RISK') &&
    enhancedCurfew.includes('Environmental Noise & Curfew Specifications') &&
    enhancedCurfew.includes('SYD')
  ) {
    console.log('✅ Phase 7: Airport Noise Curfew Advisor formatted successfully!');
    passCount++;
  } else {
    console.log('❌ Phase 7: Airport Noise Curfew Advisor missing expected elements.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 7: Airport Noise Curfew Advisor crashed: ${err.message}`);
  failCount++;
}

// 4. ETOPS Diversion Planner RAG
try {
  const enhancedETOPS = await aviationstackSmartRouter.routeAndEnhancePrompt('ETOPS ruleset alternates and planning for LHR to JFK Boeing 777');
  if (
    enhancedETOPS.includes('ETOPS Transoceanic Diversion Planner') &&
    enhancedETOPS.includes('ETOPS COMPLIANCE CLEARANCE STATUS') &&
    enhancedETOPS.includes('Designated En-Route Alternate Weather Audit') &&
    enhancedETOPS.includes('KEF') &&
    enhancedETOPS.includes('BGSF') &&
    enhancedETOPS.includes('LPLA')
  ) {
    console.log('✅ Phase 7: ETOPS Diversion Planner formatted successfully!');
    passCount++;
  } else {
    console.log('❌ Phase 7: ETOPS Diversion Planner missing expected elements.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 7: ETOPS Diversion Planner crashed: ${err.message}`);
  failCount++;
}

// 5. Direct Services Verifications
try {
  const fuelResult = await getFlightFuelPlanningService('Boeing 777', 8);
  if (fuelResult && fuelResult.trip_fuel_lbs > 0 && fuelResult.min_dispatch_fuel_lbs > fuelResult.trip_fuel_lbs) {
    console.log(`✅ getFlightFuelPlanningService: retrieved fuel plan successfully!`);
    passCount++;
  } else {
    console.log(`❌ getFlightFuelPlanningService: failed to retrieve fuel plan.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getFlightFuelPlanningService crashed: ${err.message}`);
  failCount++;
}

try {
  const curfewResult = await getCurfewComplianceService('SYD', 'delayed arrival 23:30');
  if (curfewResult && curfewResult.violation_risk.includes('CRITICAL')) {
    console.log(`✅ getCurfewComplianceService: retrieved curfew compliance successfully!`);
    passCount++;
  } else {
    console.log(`❌ getCurfewComplianceService: failed to retrieve curfew compliance.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getCurfewComplianceService crashed: ${err.message}`);
  failCount++;
}

try {
  const trackResult = await getOceanicTracksService('B');
  if (trackResult && trackResult.track_id.includes('Track B')) {
    console.log(`✅ getOceanicTracksService: retrieved oceanic tracks successfully!`);
    passCount++;
  } else {
    console.log(`❌ getOceanicTracksService: failed to retrieve oceanic tracks.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getOceanicTracksService crashed: ${err.message}`);
  failCount++;
}

try {
  const etopsResult = await getETOPSPlanningService('LHR', 'JFK', 'Boeing 777');
  if (etopsResult && etopsResult.alternates.length === 3) {
    console.log(`✅ getETOPSPlanningService: retrieved ETOPS planning successfully!`);
    passCount++;
  } else {
    console.log(`❌ getETOPSPlanningService: failed to retrieve ETOPS planning.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getETOPSPlanningService crashed: ${err.message}`);
  failCount++;
}

// ==========================================
// Phase 8: Global Fleet Dispatch & Commercial Operations Suite Tests
// ==========================================

console.log('\n--- Test 6: Phase 8 Global Fleet Dispatch & Commercial Operations Suite ---');

// 1. Passenger Compensation RAG
try {
  const enhancedComp = await aviationstackSmartRouter.routeAndEnhancePrompt('passenger compensation DL123 delayed 4 hours from JFK to LHR');
  if (
    enhancedComp.includes('Passenger Compensation & Delay Cost Auditor') &&
    enhancedComp.includes('JFK') &&
    enhancedComp.includes('LHR') &&
    enhancedComp.includes('EU261 / UK261') &&
    enhancedComp.includes('€600') &&
    enhancedComp.includes('Montreal Convention') &&
    enhancedComp.includes('US DOT')
  ) {
    console.log('✅ Phase 8: Passenger Compensation Auditor Dashboard formatted beautifully!');
    passCount++;
  } else {
    console.log('❌ Phase 8: Passenger Compensation Auditor Dashboard formatting incomplete.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 8: Passenger Compensation Auditor crashed: ${err.message}`);
  failCount++;
}

// 2. Volcanic Ash Trajectory RAG
try {
  const enhancedAsh = await aviationstackSmartRouter.routeAndEnhancePrompt('volcanic ash cloud trajectory Reykjavik Katla volcano');
  if (
    enhancedAsh.includes('Volcanic Ash Trajectory Projection') &&
    enhancedAsh.includes('Reykjavik VAAC') &&
    enhancedAsh.includes('SFC to FL200')
  ) {
    console.log('✅ Phase 8: Volcanic Ash Trajectory Projection formatted successfully!');
    passCount++;
  } else {
    console.log('❌ Phase 8: Volcanic Ash Trajectory Projection formatting incomplete.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 8: Volcanic Ash Trajectory Projection crashed: ${err.message}`);
  failCount++;
}

// 3. Cargo HAZMAT Manifest Compliance RAG
try {
  const enhancedCargo = await aviationstackSmartRouter.routeAndEnhancePrompt('IATA dangerous goods cargo manifest compliance Lithium Batteries Paint');
  if (
    enhancedCargo.includes('IATA Dangerous Goods (HAZMAT) Manifest Auditor') &&
    enhancedCargo.includes('UN3480') &&
    (enhancedCargo.includes('segregation') || enhancedCargo.includes('conflict'))
  ) {
    console.log('✅ Phase 8: IATA Dangerous Goods (HAZMAT) Manifest Auditor formatted successfully!');
    passCount++;
  } else {
    console.log('❌ Phase 8: IATA Dangerous Goods (HAZMAT) Manifest Auditor formatting incomplete.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 8: IATA Dangerous Goods (HAZMAT) Manifest Auditor crashed: ${err.message}`);
  failCount++;
}

// 4. Jet Stream High-Altitude Turbulence (CAT) Forecaster RAG
try {
  const enhancedTurb = await aviationstackSmartRouter.routeAndEnhancePrompt('jet stream wind shear forecast moderate turbulence speed');
  if (
    enhancedTurb.includes('Jet Stream High-Altitude Turbulence (CAT) Forecaster') &&
    enhancedTurb.includes('kts / 1,000 ft') &&
    (enhancedTurb.includes('Clear-Air Turbulence') || enhancedTurb.includes('CAT') || enhancedTurb.includes('B777'))
  ) {
    console.log('✅ Phase 8: Jet Stream High-Altitude Turbulence (CAT) Forecaster formatted successfully!');
    passCount++;
  } else {
    console.log('❌ Phase 8: Jet Stream High-Altitude Turbulence (CAT) Forecaster formatting incomplete.');
    failCount++;
  }
} catch (err) {
  console.log(`❌ Phase 8: Jet Stream High-Altitude Turbulence (CAT) Forecaster crashed: ${err.message}`);
  failCount++;
}

// 5. Direct Services Verifications
try {
  const compResult = await getPassengerCompensationService(240, 'JFK', 'LHR', 'CREW');
  if (compResult && compResult.eu261.payout_eur === 600 && compResult.montreal_convention.limit_sdr === 5739) {
    console.log(`✅ getPassengerCompensationService: retrieved passenger compensation audit successfully!`);
    passCount++;
  } else {
    console.log(`❌ getPassengerCompensationService: failed to retrieve passenger compensation audit.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getPassengerCompensationService crashed: ${err.message}`);
  failCount++;
}

try {
  const ashResult = await getVolcanicAshProjectionService('REYKJAVIK', 'NAT TRACK A');
  if (ashResult && ashResult.hazard_level === '🛑 CRITICAL' && ashResult.volcano.includes('Katla')) {
    console.log(`✅ getVolcanicAshProjectionService: retrieved volcanic ash projection successfully!`);
    passCount++;
  } else {
    console.log(`❌ getVolcanicAshProjectionService: failed to retrieve volcanic ash projection.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getVolcanicAshProjectionService crashed: ${err.message}`);
  failCount++;
}

try {
  const cargoResult = await getCargoHazmatComplianceService([
    { un_number: 'UN3480', name: 'Lithium-Ion Batteries', class_id: 9, weight_kg: 42, packing_group: 'PI965' }
  ]);
  if (cargoResult && cargoResult.compliance_status.includes('FAIL') && cargoResult.segregation_conflicts.length > 0) {
    console.log(`✅ getCargoHazmatComplianceService: retrieved cargo HAZMAT compliance successfully!`);
    passCount++;
  } else {
    console.log(`❌ getCargoHazmatComplianceService: failed to retrieve cargo HAZMAT compliance.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getCargoHazmatComplianceService crashed: ${err.message}`);
  failCount++;
}

try {
  const turbResult = await getJetStreamTurbulenceService('JFK', 'LHR', 'NAT TRACK A');
  if (turbResult && turbResult.clear_air_turbulence_index === '🛑 SEVERE' && turbResult.vertical_shear_gradient.includes('12 kts')) {
    console.log(`✅ getJetStreamTurbulenceService: retrieved jet stream turbulence forecast successfully!`);
    passCount++;
  } else {
    console.log(`❌ getJetStreamTurbulenceService: failed to retrieve jet stream turbulence forecast.`);
    failCount++;
  }
} catch (err) {
  console.log(`❌ getJetStreamTurbulenceService crashed: ${err.message}`);
  failCount++;
}

console.log(`\n🎉 Tests Complete! Passed: ${passCount}, Failed: ${failCount}`);
process.exit(failCount === 0 ? 0 : 1);

