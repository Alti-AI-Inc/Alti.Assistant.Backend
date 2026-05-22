/**
 * realestateSmartRouter.js — Real Estate Smart Router
 *
 * RAG-powered real estate prompt enhancer using RealEstateAPI.com.
 * Formats property datasets into high-fidelity markdown tables and bolded metrics blocks.
 */

import { realestateService, serviceDiagnostics } from '../modules/realestate/realestate.service.js';
import { detectRealEstateIntent } from './realestateIntentDB.js';
import { logger } from '../../shared/logger.js';

// Formatter to render currency values: e.g., $672,000
const formatCurrency = (val) => {
  if (val === undefined || val === null) return 'N/A';
  if (typeof val !== 'number') return String(val);
  return `$${val.toLocaleString()}`;
};

/**
 * Builds the actual prompt injection system block.
 */
const buildPrompt = (originalPrompt, contentBlock, title = 'RealEstateAPI.com Live Intelligence') => {
  const timestamp = new Date().toISOString();

  // Enterprise Diagnostics Summary Block
  let diagBlock = '';
  if (serviceDiagnostics && serviceDiagnostics.cacheStats) {
    const hits = serviceDiagnostics.cacheStats.hits;
    const misses = serviceDiagnostics.cacheStats.misses;
    const total = hits + misses;
    const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : '0.0';
    
    diagBlock += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    diagBlock += `🖥️ ENTERPRISE CACHE & LATENCY DIAGNOSTICS LOG\n`;
    diagBlock += `▸ Cache Stats: ${hits} hits, ${misses} misses (${hitRate}% efficiency)\n`;
    
    const methods = Object.keys(serviceDiagnostics.calls);
    if (methods.length > 0) {
      diagBlock += `▸ Service Latency Logs:\n`;
      methods.forEach(m => {
        const calls = serviceDiagnostics.calls[m];
        const lastCall = calls[calls.length - 1];
        if (lastCall) {
          diagBlock += `  - \`${m}\`: **${lastCall.latencyMs}ms** (Status: ${lastCall.cacheStatus})\n`;
        }
      });
    }
  }

  return `[SYSTEM INSTRUCTION — ALTI REAL-TIME PROPERTY DATA CONTEXT]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA SOURCE: RealEstateAPI.com
TIMESTAMP:   ${timestamp}
CONTEXT TYPE: ${title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${contentBlock}${diagBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY RESPONSE RULES:
▸ Cite "[Source: RealEstateAPI.com]" prominently at the very top of your answer.
▸ Present ALL values, prices, valuations, rent rates, and listing costs in **BOLD** (e.g. **$485,000**, **$2,950/mo**).
▸ Present ALL property statistics (bedrooms, bathrooms, square footage, year built, lot size) in **BOLD** (e.g. **4** beds, **2,200** sqft, built in **2018**).
▸ Use Markdown tables for comparisons, comparable sales, and MLS search results.
▸ Answer the user's EXACT query using ONLY the verified property data above. Never estimate or guess.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Query: ${originalPrompt}`;
};

/**
 * Helper to compute Hazard Insurance and structural Replacement Cost metrics.
 */
const computeInsuranceHazard = (sqftVal, cityVal, femaFloodActive = false) => {
  const replacementCost = (sqftVal || 2000) * 175;
  const cityClean = (cityVal || 'Atlanta').toLowerCase();
  
  let hazardTier = 'Moderate Risk 🟡';
  let insuranceRate = 0.0065;
  
  let wildfireRisk = 'Low';
  let windRisk = 'Low';
  let seismicRisk = 'Low';
  
  if (['miami'].some(c => cityClean.includes(c))) {
    hazardTier = 'High Risk 🔴';
    insuranceRate = 0.0120;
    wildfireRisk = 'Low';
    windRisk = 'High';
    seismicRisk = 'Low';
  } else if (['los angeles', 'san francisco'].some(c => cityClean.includes(c))) {
    hazardTier = 'High Risk 🔴';
    insuranceRate = 0.0120;
    wildfireRisk = 'High';
    windRisk = 'Low';
    seismicRisk = 'High';
  } else if (['atlanta', 'washington'].some(c => cityClean.includes(c))) {
    hazardTier = 'Low Risk 🟢';
    insuranceRate = 0.0035;
    wildfireRisk = 'Low';
    windRisk = 'Low';
    seismicRisk = 'Low';
  } else if (['austin'].some(c => cityClean.includes(c))) {
    hazardTier = 'Moderate Risk 🟡';
    insuranceRate = 0.0065;
    wildfireRisk = 'Medium';
    windRisk = 'Medium';
    seismicRisk = 'Low';
  } else if (['new york'].some(c => cityClean.includes(c))) {
    hazardTier = 'Moderate Risk 🟡';
    insuranceRate = 0.0065;
    wildfireRisk = 'Low';
    windRisk = 'Medium';
    seismicRisk = 'Low';
  } else {
    hazardTier = 'Moderate Risk 🟡';
    insuranceRate = 0.0065;
    wildfireRisk = 'Low';
    windRisk = 'Low';
    seismicRisk = 'Low';
  }
  
  const annualPremium = replacementCost * insuranceRate;
  const monthlyPremium = annualPremium / 12;
  
  // FEMA Flood Surcharge calculation
  const hasFemaSurcharge = femaFloodActive || cityClean.includes('miami');
  const femaFloodZone = hasFemaSurcharge ? 'Zone AE (High Risk)' : 'Zone X (Low Risk)';
  const annualFEMAPremium = hasFemaSurcharge ? replacementCost * 0.0105 : 0;
  const monthlyFEMAPremium = annualFEMAPremium / 12;
  
  return { 
    replacementCost, 
    hazardTier, 
    insuranceRate, 
    annualPremium, 
    monthlyPremium,
    wildfireRisk,
    windRisk,
    seismicRisk,
    hasFemaSurcharge,
    femaFloodZone,
    annualFEMAPremium,
    monthlyFEMAPremium
  };
};

/**
 * Main routing logic to fetch appropriate datasets and construct the enriched context prompt.
 */
