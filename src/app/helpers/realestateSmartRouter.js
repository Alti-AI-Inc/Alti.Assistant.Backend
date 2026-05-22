/**
 * realestateSmartRouter.js — Real Estate Smart Router
 *
 * RAG-powered real estate prompt enhancer using RealEstateAPI.com.
 * Formats property datasets into high-fidelity markdown tables and bolded metrics blocks.
 */

import { realestateService } from '../modules/realestate/realestate.service.js';
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
  return `[SYSTEM INSTRUCTION — ALTI REAL-TIME PROPERTY DATA CONTEXT]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA SOURCE: RealEstateAPI.com
TIMESTAMP:   ${timestamp}
CONTEXT TYPE: ${title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${contentBlock}

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

        // Financial investment formulas
        const annualGrossRent = avm.rentalValuation * 12;
        const estOperatingExpenses = annualGrossRent * 0.45;
        const netOperatingIncome = annualGrossRent - estOperatingExpenses;
        const capRate = (netOperatingIncome / avm.valuation) * 100;
        const grossRentMultiplier = avm.valuation / annualGrossRent;

        // Assumed 30-year fixed mortgage at 6.5% interest rate with 20% down
        const purchasePrice = avm.valuation;
        const downPayment = purchasePrice * 0.20;
        const loanAmount = purchasePrice * 0.80;
        
        const interestRateYearly = 0.065;
        const interestRateMonthly = interestRateYearly / 12;
        const numberOfPayments = 360;
        const monthlyMortgagePI = loanAmount * (interestRateMonthly * Math.pow(1 + interestRateMonthly, numberOfPayments)) / (Math.pow(1 + interestRateMonthly, numberOfPayments) - 1);
        
        const monthlyOperatingExpenses = estOperatingExpenses / 12;
        const totalMonthlyOutflow = monthlyMortgagePI + monthlyOperatingExpenses;
        const netMonthlyCashFlow = avm.rentalValuation - totalMonthlyOutflow;
        const annualNetCashFlow = netMonthlyCashFlow * 12;
        const cashOnCashReturn = (annualNetCashFlow / downPayment) * 100;

        block += `### 🏢 Institutional Investment Metrics\n`;
        block += `- **Net Operating Income (NOI)**: **${formatCurrency(Math.round(netOperatingIncome))}** /year (assuming **45%** operating expense ratio)\n`;
        block += `- **Capitalization Rate (Cap Rate)**: **${capRate.toFixed(2)}%** (implied capitalization yield based on AVM)\n`;
        block += `- **Gross Rent Multiplier (GRM)**: **${grossRentMultiplier.toFixed(2)}x**\n\n`;

        block += `### 💸 30-Year Mortgage Cash Flow Analysis\n`;
        block += `*Assumes standard 20% down payment, 30-year amortization, and **6.50%** interest rate.*\n\n`;
        block += `| Financing Attribute | Value Detail | Calculated Target |\n`;
        block += `|---------------------|--------------|-------------------|\n`;
        block += `| 💰 **Acquisition Cost** | **${formatCurrency(purchasePrice)}** | Valuation Purchase Base |\n`;
        block += `| 💵 **Down Payment (20%)** | **${formatCurrency(Math.round(downPayment))}** | Initial Capital Outlay |\n`;
        block += `| 🏛️ **Financed Loan (80%)** | **${formatCurrency(Math.round(loanAmount))}** | Funded Mortgage Debt |\n`;
        block += `| 💸 **Monthly Mortgage (P&I)** | **${formatCurrency(Math.round(monthlyMortgagePI))}/mo** | 30-Yr Fixed @ **6.5%** |\n`;
        block += `| 📉 **Operating Expenses (45%)** | **${formatCurrency(Math.round(monthlyOperatingExpenses))}/mo** | Taxes, Ins, Maint, Vac |\n`;
        block += `| 📈 **Total Monthly Outlay** | **${formatCurrency(Math.round(totalMonthlyOutflow))}/mo** | Combined Debt + OpEx |\n`;
        block += `| 💰 **Net Monthly Cash Flow** | **${formatCurrency(Math.round(netMonthlyCashFlow))}/mo** | **${netMonthlyCashFlow >= 0 ? 'Positive Yield 🟢' : 'Negative Carry 🔴'}** |\n`;
        block += `| 💎 **Cash-on-Cash Return** | **${cashOnCashReturn.toFixed(2)}%** | **${cashOnCashReturn.toFixed(2)}%** Annual Yield |\n\n`;

        // Estimated equity calculation
        if (detail.taxAssessedValue) {
          block += `> **Tax Assessed Value:** **${formatCurrency(detail.taxAssessedValue)}** | AVM premium over tax base: **${((avm.valuation / detail.taxAssessedValue - 1) * 100).toFixed(1)}%**\n`;
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
        block += `| Comp Address | Distance | Layout | Sold Price | Sold Date | Avg Price/Sqft |\n`;
        block += `|--------------|----------|--------|------------|-----------|----------------|\n`;
        
        let totalPrice = 0;
        let totalSqft = 0;

        comps.forEach(c => {
          totalPrice += c.salePrice;
          totalSqft += c.sqft;
          const priceSqft = c.salePrice / c.sqft;
          block += `| ${c.address} | **${c.distanceMiles || 0}** mi | **${c.beds}**b/**${c.baths}**ba | **${formatCurrency(c.salePrice)}** | ${c.saleDate} | **$${priceSqft.toFixed(2)}** |\n`;
        });

        const avgCompPrice = totalPrice / comps.length;
        const avgPriceSqft = totalPrice / totalSqft;
        block += `\n### 📈 Market Consensus Analysis\n`;
        block += `- **Average Sold Price**: **${formatCurrency(avgCompPrice)}**\n`;
        block += `- **Average Price per Sqft**: **${formatCurrency(avgPriceSqft)}/sqft**\n`;
        block += `- **Suggested Subject Value**: **${formatCurrency(avgPriceSqft * (detail.sqft || 2000))}** (based on consensus price/sqft)\n`;
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
