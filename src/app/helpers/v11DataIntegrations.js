/**
 * v11DataIntegrations.js — Alti.Assistant v11 Deep Data Integrations
 *
 * Implements high-performance intent classifiers and RAG formatting blocks
 * for the four public data modules: FRED economics, HUD Fair Market Rents,
 * FHFA Home Price Index, and College Scorecard.
 */

// ─── Intent Regular Expressions ──────────────────────────────────────────────
const FRED_REGEX = /\b(fred|gdp|inflation rate|interest rates|treasury yield|fed funds rate|macro indicators)\b/i;
const HUD_REGEX = /\b(hud|fmr|fair market rent|rent limits|section 8 rent|median family income)\b/i;
const FHFA_REGEX = /\b(fhfa|hpi|home price index|appreciation rate|conforming loan limit)\b/i;
const SCORECARD_REGEX = /\b(scorecard|graduation rate|college cost|student earnings|student debt|stanford university|higher education)\b/i;

// ─── Detectors ───────────────────────────────────────────────────────────────
export const detectFredIntent = (prompt) => {
  return FRED_REGEX.test(prompt);
};

export const detectHudFmrIntent = (prompt) => {
  return HUD_REGEX.test(prompt);
};

export const detectFhfaHpiIntent = (prompt) => {
  return FHFA_REGEX.test(prompt);
};

export const detectCollegeScorecardIntent = (prompt) => {
  return SCORECARD_REGEX.test(prompt);
};

// ─── Mock Data & Generators ──────────────────────────────────────────────────

/**
 * Generates the FRED Economic Indicators Context Block
 */
export const getFredData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  🏦 FEDERAL RESERVE ECONOMIC DATA (FRED)                          ║
╚══════════════════════════════════════════════════════════════════╝

### 📊 Macroeconomic indicators & Treasury Yield Rates
*Tracking national monetary policy, sovereign debt yields, and gross output indices.*

| Economic Indicator | Current Value | YoY Growth Rate | Status / Rating |
|--------------------|---------------|-----------------|-----------------|
| **Gross Domestic Product (GDP)** | **$28.25T** | **+2.90%** | Standard Economic Growth |
| **Consumer Price Index (CPI)** | **3.10%** | **-0.30%** | Disinflation Trend |
| **Federal Funds Rate** | **5.25%** | N/A | High-Interest Tightening |
| **10-Year U.S. Treasury Yield** | **4.35%** | N/A | Flat Yield Curve Boundary |`;

  const metadata = {
    gdpTrillions: 28.25,
    gdpYoYPercent: 2.90,
    cpiInflation: 3.10,
    cpiYoYChange: -0.30,
    fedFundsRate: 5.25,
    treasuryYield10Yr: 4.35
  };

  return { markdown, metadata };
};

/**
 * Generates the HUD Fair Market Rent (FMR) Context Block
 */
export const getHudFmrData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  🏠 HUD FAIR MARKET RENTS & INCOME LIMITS (HUD PD&R)             ║
╚══════════════════════════════════════════════════════════════════╝

### 🏡 Section 8 Fair Market Rent Limits
*Evaluating maximum housing allowance thresholds and county income limits for ZIP code 90210.*

| Bedroom Size | Fair Market Rent Limit | Area Income Category | Median Income Limit |
|--------------|------------------------|----------------------|---------------------|
| **1-Bedroom FMR** | **$2,150** | Very Low Income | Target: **$98,200** |
| **2-Bedroom FMR** | **$2,680** | Extremely Low Income | Target: **$98,200** |
| **3-Bedroom FMR** | **$3,450** | Low Income Limit | Target: **$98,200** |
| **4-Bedroom FMR** | **$3,980** | Standard Area Limit | Target: **$98,200** |`;

  const metadata = {
    zipCode: "90210",
    fmr1Bed: 2150,
    fmr2Bed: 2680,
    fmr3Bed: 3450,
    fmr4Bed: 3980,
    medianFamilyIncome: 98200
  };

  return { markdown, metadata };
};

/**
 * Generates the FHFA Home Price Index Context Block
 */
export const getFhfaHpiData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  📈 FHFA HOME PRICE INDEX & LOAN LIMITS (FHFA)                   ║
╚══════════════════════════════════════════════════════════════════╝

### 🏷️ Metropolitan Home Price Appreciation & Conforming Thresholds
*Auditing price changes and standard conforming limits for the Los Angeles-Long Beach-Anaheim MSA.*

| Underwriting Indicator | Current Rating / Limit | Growth Bracket | Compliance Status |
|------------------------|------------------------|----------------|-------------------|
| **Annual HPI Appreciation** | **+7.80%** | High Appreciation | Core Growth Market |
| **5-Yr Cumulative Appreciation** | **+42.50%** | Hyper Growth | Outperforming National |
| **SF Conforming Loan Limit** | **$1,149,825** | High-Cost Area Limit | High-Cost Area Met |`;

  const metadata = {
    msaName: "Los Angeles-Long Beach-Anaheim",
    annualAppreciationPercent: 7.80,
    cumulativeAppreciation5Yr: 42.50,
    conformingLoanLimitSF: 1149825
  };

  return { markdown, metadata };
};

/**
 * Generates the College Scorecard Context Block
 */
export const getCollegeScorecardData = () => {
  const markdown = `╔══════════════════════════════════════════════════════════════════╗
║  🎓 COLLEGE SCORECARD ACADEMIC ANALYTICS (DEPT OF ED)            ║
╚══════════════════════════════════════════════════════════════════╝

### 🏫 Higher Education Institutional Performance
*Analyzing academic outcomes, student debt distributions, and earnings profiles for Stanford University.*

| Performance Attribute | Metric Value | National Average | Evaluation Grade |
|-----------------------|--------------|------------------|------------------|
| **Graduation Rate** | **94.20%** | Average: **62.0%** | Elite Tier |
| **Average Annual Cost** | **$19,850** | Average: **$16,500** | High Value Ratio |
| **Median Post-Grad Earnings** | **$108,500** (10 Yrs Post) | Average: **$47,800** | Top 1% Nationally |
| **Median Student Debt** | **$11,500** | Average: **$19,200** | Very Low Leverage |`;

  const metadata = {
    institutionName: "Stanford University",
    graduationRatePercent: 94.20,
    averageAnnualCost: 19850,
    medianPostGradEarnings10Yr: 108500,
    medianStudentDebt: 11500
  };

  return { markdown, metadata };
};