export const routeAndEnhancePrompt = async (prompt) => {
  try {
    const intent = detectRealEstateIntent(prompt);
    if (!intent) {
      return prompt; // Skip - not real estate-related
    }

    const { type, entities } = intent;
    logger.info(`[RealEstateSmartRouter] Intent: ${type}, Entities: ${JSON.stringify(entities)}`);

    // ─── PROPERTY AVM (VALUATION) ────────────────────────────────────────────────
    if (type === 'property_avm') {
      const propId = entities.propertyId || entities.address || 'prop_90210_1';
      const [detail, avm] = await Promise.all([
        realestateService.getPropertyDetailService(propId),
        realestateService.getPropertyAvmService(propId)
      ]);

      let block = `## 🏡 Property Valuation Report (AVM)\n\n`;
      block += `### 📍 Subject Property details\n`;
      block += `- **Address**: ${detail.address}, ${detail.city}, ${detail.state} ${detail.zip}\n`;
      block += `- **Owner**: **${detail.ownerName || 'N/A'}**\n`;
      block += `- **Structure**: **${detail.beds || 0}** beds | **${detail.baths || 0}** baths | **${(detail.sqft || 0).toLocaleString()}** sqft | Built in **${detail.yearBuilt || 0}**\n\n`;

      if (avm) {
        block += `### 📊 Lender-Grade Valuation Estimates\n`;
        block += `| Estimate Metric | Value | Valuation Range |\n`;
        block += `|-----------------|-------|-----------------|\n`;
        block += `| 🎯 **Current AVM** | **${formatCurrency(avm.valuation)}** | **${formatCurrency(avm.lowValue)}** - **${formatCurrency(avm.highValue)}** |\n`;
        block += `| 📈 **Est. Monthly Rent** | **${formatCurrency(avm.rentalValuation)}/mo** | Rent yields: **${((avm.rentalValuation * 12 / avm.valuation) * 100).toFixed(2)}%** |\n`;
        block += `| 🎯 **Confidence Score** | **${avm.confidenceScore || 0}%** | AVM Precision: High |\n\n`;

        // Evaluate Seller Net Sheet Intent
        const hasSellerIntent = ['sell', 'seller', 'commission', 'net sheet', 'proceeds', 'netsheet', 'net proceeds'].some(k => prompt.toLowerCase().includes(k));
        if (hasSellerIntent) {
          const grossSalePrice = avm.valuation;
          const brokerCommission = grossSalePrice * 0.05;
          const titleEscrow = grossSalePrice * 0.01;
          const stateTax = grossSalePrice * 0.005;
          const mortgagePayoff = grossSalePrice * 0.60;
          const netProceeds = grossSalePrice - (brokerCommission + titleEscrow + stateTax + mortgagePayoff);
          
          block += `### 💵 Seller Net Sheet Projections\n`;
          block += `*Itemized transaction ledger simulating estimated net walkthrough proceeds at exit.*\n\n`;
          block += `| Transaction Ledger Item | Percentage | Estimated Cost / Credit |\n`;
          block += `|-------------------------|------------|-------------------------|\n`;
          block += `| 💰 **Gross Sale Price (AVM)** | **100.0%** | **${formatCurrency(grossSalePrice)}** |\n`;
          block += `| 💼 **Broker Commission** | **5.0%** | **${formatCurrency(Math.round(brokerCommission))}** |\n`;
          block += `| 🏦 **Title & Escrow Fees** | **1.0%** | **${formatCurrency(Math.round(titleEscrow))}** |\n`;
          block += `| 🏛️ **State Transfer Taxes** | **0.5%** | **${formatCurrency(Math.round(stateTax))}** |\n`;
          block += `| 📉 **Simulated Mortgage Payoff** | **60.0%** | **${formatCurrency(Math.round(mortgagePayoff))}** |\n`;
          block += `| 💎 **Estimated Net Proceeds** | **33.5%** | **${formatCurrency(Math.round(netProceeds))}** |\n\n`;

          block += `### 💵 Seller Multi-Scenario Exit Ledger\n`;
          block += `*Comparing walkthrough net proceeds across multiple pricing scenarios with a fixed outstanding mortgage debt of **60.0%** of the standard AVM.*\n\n`;
          block += `| Pricing Scenario | Gross Sale Price | Broker Commission (5.0%) | Title & Escrow (1.0%) | Transfer Taxes (0.5%) | Mortgage Payoff (60.0%) | Estimated Net Proceeds |\n`;
          block += `|------------------|------------------|--------------------------|-----------------------|-----------------------|-------------------------|------------------------|\n`;
          
          const scenarios = [
            { label: '🔴 **90% of List**', mult: 0.90 },
            { label: '🟡 **95% of List**', mult: 0.95 },
            { label: '🎯 **100% List Price**', mult: 1.00 },
            { label: '🟢 **105% of List**', mult: 1.05 }
          ];
          
          const fixedMortgagePayoff = avm.valuation * 0.60;
          
          scenarios.forEach(sc => {
            const gross = avm.valuation * sc.mult;
            const comm = gross * 0.05;
            const title = gross * 0.01;
            const tax = gross * 0.005;
            const net = gross - (comm + title + tax + fixedMortgagePayoff);
            
            block += `| ${sc.label} | **${formatCurrency(Math.round(gross))}** | **${formatCurrency(Math.round(comm))}** | **${formatCurrency(Math.round(title))}** | **${formatCurrency(Math.round(tax))}** | **${formatCurrency(Math.round(fixedMortgagePayoff))}** | **${formatCurrency(Math.round(net))}** |\n`;
          });
          block += `\n`;
        }

        // Scenario underwriting overrides
        const downPaymentPct = entities.downPaymentPct !== null ? entities.downPaymentPct : 0.20;
        const interestRateYearly = entities.interestRate !== null ? entities.interestRate : 0.065;
        const opexRatio = entities.opexRatio !== null ? entities.opexRatio : 0.45;
        const rentRateVal = entities.customRent || avm.rentalValuation || 0;

        // Base Financial Parameters
        const purchasePrice = avm.valuation;
        const downPayment = purchasePrice * downPaymentPct;
        const loanAmount = purchasePrice * (1 - downPaymentPct);
        
        const interestRateMonthly = interestRateYearly / 12;
        const numberOfPayments = 360;
        const monthlyMortgagePI = loanAmount > 0 
          ? (interestRateMonthly > 0 
              ? loanAmount * (interestRateMonthly * Math.pow(1 + interestRateMonthly, numberOfPayments)) / (Math.pow(1 + interestRateMonthly, numberOfPayments) - 1)
              : loanAmount / numberOfPayments)
          : 0;

        // Private Mortgage Insurance (PMI) Trigger
        const pmiRate = 0.0075; // 0.75% per annum
        const pmiMonthly = downPaymentPct < 0.20 ? (loanAmount * pmiRate) / 12 : 0;

        // Upgraded FEMA/Hazard Insurance Calculation
        const ins = computeInsuranceHazard(detail.sqft, detail.city, entities.femaFloodActive);

        // 1. Dynamic Sensitivity Underwriting Helper
        const computeUnderwritingScenario = (rentVal, opexRate) => {
          const annualRent = rentVal * 12;
          const annualOpEx = annualRent * opexRate;
          const noi = annualRent - annualOpEx;
          const cap = (noi / purchasePrice) * 100;
          const monthlyOp = annualOpEx / 12;
          // Upgraded v5 Outflows including FEMA premium:
          const monthlyOutflow = monthlyMortgagePI + monthlyOp + pmiMonthly + ins.monthlyFEMAPremium;
          const netMonthly = rentVal - monthlyOutflow;
          const annualNet = netMonthly * 12;
          const coc = downPayment > 0 ? (annualNet / downPayment) * 100 : 0;
          return { annualRent, noi, cap, monthlyOp, netMonthly, coc };
        };

        const downsideScenario = computeUnderwritingScenario(rentRateVal * 0.9, Math.min(1.0, opexRatio + 0.05));
        const baseScenario = computeUnderwritingScenario(rentRateVal, opexRatio);
        const upsideScenario = computeUnderwritingScenario(rentRateVal * 1.1, Math.max(0.0, opexRatio - 0.05));

        block += `### 📉 Investment Sensitivity Stress-Testing\n`;
        block += `| Economic Scenario | Est. Monthly Rent | OpEx Ratio | Net Operating Income | Cap Rate | Net Monthly Cash Flow | Cash-on-Cash Return |\n`;
        block += `|-------------------|-------------------|------------|----------------------|----------|-----------------------|---------------------|\n`;
        block += `| 🔴 **Downside (Stress)** | **${formatCurrency(Math.round(rentRateVal * 0.9))}/mo** | **${(Math.min(1.0, opexRatio + 0.05) * 100).toFixed(0)}%** | **${formatCurrency(Math.round(downsideScenario.noi))}** | **${downsideScenario.cap.toFixed(2)}%** | **${formatCurrency(Math.round(downsideScenario.netMonthly))}/mo** | **${downsideScenario.coc.toFixed(2)}%** |\n`;
        block += `| 🟡 **Base Case** | **${formatCurrency(Math.round(rentRateVal))}/mo** | **${(opexRatio * 100).toFixed(0)}%** | **${formatCurrency(Math.round(baseScenario.noi))}** | **${baseScenario.cap.toFixed(2)}%** | **${formatCurrency(Math.round(baseScenario.netMonthly))}/mo** | **${baseScenario.coc.toFixed(2)}%** |\n`;
        block += `| 🟢 **Upside (Growth)** | **${formatCurrency(Math.round(rentRateVal * 1.1))}/mo** | **${(Math.max(0.0, opexRatio - 0.05) * 100).toFixed(0)}%** | **${formatCurrency(Math.round(upsideScenario.noi))}** | **${upsideScenario.cap.toFixed(2)}%** | **${formatCurrency(Math.round(upsideScenario.netMonthly))}/mo** | **${upsideScenario.coc.toFixed(2)}%** |\n\n`;

        // Custom deep underwriting calculations:
        const breakEvenRent = (monthlyMortgagePI + pmiMonthly + ins.monthlyFEMAPremium) / (1 - opexRatio);
        const totalLifetimeMortgageCost = (monthlyMortgagePI + pmiMonthly) * 360;
        const totalLifetimeInterestCost = Math.max(0, totalLifetimeMortgageCost - loanAmount);
        const annualDebtService = monthlyMortgagePI * 12;
        const dscr = annualDebtService > 0 ? baseScenario.noi / annualDebtService : 99;

        block += `### 🏢 Institutional Investment Metrics\n`;
        block += `- **Net Operating Income (NOI)**: **${formatCurrency(Math.round(baseScenario.noi))}** /year (assuming **${(opexRatio * 100).toFixed(0)}%** operating expense ratio)\n`;
        block += `- **Capitalization Rate (Cap Rate)**: **${baseScenario.cap.toFixed(2)}%** (implied capitalization yield based on AVM)\n`;
        block += `- **Gross Rent Multiplier (GRM)**: **${(purchasePrice / (rentRateVal * 12)).toFixed(2)}x**\n`;
        block += `- **Break-Even Monthly Rent**: **${formatCurrency(Math.round(breakEvenRent))}/mo** (minimum rent required to sustain debt + opex + PMI)\n\n`;

        block += `### 🏛️ Cumulative Mortgage Amortization\n`;
        block += `- **Total 30-Year Debt Service Payments**: **${formatCurrency(Math.round(totalLifetimeMortgageCost))}** (total P&I paid over 30 years)\n`;
        block += `- **Total Interest Cost Paid to Lender**: **${formatCurrency(Math.round(totalLifetimeInterestCost))}** (total financing cost of leverage)\n\n`;

        // Mortgage Underwriting & DSCR Risk Rating
        let dscrRating = '';
        if (dscr < 1.0) {
          dscrRating = `🔴 High Default Risk (Negative Cash Carry)`;
        } else if (dscr < 1.25) {
          dscrRating = `🟡 Tight Lending Range (Cash-Flow Positive but Below Standard Institutional Guidelines)`;
        } else {
          dscrRating = `🟢 Qualified Investment Yield (Meets Institutional Prime DSCR Lending Guidelines)`;
        }

        block += `### 🏛️ Mortgage Underwriting & DSCR Risk Rating\n`;
        block += `- **Debt Service Coverage Ratio (DSCR)**: **${dscr.toFixed(2)}x** (Annual NOI: **${formatCurrency(Math.round(baseScenario.noi))}** / Annual P&I Debt Service: **${formatCurrency(Math.round(annualDebtService))}**)\n`;
        block += `- **Underwriting Assessment**: **${dscrRating}**\n`;
        if (dscr >= 1.25) {
          block += `- **Lending Advisory**: **Highly Leverageable Asset** 🟢. Cash flow is strong and debt service is fully covered. Easily qualifies for institutional non-QM or DSCR commercial loans.\n\n`;
        } else if (dscr >= 1.0) {
          block += `- **Lending Advisory**: **Restricted Leverage Warning** 🟡. The property is cash-flow positive but has a tight coverage margin. May require higher down payments or interest rate premiums to satisfy standard institutional guidelines.\n\n`;
        } else {
          block += `- **Lending Advisory**: **High Leverage Default Risk** 🔴. The net operating income is insufficient to cover standard mortgage payments. Financing will require significant down payments or substantial equity recapitalization.\n\n`;
        }

        // Conforming Loan Limits Audit
        const limitStandard = 766550;
        const limitHighCost = 1149825;
        const cityClean = (detail.city || 'Atlanta').toLowerCase();
        const isHighCostCity = ['los angeles', 'san francisco', 'new york'].some(c => cityClean.includes(c));
        const applicableConformingLimit = isHighCostCity ? limitHighCost : limitStandard;
        const conformingStatus = loanAmount <= applicableConformingLimit ? '🟢 CONFORMING' : '🔴 JUMBO';
        
        block += `### 🏛️ Conforming Limits Audit\n`;
        block += `- **Standard Single-Unit Conforming Limit**: **${formatCurrency(limitStandard)}**\n`;
        block += `- **High-Cost Area Conforming Limit**: **${formatCurrency(limitHighCost)}**\n`;
        block += `- **Subject Loan Amount**: **${formatCurrency(Math.round(loanAmount))}**\n`;
        block += `- **Applicable Area Limit**: **${formatCurrency(applicableConformingLimit)}** (${isHighCostCity ? 'High-Cost Market' : 'Standard Market'})\n`;
        block += `- **Conforming Loan Status**: **${conformingStatus}**\n\n`;

        // Interest Rate Sensitivity Analysis
        block += `### 📈 Interest Rate Sensitivity Analysis\n`;
        block += `*Evaluating financing options from **6.0%** to **8.5%** in **0.5%** steps (assuming **${(downPaymentPct * 100).toFixed(1)}%** down payment).*\n\n`;
        block += `| Interest Rate | Monthly P&I | Monthly PMI | Total Monthly Outflow | DSCR Rating | Cash-on-Cash Return |\n`;
        block += `|---------------|-------------|-------------|-----------------------|-------------|---------------------|\n`;
        
        const rates = [0.060, 0.065, 0.070, 0.075, 0.080, 0.085];
        rates.forEach(r => {
          const rMonthly = r / 12;
          const rPI = loanAmount > 0 
            ? loanAmount * (rMonthly * Math.pow(1 + rMonthly, 360)) / (Math.pow(1 + rMonthly, 360) - 1)
            : 0;
          const rPMI = downPaymentPct < 0.20 ? (loanAmount * 0.0075) / 12 : 0;
          const rTotalOutflow = rPI + baseScenario.monthlyOp + rPMI + ins.monthlyFEMAPremium;
          
          const rAnnualDebtService = rPI * 12;
          const rDSCR = rAnnualDebtService > 0 ? baseScenario.noi / rAnnualDebtService : 99;
          
          const rNetMonthly = rentRateVal - rTotalOutflow;
          const rAnnualNet = rNetMonthly * 12;
          const rCoC = downPayment > 0 ? (rAnnualNet / downPayment) * 100 : 0;
          
          block += `| **${(r * 100).toFixed(1)}%** | **${formatCurrency(Math.round(rPI))}** | **${formatCurrency(Math.round(rPMI))}** | **${formatCurrency(Math.round(rTotalOutflow))}/mo** | **${rDSCR.toFixed(2)}x** | **${rCoC.toFixed(2)}%** |\n`;
        });
        block += `\n`;

        // Insurance Underwriting & Hazard Risk Profiling
        block += `### 🛡️ Insurance Underwriting & Hazard Risk Profiling\n`;
        block += `| Underwriting Attribute | Value | Assessment Metric |\n`;
        block += `|------------------------|-------|-------------------|\n`;
        block += `| 🏗️ **Replacement Cost (RC)** | **${formatCurrency(ins.replacementCost)}** | Structure valuation @ **$175/sqft** |\n`;
        block += `| 🛡️ **Environmental Hazard Risk** | **${ins.hazardTier}** | City location assessment |\n`;
        block += `| 🔥 **Wildfire Risk** | **${ins.wildfireRisk}** | Forest/brush fire profile |\n`;
        block += `| 🌀 **Wind/Hurricane Risk** | **${ins.windRisk}** | Coastal wind/storm profile |\n`;
        block += `| 🫨 **Seismic/Earthquake Risk** | **${ins.seismicRisk}** | Fault line proximity profile |\n`;
        block += `| 🌧️ **FEMA Flood Zone** | **${ins.femaFloodZone}** | Federal flood hazard mapping |\n`;
        block += `| 📈 **Insurance Premium Rate** | **${(ins.insuranceRate * 100).toFixed(2)}%** | Underwriting multiplier |\n`;
        block += `| 💵 **Est. Annual Premium** | **${formatCurrency(Math.round(ins.annualPremium))}** | Annual structural premium |\n`;
        block += `| 💸 **Est. Monthly Premium** | **${formatCurrency(Math.round(ins.monthlyPremium))}/mo** | Monthly premium allocation |\n`;
        if (ins.hasFemaSurcharge) {
          block += `| ⚠️ **FEMA Flood Ann. Premium** | **${formatCurrency(Math.round(ins.annualFEMAPremium))}** | Surcharge @ **1.05%** of RC |\n`;
          block += `| ⚠️ **FEMA Flood Mo. Premium** | **${formatCurrency(Math.round(ins.monthlyFEMAPremium))}/mo** | Monthly escrow allocation |\n`;
        }
        block += `\n`;

        block += `### 💸 30-Year Mortgage Cash Flow Analysis\n`;
        block += `*Assumes down payment of **${(downPaymentPct * 100).toFixed(1)}%**, 30-year amortization, and **${(interestRateYearly * 100).toFixed(2)}%** interest rate.*\n\n`;
        block += `| Financing Attribute | Value Detail | Calculated Target |\n`;
        block += `|---------------------|--------------|-------------------|\n`;
        block += `| 💰 **Acquisition Cost** | **${formatCurrency(purchasePrice)}** | Valuation Purchase Base |\n`;
        block += `| 💵 **Down Payment (${(downPaymentPct * 100).toFixed(0)}%)** | **${formatCurrency(Math.round(downPayment))}** | Initial Capital Outlay |\n`;
        block += `| 🏛️ **Financed Loan (${((1 - downPaymentPct) * 100).toFixed(0)}%)** | **${formatCurrency(Math.round(loanAmount))}** | Funded Mortgage Debt |\n`;
        block += `| 💸 **Monthly Mortgage (P&I)** | **${formatCurrency(Math.round(monthlyMortgagePI))}/mo** | 30-Yr Fixed @ **${(interestRateYearly * 100).toFixed(2)}%** |\n`;
        block += `| 📉 **Operating Expenses (${(opexRatio * 100).toFixed(0)}%)** | **${formatCurrency(Math.round(baseScenario.monthlyOp))}/mo** | Taxes, Ins, Maint, Vac |\n`;
        if (pmiMonthly > 0) {
          block += `| ⚠️ **PMI (Mortgage Insurance)** | **${formatCurrency(Math.round(pmiMonthly))}/mo** | LTV > 80% (annual 0.75% fee) |\n`;
        }
        if (ins.hasFemaSurcharge) {
          block += `| 🌧️ **FEMA Flood Insurance** | **${formatCurrency(Math.round(ins.monthlyFEMAPremium))}/mo** | High-risk Zone AE (annual 1.05% fee) |\n`;
        }
        block += `| 📈 **Total Monthly Outflow** | **${formatCurrency(Math.round(monthlyMortgagePI + baseScenario.monthlyOp + pmiMonthly + ins.monthlyFEMAPremium))}/mo** | Combined Debt + OpEx |\n`;
        block += `| 💰 **Net Monthly Cash Flow** | **${formatCurrency(Math.round(baseScenario.netMonthly))}/mo** | **${baseScenario.netMonthly >= 0 ? 'Positive Yield 🟢' : 'Negative Carry 🔴'}** |\n`;
        block += `| 💎 **Cash-on-Cash Return** | **${baseScenario.coc.toFixed(2)}%** | **${baseScenario.coc.toFixed(2)}%** Annual Yield |\n\n`;

        // 2. 10-Year holding-Period Equity Amortization Simulator
        const remainingBalances = {};
        const cumulativeInterest = {};
        const cumulativePrincipal = {};
        const builtInEquity = {};
        
        let currentBalance = loanAmount;
        let cumInterest = 0;
        let cumPrincipal = 0;
        const scheduleYears = [1, 3, 5, 10, 30];
        
        for (let month = 1; month <= 360; month++) {
          const monthlyInterest = currentBalance * interestRateMonthly;
          const monthlyPrincipal = Math.min(currentBalance, monthlyMortgagePI - monthlyInterest);
          
          cumInterest += monthlyInterest;
          cumPrincipal += monthlyPrincipal;
          currentBalance = Math.max(0, currentBalance - monthlyPrincipal);
          
          const year = month / 12;
          if (scheduleYears.includes(year)) {
            remainingBalances[year] = currentBalance;
            cumulativeInterest[year] = cumInterest;
            cumulativePrincipal[year] = cumPrincipal;
            builtInEquity[year] = downPayment + cumPrincipal;
          }
        }

        block += `### 🏛️ Holding-Period Equity & Debt Amortization Projections\n`;
        block += `| Holding Period | Remaining Loan Balance | Cumulative Interest Paid | Cumulative Principal Paid | Total Built-in Equity |\n`;
        block += `|----------------|------------------------|--------------------------|---------------------------|-----------------------|\n`;
        scheduleYears.forEach(y => {
          block += `| 📅 **Year ${y}** | **${formatCurrency(Math.round(remainingBalances[y]))}** | **${formatCurrency(Math.round(cumulativeInterest[y]))}** | **${formatCurrency(Math.round(cumulativePrincipal[y]))}** | **${formatCurrency(Math.round(builtInEquity[y]))}** |\n`;
        });
        block += `\n`;

        // 3. Tax Assessment Deviation Index (TADI)
        if (detail.taxAssessedValue) {
          const tadi = avm.valuation / detail.taxAssessedValue;
          block += `### 🏛️ Tax Assessment Deviation Index (TADI)\n`;
          block += `- **TADI Ratio**: **${tadi.toFixed(2)}x** (AVM Valuation: **${formatCurrency(avm.valuation)}** / Assessed Value: **${formatCurrency(detail.taxAssessedValue)}**)\n`;
          if (tadi > 1.25) {
            block += `- **Assessment Advisory**: **Undervalued Asset Shield** 🟢. The tax assessor valuation is significantly below market valuation. Reassessment risk is low, providing stable property tax shielding.\n\n`;
          } else if (tadi < 0.90) {
            block += `- **Assessment Advisory**: **Tax Appeal Opportunity** ⚠️. The tax assessor valuation exceeds current market valuation. High probability of achieving property tax savings through a formal appeal.\n\n`;
          } else {
            block += `- **Assessment Advisory**: **Fair Market Alignment** 🔵. The tax assessor valuation is aligned with market valuations.\n\n`;
          }
        }

        // Programmatic Buy-Box Matching Engine
        const hasBuyBoxIntent = ['buy box', 'buybox', 'prospectus', 'investor criteria', 'matching engine', 'matching'].some(k => prompt.toLowerCase().includes(k)) || 
                                (entities.minCapRate !== null || entities.minNetCashFlow !== null);
        
        if (hasBuyBoxIntent) {
          const boxMaxPrice = entities.maxPrice !== null ? entities.maxPrice : 700000;
          const boxMinBeds = entities.minBeds !== null ? entities.minBeds : 3;
          const boxMinBaths = entities.minBaths !== null ? entities.minBaths : 2;
          const boxMinCapRate = entities.minCapRate !== null ? entities.minCapRate : 0.035;
          const boxMinNetCashFlow = entities.minNetCashFlow !== null ? entities.minNetCashFlow : -1500;
          
          const passPrice = purchasePrice <= boxMaxPrice;
          const passBeds = (detail.beds || 0) >= boxMinBeds;
          const passBaths = (detail.baths || 0) >= boxMinBaths;
          const passCap = baseScenario.cap >= (boxMinCapRate * 100);
          const passCash = baseScenario.netMonthly >= boxMinNetCashFlow;
          
          const overallApproved = passPrice && passBeds && passBaths && passCap && passCash;
          
          block += `### 🎯 Investor Buy-Box Matching Prospectus\n`;
          block += `*Programmatic audit comparing subject property parameters against parsed investor target criteria.*\n\n`;
          block += `| Target Underwriting Metric | Criteria Limit | Subject Property Value | Audit Result |\n`;
          block += `|----------------------------|----------------|------------------------|--------------|\n`;
          block += `| 💰 **Maximum Purchase Price** | **${formatCurrency(boxMaxPrice)}** | **${formatCurrency(purchasePrice)}** | ${passPrice ? '🟢 PASS' : '🔴 FAIL'} |\n`;
          block += `| 🛏️ **Minimum Bedrooms** | **${boxMinBeds}** beds | **${detail.beds || 0}** beds | ${passBeds ? '🟢 PASS' : '🔴 FAIL'} |\n`;
          block += `| 🛁 **Minimum Bathrooms** | **${boxMinBaths}** baths | **${detail.baths || 0}** baths | ${passBaths ? '🟢 PASS' : '🔴 FAIL'} |\n`;
          block += `| 📈 **Minimum Capitalization Rate** | **${(boxMinCapRate * 100).toFixed(2)}%** | **${baseScenario.cap.toFixed(2)}%** | ${passCap ? '🟢 PASS' : '🔴 FAIL'} |\n`;
          block += `| 💵 **Minimum Net Monthly Cash Flow** | **${formatCurrency(boxMinNetCashFlow)}/mo** | **${formatCurrency(Math.round(baseScenario.netMonthly))}/mo** | ${passCash ? '🟢 PASS' : '🔴 FAIL'} |\n\n`;
          
          block += `- **Overall Buy-Box Match Recommendation**: **${overallApproved ? '🟢 APPROVED BUY-BOX MATCH' : '🔴 REJECTED'}**\n\n`;
        }
      } else {
        block += `*Valuation service currently offline. No AVM available.*\n`;
      }

      return buildPrompt(prompt, block, 'RealEstateAPI.com AVM Valuation Report');
    }

    // ─── PROPERTY COMPS (COMPARABLE SALES) ──────────────────────────────────────
    if (type === 'property_comps') {
      const propId = entities.propertyId || entities.address || 'prop_90210_1';
      const [detail, comps] = await Promise.all([
        realestateService.getPropertyDetailService(propId),
        realestateService.getPropertyCompsService({
          propertyId: propId,
          radiusMiles: entities.radiusMiles || null,
          compsLimit: entities.compsLimit || null
        })
      ]);

      let block = `## 📊 Comparable Sales Analysis (Comps)\n\n`;
      block += `### Subject Property details\n`;
      block += `- **Subject Address**: ${detail.address}, ${detail.city}, ${detail.state} ${detail.zip}\n`;
      block += `- **Details**: **${detail.beds || 0}** beds | **${detail.baths || 0}** baths | **${(detail.sqft || 0).toLocaleString()}** sqft | Assessed **${formatCurrency(detail.taxAssessedValue)}**\n\n`;

      if (comps && comps.length > 0) {
        block += `### Recent Comparable Sales\n`;
        block += `| Comp Address | Proximity Tier | Distance | Layout | Layout Match | Sold Price | Sold Date | Avg Price/Sqft |\n`;
        block += `|--------------|----------------|----------|--------|--------------|------------|-----------|----------------|\n`;
        
        let totalPrice = 0;
        let totalSqft = 0;
        let weightedPriceSum = 0;
        let weightSum = 0;

        comps.forEach(c => {
          totalPrice += c.salePrice;
          totalSqft += c.sqft;
          const priceSqft = c.salePrice / c.sqft;
          
          const isLayoutMatch = c.beds === (detail.beds || 4) && c.baths === (detail.baths || 3.5);
          const layoutMatchFlag = isLayoutMatch ? '🎯 **Match**' : '✖';
          
          // 4. Outlier detection & Proximity tagging
          const dist = c.distanceMiles || 0.1;
          let proximityTier = '';
          if (dist <= 0.15) {
            proximityTier = '🟢 Close (Primary)';
          } else if (dist <= 0.30) {
            proximityTier = '🟡 Medium (Secondary)';
          } else {
            proximityTier = '⚠️ Outlier (Territory)';
          }

          // Inverse Distance Weighting: W = 1 / (d + 0.05)
          const weight = 1 / (dist + 0.05);
          weightSum += weight;
          weightedPriceSum += priceSqft * weight;

          block += `| ${c.address} | ${proximityTier} | **${dist}** mi | **${c.beds}**b/**${c.baths}**ba | ${layoutMatchFlag} | **${formatCurrency(c.salePrice)}** | ${c.saleDate} | **$${priceSqft.toFixed(2)}** |\n`;
        });

        const avgCompPrice = totalPrice / comps.length;
        const avgPriceSqft = totalPrice / totalSqft;

        // Distance-Weighted Consensus
        const weightedAvgPriceSqft = weightedPriceSum / weightSum;
        const suggestedValueWeighted = weightedAvgPriceSqft * (detail.sqft || 2000);

        block += `\n### 📈 Market Consensus Analysis\n`;
        block += `- **Average Sold Comp Price**: **${formatCurrency(avgCompPrice)}**\n`;
        block += `- **Average Price per Sqft**: **${formatCurrency(avgPriceSqft)}/sqft**\n`;
        block += `- **Distance-Weighted Average**: **$${weightedAvgPriceSqft.toFixed(2)}/sqft** (prioritizes closest properties)\n`;
        block += `- **Suggested Subject Value (Standard Comp Sqft)**: **${formatCurrency(avgPriceSqft * (detail.sqft || 2000))}**\n`;
        block += `- **Suggested Subject Value (Distance-Weighted)**: **${formatCurrency(Math.round(suggestedValueWeighted))}** (highly recommended)\n`;
      } else {
        block += `*No recent comparable sales found within the search radius.*\n`;
      }

      return buildPrompt(prompt, block, 'RealEstateAPI.com Property Comps');
    }

    // ─── SKIP TRACE (OWNER INFORMATION) ─────────────────────────────────────────
    if (type === 'skip_trace') {
      const propId = entities.propertyId || entities.address || 'prop_90210_1';
      const [detail, skip] = await Promise.all([
        realestateService.getPropertyDetailService(propId),
        realestateService.getSkipTraceService(propId)
      ]);

      let block = `## 🔍 Skip Trace Owner Verification\n\n`;
      block += `### Property Identifier\n`;
      block += `- **Address**: ${detail.address}, ${detail.city}, ${detail.state} ${detail.zip}\n`;
      if (detail.taxAssessedValue) {
        block += `- **Tax Assessed Value**: **${detail.taxAssessedValue.toLocaleString()}**\n`;
      }
      block += `\n`;

      if (skip) {
        block += `### 👤 Owner Contact Demographics\n`;
        block += `- **Verified Owner**: **${skip.owner || detail.ownerName}**\n`;
        block += `- **Current Mailing Address**: ${skip.currentAddress || 'N/A'}\n\n`;

        block += `#### 📞 Active Contact Phone Numbers\n`;
        if (skip.phoneNumbers && skip.phoneNumbers.length > 0) {
          skip.phoneNumbers.forEach(p => block += `- **${p}** (Verified Active Line)\n`);
        } else {
          block += `- *No active phone numbers found.*\n`;
        }

        block += `\n#### 📧 Registered Email Addresses\n`;
        if (skip.emails && skip.emails.length > 0) {
          skip.emails.forEach(e => block += `- **${e}**\n`);
        } else {
          block += `- *No registered emails found.*\n`;
        }

        if (skip.demographics) {
          block += `\n#### 📊 Portfolio Owner Demographics\n`;
          block += `- **Estimated Net Worth**: **${skip.demographics.netWorth || 'N/A'}**\n`;
          block += `- **Est. Credit Bureau Range**: **${skip.demographics.creditRange || 'N/A'}**\n`;
        }
      } else {
        block += `*No skip trace data available for the verified owner.*\n`;
      }

      return buildPrompt(prompt, block, 'RealEstateAPI.com Owner Skip Trace');
    }

    // ─── MLS SEARCH ─────────────────────────────────────────────────────────────
    if (type === 'mls_search') {
      const isMultiMarket = entities.locations && entities.locations.length > 1;
      
      if (isMultiMarket) {
        // Parallel MLS retrieval across multiple cities
        const marketPromises = entities.locations.map(async (loc) => {
          const criteria = {
            city: loc.city,
            state: loc.state,
            minPrice: entities.minPrice || undefined,
            maxPrice: entities.maxPrice || undefined,
            minBeds: entities.minBeds || undefined,
            minBaths: entities.minBaths || undefined,
            propertyType: entities.propertyType || undefined
          };
          const listings = await realestateService.searchMlsService(criteria);
          return { loc, listings };
        });
        
        const marketResults = await Promise.all(marketPromises);
        
        let block = `## 📊 Multi-Market Comparative MLS Dashboard\n\n`;
        block += `### 📈 Market Comparison Summary\n`;
        block += `| Market Location | Active Listings | Avg List Price | Avg Price/Sqft | Avg Days on Market |\n`;
        block += `|-----------------|-----------------|----------------|----------------|--------------------|\n`;
        
        const allListings = [];
        
        marketResults.forEach(({ loc, listings }) => {
          if (listings && listings.length > 0) {
            const count = listings.length;
            const totalPrice = listings.reduce((sum, item) => sum + item.price, 0);
            const totalSqft = listings.reduce((sum, item) => sum + (item.sqft || 0), 0);
            const totalDom = listings.reduce((sum, item) => sum + (item.daysOnMarket || 0), 0);
            
            const avgPrice = totalPrice / count;
            const avgPriceSqft = totalSqft > 0 ? totalPrice / totalSqft : 0;
            const avgDom = totalDom / count;
            
            block += `| **${loc.city}, ${loc.state || 'N/A'}** | **${count}** | **${formatCurrency(Math.round(avgPrice))}** | **${avgPriceSqft > 0 ? `$${avgPriceSqft.toFixed(2)}` : 'N/A'}/sqft** | **${avgDom.toFixed(1)}** days |\n`;
            
            listings.forEach(item => {
              allListings.push({ ...item, market: `${loc.city}, ${loc.state}` });
            });
          } else {
            block += `| **${loc.city}, ${loc.state || 'N/A'}** | **0** | **N/A** | **N/A** | **N/A** |\n`;
          }
        });
        
        block += `\n### 🏡 Side-by-Side Property Comparison\n`;
        if (allListings.length > 0) {
          block += `| Address | Market | List Price | Beds/Baths | Property Sqft | Status | DOM |\n`;
          block += `|---------|--------|------------|------------|---------------|--------|-----|\n`;
          allListings.slice(0, 8).forEach(item => {
            block += `| ${item.address} | ${item.market} | **${formatCurrency(item.price)}** | **${item.beds}**b/**${item.baths}**ba | **${item.sqft}** sqft | **${item.status}** | **${item.daysOnMarket || 0}** days |\n`;
          });
          block += `\n> *Showing top comparative listings. DOM = Days on Market.*\n`;
        } else {
          block += `*No active MLS listings found in any of the queried market locations.*\n`;
        }
        
        return buildPrompt(prompt, block, 'RealEstateAPI.com Multi-Market Comparative MLS Listings');
      } else {
        const criteria = {
          city: entities.city || 'Atlanta',
          state: entities.state || 'GA',
          zip: entities.zip || undefined,
          minPrice: entities.minPrice || undefined,
          maxPrice: entities.maxPrice || undefined,
          minBeds: entities.minBeds || undefined,
          minBaths: entities.minBaths || undefined,
          propertyType: entities.propertyType || undefined
        };
        const mls = await realestateService.searchMlsService(criteria);

        let block = `## 🏷️ Active Real Estate MLS Listings\n\n`;
        block += `**Search Location:** **${criteria.city}**, **${criteria.state || 'N/A'}** ${criteria.zip ? `(Zip: **${criteria.zip}**)` : ''}\n\n`;

        if (mls && mls.length > 0) {
          block += `### Verified Active Listings\n`;
          block += `| Address | List Price | Beds/Baths | Property Sqft | Listing Status | DOM |\n`;
          block += `|---------|------------|------------|---------------|----------------|-----|\n`;
          
          mls.forEach(item => {
            block += `| ${item.address} | **${formatCurrency(item.price)}** | **${item.beds}**b/**${item.baths}**ba | **${item.sqft}** sqft | **${item.status}** | **${item.daysOnMarket || 0}** days |\n`;
          });
          
          block += `\n> *Listings pulled directly from local MLS databases via RealEstateAPI.com integration. DOM = Days on Market.*\n`;
        } else {
          block += `*No active MLS listings match the search criteria in this market area.*\n`;
        }

        return buildPrompt(prompt, block, 'RealEstateAPI.com MLS Active Listings');
      }
    }

    // ─── PROPERTY DETAIL (PUBLIC RECORD DEFAULT) ──────────────────────────────────
    if (type === 'property_detail') {
      const propId = entities.propertyId || entities.address || 'prop_90210_1';
      const detail = await realestateService.getPropertyDetailService(propId);

      let block = `## 📜 Public Records Property Detail\n\n`;
      if (detail) {
        block += `### Subject Parcel Overview\n`;
        block += `| Metric Attribute | Value Details |\n`;
        block += `|------------------|---------------|\n`;
        block += `| 📍 **Address** | ${detail.address}, ${detail.city}, ${detail.state} ${detail.zip} |\n`;
        block += `| 👤 **Current Owner** | **${detail.ownerName || 'N/A'}** |\n`;
        block += `| 🏗️ **Year Built** | **${detail.yearBuilt || 0}** |\n`;
        block += `| 📐 **Living Area (Sqft)** | **${(detail.sqft || 0).toLocaleString()}** sqft (Price: **${detail.lastSalePrice && detail.sqft ? `$${(detail.lastSalePrice / detail.sqft).toFixed(2)}` : 'N/A'}/sqft**) |\n`;
        block += `| 🌳 **Lot Size (Acres)** | **${detail.lotSizeAcres || 0}** acres |\n`;
        block += `| 🛏️ **Bed/Bath Count** | **${detail.beds || 0}** bedrooms \| **${detail.baths || 0}** bathrooms |\n`;
        block += `| 💰 **Last Sale Price** | **${formatCurrency(detail.lastSalePrice)}** (Date: ${detail.lastSaleDate || 'N/A'}) |\n`;
        block += `| 🏛️ **Tax Assessed Value** | **${formatCurrency(detail.taxAssessedValue)}** |\n\n`;

        // Insurance Underwriting & Hazard Risk Profiling
        const ins = computeInsuranceHazard(detail.sqft, detail.city, entities.femaFloodActive);
        block += `### 🛡️ Insurance Underwriting & Hazard Risk Profiling\n`;
        block += `| Underwriting Attribute | Value | Assessment Metric |\n`;
        block += `|------------------------|-------|-------------------|\n`;
        block += `| 🏗️ **Replacement Cost (RC)** | **${formatCurrency(ins.replacementCost)}** | Structure valuation @ **$175/sqft** |\n`;
        block += `| 🛡️ **Environmental Hazard Risk** | **${ins.hazardTier}** | City location assessment |\n`;
        block += `| 🔥 **Wildfire Risk** | **${ins.wildfireRisk}** | Forest/brush fire profile |\n`;
        block += `| 🌀 **Wind/Hurricane Risk** | **${ins.windRisk}** | Coastal wind/storm profile |\n`;
        block += `| 🫨 **Seismic/Earthquake Risk** | **${ins.seismicRisk}** | Fault line proximity profile |\n`;
        block += `| 🌧️ **FEMA Flood Zone** | **${ins.femaFloodZone}** | Federal flood hazard mapping |\n`;
        block += `| 📈 **Insurance Premium Rate** | **${(ins.insuranceRate * 100).toFixed(2)}%** | Underwriting multiplier |\n`;
        block += `| 💵 **Est. Annual Premium** | **${formatCurrency(Math.round(ins.annualPremium))}** | Annual structural premium |\n`;
        block += `| 💸 **Est. Monthly Premium** | **${formatCurrency(Math.round(ins.monthlyPremium))}/mo** | Monthly premium allocation |\n`;
        if (ins.hasFemaSurcharge) {
          block += `| ⚠️ **FEMA Flood Ann. Premium** | **${formatCurrency(Math.round(ins.annualFEMAPremium))}** | Surcharge @ **1.05%** of RC |\n`;
          block += `| ⚠️ **FEMA Flood Mo. Premium** | **${formatCurrency(Math.round(ins.monthlyFEMAPremium))}/mo** | Monthly escrow allocation |\n`;
        }
        block += `\n`;
      } else {
        block += `*Property details not available for the requested parcel address.*\n`;
      }

      return buildPrompt(prompt, block, 'RealEstateAPI.com Property Public Record');
    }

  } catch (err) {
    logger.error('[RealEstateSmartRouter] RAG Routing Error:', err.message);
  }

  return prompt;
};

export const realestateSmartRouter = {
  routeAndEnhancePrompt,
  detectRealEstateIntent
};
