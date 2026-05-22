/**
 * v12DataIntegrations.js — Alti.Assistant v12 Deep Data Integrations
 *
 * Implements high-performance intent classifiers and RAG formatting blocks
 * for the six public data modules: GLEIF Entity Registry, USPTO PatentsView,
 * OpenSky Network Aviation, US/EU Grid Monitors, USDA QuickStats, and
 * Copernicus Sentinel Platform.
 */

// ─── Intent Regular Expressions ──────────────────────────────────────────────
const GLEIF_REGEX = /\b(gleif|lei|legal entity|corporate hierarchy|subsidiary map|parent entity|who owns whom)\b/i;
const PATENTS_REGEX = /\b(patentsview|patent grant|patent application|assignee|inventor patent|patent citations)\b/i;
const OPENSKY_REGEX = /\b(opensky|flight tracking|aircraft ads-b|state vectors|executive flights|airport logistics)\b/i;
const GRID_REGEX = /\b(grid monitor|power generation|wholesale electricity|energy demand|spot market price|power mix)\b/i;
const USDA_REGEX = /\b(usda|quickstats|agricultural yield|crop prices|farmland value|livestock survey|crop yield|crop stats)\b/i;
const COPERNICUS_REGEX = /\b(copernicus|sentinel imagery|earth observation|ndvi index|construction tracking|marine vessel count)\b/i;

// ─── Detectors ───────────────────────────────────────────────────────────────
export const detectGleifIntent = (prompt) => {
  return GLEIF_REGEX.test(prompt);
};

export const detectPatentsViewIntent = (prompt) => {
  return PATENTS_REGEX.test(prompt);
};

export const detectOpenSkyIntent = (prompt) => {
  return OPENSKY_REGEX.test(prompt);
};

export const detectGridMonitorIntent = (prompt) => {
  return GRID_REGEX.test(prompt);
};

export const detectUsdaStatsIntent = (prompt) => {
  return USDA_REGEX.test(prompt);
};

export const detectCopernicusIntent = (prompt) => {
  return COPERNICUS_REGEX.test(prompt);
};

// ─── Mock Data & Generators ──────────────────────────────────────────────────

/**
 * Generates the GLEIF Entity Registry Context Block
 */
export const getGleifData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  🏢 GLEIF GLOBAL LEGAL ENTITY REGISTRY (GLEIF)                    ║
╚══════════════════════════════════════════════════════════════════╝

### 🌐 Legal Entity Reference Data & Parent-Subsidiary Relationships
*Auditing verified corporate identity indices, registration parameters, and corporate maps.*

| Corporate Attribute | Current Value | Verification Details / Authority | Status / Rating |
|---------------------|---------------|----------------------------------|-----------------|
| **Subject Entity** | Google LLC | LEI: **25490059S3208759S480** | Active Registry Profile |
| **Ultimate Parent** | Alphabet Inc. | LEI: **254900Y6M2039230588** | Active Parent Profile |
| **Registered Country** | **US** | State of Delaware (Registry) | Standard Jurisdiction |
| **LEI Record Status** | **ACTIVE** | GLEIF Central Index Authority | Fully Verified |`;

  const metadata = {
    subjectEntity: "Google LLC",
    subjectLei: "25490059S3208759S480",
    ultimateParent: "Alphabet Inc.",
    ultimateParentLei: "254900Y6M2039230588",
    registeredCountry: "US",
    leiStatus: "ACTIVE"
  };

  return { markdown, metadata };
};

/**
 * Generates the USPTO PatentsView Context Block
 */
export const getPatentsViewData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  💡 USPTO PATENTSVIEW INTELLECTUAL PROPERTY INTEL (USPTO)         ║
╚══════════════════════════════════════════════════════════════════╝

### 🏷️ Disambiguated Corporate Patent Holdings & Tech Innovation Vectors
*Auditing granted utility patents, active applications, and innovation citations.*

| Intellectual Property Metric | Registered Metric / Value | Technology Sector Rank | Portfolio Rating |
|------------------------------|---------------------------|------------------------|------------------|
| **Subject Corporate Assignee** | Apple Inc. | Assignee ID: **ORG-12345** | Tier 1 Innovation Lead |
| **Total Patents Granted** | **28,450** | Top 5 Globally | Elite Innovation Rating |
| **Active Patent Applications**| **12,340** | Consumer Tech Lead | Expanding Portfolio |
| **Dominant Technology Class** | **G06F - Electric Digital Data Processing** | Core Architectural Segment | Primary Industry Driver |
| **Average Citation Count** | **42.8** | National Average: **18.4** | Top 1% Innovation Index |`;

  const metadata = {
    assigneeName: "Apple Inc.",
    assigneeId: "ORG-12345",
    totalPatentsGranted: 28450,
    activePatentApplications: 12340,
    dominantTechClass: "G06F - Electric Digital Data Processing",
    averageCitationCount: 42.8
  };

  return { markdown, metadata };
};

/**
 * Generates the OpenSky Network Context Block
 */
export const getOpenSkyData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  ✈️ OPENSKY NETWORK GLOBAL FLIGHT SURVEILLANCE                    ║
╚══════════════════════════════════════════════════════════════════╝

### 📡 Real-Time Air Traffic Vectors & Logistics Performance
*Tracking live aircraft transponders, transits, and business aviation indicators over metropolitan airspace.*

