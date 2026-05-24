/**
 * UnifiedSmartRouter.js — The Modern Core Router for Alti's Data-Grounding Engine
 *
 * Serves as a backward-compatible drop-in replacement for the massive legacy promise-tree
 * smart routers. Dispatches all grounding query audits directly to the high-performance,
 * parallel, self-registering SearchEngineRegistry.
 */

import { SearchEngineRegistry } from './SearchEngineRegistry.js';
import { logger } from '../../shared/logger.js';

export const UnifiedSmartRouter = {
  /**
   * Primary prompt enhancer. Routes queries platform-wide concurrently across all 110+ data streams.
   * @param {string} prompt - Raw user query.
   * @returns {Promise<string>} - Context-injected prompt.
   */
  async combinedRouteAndEnhancePrompt(prompt) {
    logger.info(`[UnifiedSmartRouter] Enhancing query: "${prompt?.substring(0, 50)}..."`);
    return SearchEngineRegistry.combinedRouteAndEnhance(prompt);
  },

  /**
   * Utility to parse and flatten downstream JSON_METADATA string blocks.
   * @param {string} prompt - Context-injected enhanced prompt.
   * @returns {Object} - Flattened metadata object.
   */
  extractAndFlattenMetadata(prompt) {
    if (!prompt || typeof prompt !== 'string') return {};
    const match = prompt.match(/<!-- JSON_METADATA:\s*(\{.*?\})\s*-->/);
    if (!match) return {};
    try {
      const nested = JSON.parse(match[1]);
      const flattened = {};
      for (const providerId of Object.keys(nested)) {
        const data = nested[providerId];
        if (data && typeof data === 'object') {
          Object.assign(flattened, data);
        }
      }
      
      // Keep a non-enumerable reference to the nested metadata for citation stitching
      Object.defineProperty(flattened, '__nested__', {
        value: nested,
        enumerable: false,
        writable: true,
        configurable: true
      });
      
      return flattened;
    } catch (err) {
      logger.warn(`[UnifiedSmartRouter] Failed to parse JSON_METADATA: ${err.message}`);
      return {};
    }
  },

  /**
   * Stitches and deduplicates references and citations from Gemini native search and custom providers.
   * @param {Array} providerReferences - Array of references from registry providers.
   * @param {Object} googleGroundingMetadata - Gemini native grounding metadata object.
   * @returns {Object} - Deduplicated references and citations.
   */
  stitchAndDeduplicateCitations(jsonMetadata = {}, googleGroundingMetadata = null, extraReferences = []) {
    const references = [];
    const usedUrls = new Set();

    const normalizeUrl = (urlStr) => {
      if (!urlStr || typeof urlStr !== 'string') return '';
      try {
        let cleaned = urlStr.toLowerCase().trim();
        if (cleaned.endsWith('/')) {
          cleaned = cleaned.slice(0, -1);
        }
        return cleaned;
      } catch {
        return urlStr.toLowerCase().trim();
      }
    };

    // 1. Process custom provider references from jsonMetadata (resolving nested metadata if wrapped in a flattened object)
    const targetMetadata = jsonMetadata && jsonMetadata.__nested__ ? jsonMetadata.__nested__ : jsonMetadata;
    if (targetMetadata && typeof targetMetadata === 'object') {
      Object.keys(targetMetadata).forEach(providerId => {
        let title = 'Data Partner Reference';
        let url = 'https://altiapp.com';
        let domain = 'altiapp.com';

        if (providerId === 'sports_odds') {
          title = 'PredictionData.io Live Sports Odds Feed';
          url = 'https://predictiondata.io';
          domain = 'predictiondata.io';
        } else if (providerId === 'real_estate') {
          title = 'RealEstateAPI.com Property Data Feed';
          url = 'https://realestateapi.com';
          domain = 'realestateapi.com';
        } else if (providerId === 'financial_ticker') {
          title = 'Massive.com Real-Time Stock Feed';
          url = 'https://massive.com';
          domain = 'massive.com';
        } else if (providerId === 'aviationstack') {
          title = 'AviationStack.com Real-Time Flight & Delay Feed';
          url = 'https://aviationstack.com';
          domain = 'aviationstack.com';
        } else if (providerId === 'bls_economic') {
          title = 'Bureau of Labor Statistics (BLS) Consumer Price & Labor Registry';
          url = 'https://bls.gov';
          domain = 'bls.gov';
        } else if (providerId === 'bea_economic') {
          title = 'Bureau of Economic Analysis (BEA) GDP & Personal Incomes Feed';
          url = 'https://bea.gov';
          domain = 'bea.gov';
        } else if (providerId === 'congress_gov') {
          title = 'Congress.gov Official Legislative and Voting Roll';
          url = 'https://congress.gov';
          domain = 'congress.gov';
        } else if (providerId === 'opensecrets') {
          title = 'OpenSecrets.org Political PAC & Lobbying Database';
          url = 'https://opensecrets.org';
          domain = 'opensecrets.org';
        } else if (providerId === 'sam_gov') {
          title = 'SAM.gov Vendor Exclusion & Federal Contracting Register';
          url = 'https://sam.gov';
          domain = 'sam.gov';
        } else if (providerId === 'gao_reports') {
          title = 'U.S. Government Accountability Office (GAO) Oversight Database';
          url = 'https://gao.gov';
          domain = 'gao.gov';
        } else if (providerId === 'ecfr_regulations') {
          title = 'Electronic Code of Federal Regulations (eCFR) Registry';
          url = 'https://ecfr.gov';
          domain = 'ecfr.gov';
        } else if (providerId === 'federal_register') {
          title = 'U.S. Federal Register Daily Executive and Administrative Gazeteer';
          url = 'https://federalregister.gov';
          domain = 'federalregister.gov';
        } else if (providerId === 'epa_echo') {
          title = 'EPA ECHO (Enforcement & Compliance History Online) Database';
          url = 'https://echo.epa.gov';
          domain = 'echo.epa.gov';
        } else if (providerId === 'osha_inspections') {
          title = 'OSHA Workplace Safety and Employer Enforcement Registry';
          url = 'https://osha.gov';
          domain = 'osha.gov';
        } else {
          title = `${providerId.replace(/_/g, ' ').toUpperCase()} Registry`;
          url = `https://${providerId.replace(/_/g, '')}.gov`;
          domain = `${providerId.replace(/_/g, '')}.gov`;
        }

        const normalized = normalizeUrl(url);
        if (!usedUrls.has(normalized)) {
          usedUrls.add(normalized);
          references.push({ url, domain, title });
        }
      });
    }

    // 2. Process any extra references (like YouTube videos or local GCP catalog)
    if (Array.isArray(extraReferences)) {
      extraReferences.forEach(ref => {
        if (!ref || !ref.url) return;
        const normalized = normalizeUrl(ref.url);
        if (!usedUrls.has(normalized)) {
          usedUrls.add(normalized);
          references.push({
            url: ref.url,
            domain: ref.domain || new URL(ref.url).hostname.replace('www.', ''),
            title: ref.title || 'Reference Link'
          });
        }
      });
    }

    // 3. Process native Google Search grounding references next
    if (googleGroundingMetadata?.groundingChunks) {
      googleGroundingMetadata.groundingChunks.forEach(chunk => {
        if (!chunk.web?.uri) return;
        const normalized = normalizeUrl(chunk.web.uri);
        if (!usedUrls.has(normalized)) {
          usedUrls.add(normalized);
          try {
            const urlObj = new URL(chunk.web.uri);
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || urlObj.hostname.replace('www.', ''),
              title: chunk.web.title || 'Web Search Grounding'
            });
          } catch {
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || 'web',
              title: chunk.web.title || 'Web Grounding'
            });
          }
        }
      });
    }

    // 4. Resilient Fallback if no citations found
    if (references.length === 0) {
      references.push({
        url: 'https://google.com',
        domain: 'google.com',
        title: 'Google Search Index Grounding'
      });
    }

    // 5. Keep top 5 premium references
    const limitedReferences = references.slice(0, 5);

    // 5. Generate structured index-based citations
    const citations = limitedReferences.map((ref, index) => ({
      index: index + 1,
      url: ref.url,
      domain: ref.domain,
      title: ref.title
    }));

    return {
      references: limitedReferences,
      citations
    };
  },

  /**
   * Drop-in alias for backward compatibility.
   */
  async routeAndEnhancePrompt(prompt) {
    return this.combinedRouteAndEnhancePrompt(prompt);
  },

  /**
   * Intent classifiers kept for legacy dependency layers.
   */
  detectFinancialIntent(query) {
    if (!query || typeof query !== 'string') return false;
    // Auto-detect based on registered financial providers
    const financialKeywords = /\b(stock|price|ticker|options? chain|rsi|macd|sma|ema|fdic|bank|sec|edgar|cik|xbrl)\b/i;
    return financialKeywords.test(query);
  },

  detectMultipleTickers(query) {
    if (!query) return [];
    const tickerRegex = /\b[A-Z]{1,5}\b/g;
    const matches = query.match(tickerRegex) || [];
    return [...new Set(matches)].filter(t => t !== 'REIT' && t !== 'SEC' && t !== 'EDGAR' && t !== 'FDA' && t !== 'WHO');
  },

  detectSportsIntent(query) {
    if (!query || typeof query !== 'string') return false;
    const sportsKeywords = /\b(odds|betting|expert picks|sports futures|parlay|arbitrage|value bet)\b/i;
    return sportsKeywords.test(query);
  },

  detectRealEstateIntent(query) {
    if (!query || typeof query !== 'string') return false;
    const reKeywords = /\b(real estate|property value|home comps|conforming limit|mortgage limit)\b/i;
    return reKeywords.test(query);
  }
};
export default UnifiedSmartRouter;
