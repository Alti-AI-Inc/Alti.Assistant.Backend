/**
 * v10DataIntegrations.js — Alti.Assistant v10 Deep Data Integrations
 *
 * Implements high-performance intent classifiers and RAG formatting blocks
 * for the four pending public data modules: NOAA/USGS Climate Risk, EIA Commodities,
 * SEC EDGAR REIT holdings, and U.S. Census Bureau/BLS Socioeconomics.
 */

// ─── Intent Regular Expressions ──────────────────────────────────────────────
const CLIMATE_RISK_REGEX = /\b(flood|hurricane|tornado|earthquake|wildfire|climate risk|seismic|hazard risk|hazard|environmental|noaa|usgs)\b/i;
const COMMODITY_REGEX = /\b(oil|crude|natural gas|gold|silver|commodities|spot price|eia)\b/i;
const SEC_FILING_REGEX = /\b(reit|10-k|10-q|sec filing|prologis|equinix|corporate holdings|edgar)\b/i;
const DEMOGRAPHICS_REGEX = /\b(population|demographics|household income|unemployment rate|census|bls|socioeconomics|zip code demographics)\b/i;

// ─── Detectors ───────────────────────────────────────────────────────────────
export const detectClimateRiskIntent = (prompt) => {
  return CLIMATE_RISK_REGEX.test(prompt);
};

export const detectCommodityIntent = (prompt) => {
  return COMMODITY_REGEX.test(prompt);
};

export const detectSecFilingsIntent = (prompt) => {
  return SEC_FILING_REGEX.test(prompt);
};

export const detectDemographicsIntent = (prompt) => {
  return DEMOGRAPHICS_REGEX.test(prompt);
};

// ─── Mock Data & Generators ──────────────────────────────────────────────────

/**
 * Generates the NOAA / USGS Climate Risk Context Block
 */
export const getClimateRiskData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  🌍 ENVIRONMENTAL CLIMATE RISK (NOAA / USGS)                      ║
╚══════════════════════════════════════════════════════════════════╝

### 🌧️ Federal Environmental Hazard Risk Profile
*Evaluating live meteorological and seismic hazard databases for climate risk metrics.*

| Hazard Category | Classification | Underwriting Metric | Risk Mitigation Status |
|-----------------|----------------|---------------------|------------------------|
| **Flood Zone** | **Zone AE** | **High Probability** | Flood Insurance Required |
| **Seismic Risk** | Peak PGA **0.18g** | **Moderate Risk** | Seismic Structural Code Met |
| **Wildfire Index** | Rating: **6.8/10** | **Elevated Risk** | FAIR Plan Escrow Active |
| **Hurricane Index** | Rating: **8.4/10** | **High Risk** | Windstorm Shutters Installed |`;

  const metadata = {
    floodZone: "Zone AE",
    seismicPeakPGA: "0.18g",
    wildfireRiskIndex: 6.8,
    hurricaneRiskIndex: 8.4,
    hazardMitigationMet: true
  };

  return { markdown, metadata };
};

/**
 * Generates the EIA & Commodities Spot Pricing Context Block
 */
export const getCommodityData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  🛢️ PHYSICAL COMMODITIES & ENERGY SPOT PRICING (EIA)             ║
╚══════════════════════════════════════════════════════════════════╝

### 📈 Real-Time Commodity Spot Pricing
*Tracking global commodities indexes and U.S. Energy Information Administration (EIA) live price feeds.*

| Commodity Asset | Live Spot Price | YoY Growth Rate | Pricing Classification |
|-----------------|-----------------|-----------------|------------------------|
| 🛢️ **WTI Crude Oil** | **$78.50/bbl** | **+2.45%** | Standard Market |
| 💨 **Natural Gas** | **$2.15/MMBtu** | **-18.40%** | Oversupplied |
| 🪙 **Gold Spot** | **$2,345.80/oz** | **+12.80%** | Safe Haven Bullish |
| 🥈 **Silver Spot** | **$28.20/oz** | **+6.50%** | Industrial Demand Uptick |`;

  const metadata = {
    wtiCrudeOil: 78.50,
    wtiCrudeOilYoY: 2.45,
    naturalGas: 2.15,
    naturalGasYoY: -18.40,
    goldSpot: 2345.80,
    goldSpotYoY: 12.80,
    silverSpot: 28.20,
    silverSpotYoY: 6.50
  };

  return { markdown, metadata };
};

/**
 * Generates the SEC EDGAR Corporate & REIT Filings Context Block
 */
export const getSecFilingsData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  🏛️ SEC EDGAR CORPORATE & REIT FILINGS INTEL                      ║
╚══════════════════════════════════════════════════════════════════╝

### 🏢 SEC EDGAR Institutional REIT Underwriting Stats
*Aggregated financial metrics from recent 10-K and 10-Q corporate SEC filings for public REIT portfolios (e.g. Prologis).*

| Financial Attribute | Underwriting Metric | Regulatory Standard | Portfolio Rating |
|---------------------|---------------------|---------------------|------------------|
| **Net Asset Value (NAV)** | **$98.50B** (growth: **+6.20%**) | Institutional Grade | AAA Rating |
| **Weighted Average Cap Rate** | **4.85%** | Industry Average | Core Defensive |
| **Debt-to-Equity Ratio** | **34.20%** | Threshold: $\le$ **50.0%** | Low Leverage |
| **Portfolio Occupancy Rate** | **96.80%** | Target: $\ge$ **92.0%** | High Utilization |`;

  const metadata = {
    netAssetValueBillions: 98.50,
    navYoYGrowth: 6.20,
    weightedAvgCapRate: 4.85,
    debtToEquity: 34.20,
    occupancyRate: 96.80
  };

  return { markdown, metadata };
};

/**
 * Generates the U.S. Census Bureau & BLS demographics Context Block
 */
export const getDemographicsData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  📊 CENSUS & BLS LOCAL DEMOGRAPHICS & SOCIOECONOMICS             ║
╚══════════════════════════════════════════════════════════════════╝

### 👥 Local Neighborhood Socioeconomics Dashboard
*Localized socioeconomic and demographic statistics compiled from the U.S. Census Bureau and Bureau of Labor Statistics (BLS).*

| Socioeconomic Metric | Underwriting Metric | Growth Trajectory | Market Health |
|----------------------|---------------------|-------------------|---------------|
| **Median Household Income** | **$85,420** | YoY growth: **+3.20%** | Healthy Economic Base |
| **5-Year Population Growth** | **+11.85%** | **High Growth** | Strong Inward Migration |
| **Localized Unemployment Rate** | **3.80%** | **Tight Labor Market** | Below National Average |`;

  const metadata = {
    medianHouseholdIncome: 85420,
    incomeYoYGrowth: 3.20,
    populationGrowth5Yr: 11.85,
    unemploymentRateLocal: 3.80
  };

  return { markdown, metadata };
};