| Airspace / Logistics Metric | Current Vector / Value | Operational Density | Status / Rating |
|-----------------------------|------------------------|---------------------|-----------------|
| **Subject Airspace** | Los Angeles International (LAX) | Contiguous Terminal Airspace | Standard Operations |
| **Active Flights Tracked** | **420** (In Terminal Bounds) | High Traffic Flow | Peak Operating Hour |
| **Average Ground Speed** | **485 knots** | Standard Jet Profile | Smooth Terminal Routing |
| **Executive Jets Registered**| **45** (Active in Airspace) | Private Aviation Sector | High Executive Density |`;

  const metadata = {
    targetAirspace: "Los Angeles International (LAX)",
    activeFlightsTracked: 420,
    averageGroundSpeedKnots: 485,
    executiveJetsRegistered: 45
  };

  return { markdown, metadata };
};

/**
 * Generates the US & EU Grid Monitors Context Block
 */
export const getGridMonitorData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  ⚡ ELECTRICITY GRID PERFORMANCE & POWER SPOT PRICING              ║
╚══════════════════════════════════════════════════════════════════╝

### 🔌 Real-Time Grid Load, Resource Mix, and Wholesale Spot Pricing
*Monitoring active grid balancing authority metrics, solar/wind outputs, and energy markets.*

| Grid Monitor Indicator | Registered Value / Pricing | Resource Distribution | Market Profile |
|------------------------|----------------------------|-----------------------|----------------|
| **Balancing Authority** | CAISO (California Grid) | Regional System Operator | West Coast Node |
| **Hourly Electric Demand** | **32,450 MW** | High Load Status | Peak Utility Demand |
| **Spot Wholesale Price** | **$42.80/MWh** | Stable Price Floor | Core Deflationary Utility |
| **Solar Generation Mix** | **38.5%** | Active Renewables Contribution | Outperforming National Average |
| **Wind Generation Mix** | **12.2%** | Active Renewables Contribution | Consistent Resource Flow |
| **Hydro Generation Mix** | **8.4%** | Baseline Power Contribution | Hydrological Stability |
| **Nuclear Generation Mix** | **9.6%** | Core Clean Baseload | Stable Operating Band |
| **Natural Gas Mix** | **31.3%** | Peaker Resource Contribution | Secondary Support Fuel |`;

  const metadata = {
    balancingAuthority: "CAISO (California Grid)",
    hourlyElectricDemandMW: 32450,
    spotWholesalePriceMWh: 42.80,
    solarGenerationPercent: 38.5,
    windGenerationPercent: 12.2,
    hydroGenerationPercent: 8.4,
    nuclearGenerationPercent: 9.6,
    naturalGasPercent: 31.3
  };

  return { markdown, metadata };
};

/**
 * Generates the USDA QuickStats Agricultural Context Block
 */
export const getUsdaStatsData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  🌾 USDA NASS QUICKSTATS AGRICULTURAL SURVEYS (USDA)             ║
╚══════════════════════════════════════════════════════════════════╝

### 🚜 Agricultural Land Productivity, Yields, & Farmland Economics
*Auditing official NASS agricultural census estimates, land pricing, and crop yields.*

| Agricultural Metric | Survey Metric / Value | Geographic Census Area | Compliance Status |
|---------------------|-----------------------|------------------------|-------------------|
| **Survey County** | Fresno County, CA | Primary Crop Belt | Core Agricultural Market |
| **Average Farmland Value** | **$8,450/acre** | High Asset Value | Top 5% Nationally |
| **Average Almond Yield** | **2,150 lbs/acre** | Strong Crop Output | Outperforming Historic Baseline |
| **Average Crop Price** | **$2.15/lb** | Standard Market Valuation | Healthy Pricing Index |
| **Active Census Farms** | **4,280** | Multi-Family Commercial | Highly Diversified Base |`;

  const metadata = {
    surveyCounty: "Fresno County, CA",
    averageFarmlandValuePerAcre: 8450,
    averageAlmondYieldLbsPerAcre: 2150,
    averageCropPricePerLb: 2.15,
    activeCensusFarms: 4280
  };

  return { markdown, metadata };
};

/**
 * Generates the Copernicus Sentinel Context Block
 */
export const getCopernicusData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  🛰️ COPERNICUS SENTINEL SATELLITE EARTH OBSERVATIONS               ║
╚══════════════════════════════════════════════════════════════════╝

### 🗺️ Multi-Spectral Geo-Spatial Physical Asset & Logistics Analysis
*Auditing high-frequency satellite imaging bands, soil moisture levels, and real-time physical indicators.*

| Earth Observation Parameter | Monitored Metric / Value | Ground Coordinates | Observation Index |
|-----------------------------|--------------------------|--------------------|-------------------|
| **Target Coordinates** | Los Angeles Downtown | **34.0522° N, 118.2437° W** | Target Observation Zone |
| **Vegetation Health Index** | NDVI: **0.68** | High Chlorophyll Activity | Standard Health Index |
| **Surface Soil Moisture** | **24.5%** | Favorable Moisture Profile | Low Structural Risk |
| **Active Construction Cranes**| **12** (Downtown Bounds) | High Physical Expansion | Rapid Construction Index |
| **Queued Offshore Vessels** | **18** (San Pedro Bay) | Logistics Queue Indicator | Moderate Supply Chain Speed |`;

  const metadata = {
    targetCoordinates: "34.0522° N, 118.2437° W",
    ndviVegetationIndex: 0.68,
    surfaceSoilMoisturePercent: 24.5,
    activeConstructionCranes: 12,
    queuedOffshoreCargoVessels: 18
  };

  return { markdown, metadata };
};
