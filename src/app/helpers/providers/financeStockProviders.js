/**
 * financeStockProviders.js — Modular Finance & Technical Indicators Search Provider
 *
 * Conforming to the standard SearchProvider contract, leveraging massiveFinanceRouteAndEnhancePrompt
 * to fetch and format real-time stock quotes, technical indicators, fundamental reports, and options chains.
 */

import { logger } from '../../../shared/logger.js';
import { massiveFinanceRouteAndEnhancePrompt } from '../massiveSmartRouter.js';
import { detectFinancialIntent } from '../massiveTickerDB.js';
import { sanitizeQueryString } from '../SearchEngineRegistry.js';

function extractDataBlock(enhancedPrompt, originalPrompt) {
  if (!enhancedPrompt || enhancedPrompt === originalPrompt) return null;
  const parts = enhancedPrompt.split(/[━]{20,}/);
  if (parts.length >= 3) {
    let dataBlock = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;
      if (
        part.includes('SYSTEM INSTRUCTION') ||
        part.includes('MANDATORY RESPONSE RULES') ||
        part.includes('User Query:')
      ) {
        continue;
      }
      if (part.length > dataBlock.length) {
        dataBlock = part;
      }
    }
    if (dataBlock.trim()) return dataBlock.trim();
  }

  let cleaned = enhancedPrompt;
  if (cleaned.includes('Live Watchlist Dashboard')) {
    cleaned = cleaned.substring(cleaned.indexOf('Live Watchlist Dashboard'));
  }
  return cleaned;
}

function parseFinancialMetadata(markdown, fallbackTicker) {
  const priceMatch =
    markdown.match(
      /(?:Current Price|Price|Last Price|Last Trade|Price \*\*|\*\*Price\*\*|\*\*Current Price\*\*):?\s*\$?([0-9,]+(?:\.\d+)?)/i
    ) || markdown.match(/\*\*([0-9,]+(?:\.\d+)?)\*\*/);
  const changeMatch =
    markdown.match(
      /(?:Change|Day Change|Δ):?\s*([+-]?\$?[0-9,]+(?:\.\d+)?)/i
    ) || markdown.match(/([+-]\d+(?:\.\d+)?)%/);
  const changePctMatch = markdown.match(
    /(?:Change %|Pct Change|Percent Change|ChangePct):?\s*([+-]?\d+(?:\.\d+)?)%/i
  );
  const highMatch = markdown.match(
    /(?:High|Day High):?\s*\$?([0-9,]+(?:\.\d+)?)/i
  );
  const lowMatch = markdown.match(
    /(?:Low|Day Low):?\s*\$?([0-9,]+(?:\.\d+)?)/i
  );
  const volumeMatch = markdown.match(/(?:Volume|Avg Volume):?\s*([0-9,]+)/i);

  const price = priceMatch
    ? Number(String(priceMatch[1] || priceMatch[0]).replace(/[^0-9.]/g, ''))
    : null;
  const change = changeMatch
    ? Number(String(changeMatch[1]).replace(/[^0-9.\-]/g, ''))
    : null;
  const changePercent = changePctMatch ? Number(changePctMatch[1]) : null;
  const high = highMatch
    ? Number(String(highMatch[1]).replace(/[^0-9.]/g, ''))
    : null;
  const low = lowMatch
    ? Number(String(lowMatch[1]).replace(/[^0-9.]/g, ''))
    : null;
  const volume = volumeMatch
    ? Number(String(volumeMatch[1]).replace(/[^0-9.]/g, ''))
    : null;

  return {
    domain: 'financial_ticker',
    financialTicker: fallbackTicker?.toUpperCase() || 'AAPL',
    price: Number.isFinite(price) ? price : null,
    change: Number.isFinite(change) ? change : null,
    changePercent: Number.isFinite(changePercent) ? changePercent : null,
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null,
    volume: Number.isFinite(volume) ? volume : null,
    lastUpdated: new Date().toISOString(),
  };
}

export const FinanceStockProvider = {
  id: 'financial_ticker',
  category: 'finance',
  cacheTTL: 10, // Stock quotes are extremely fast-moving, 10s cache TTL is optimal
  citationLabel: 'Massive.com Real-Time Stock Feed & Technical Analytics',
  mandatoryRule:
    '▸ Present all stock tickers and options data in clean Markdown tables',

  detectIntent: (query) => {
    try {
      const intent = detectFinancialIntent(query);
      return !!intent;
    } catch (err) {
      logger.error(
        `[FinanceStockProvider] Intent detection crash: ${err.message}`
      );
      return false;
    }
  },

  extractTopic: (query) => {
    try {
      const intent = detectFinancialIntent(query);
      if (!intent) return sanitizeQueryString(query);
      const symbol = intent.symbol || 'AAPL';
      return `${symbol.toUpperCase()}:${intent.type || 'quote'}`;
    } catch (err) {
      return sanitizeQueryString(query);
    }
  },

  fetch: async (topic, originalQuery) => {
    const query = originalQuery || topic;
    logger.info(
      `[FinanceStockProvider] Executing live query via massiveFinanceRouteAndEnhancePrompt: "${query.substring(0, 50)}..."`
    );

    try {
      const enhanced = await massiveFinanceRouteAndEnhancePrompt(query);
      const markdown = extractDataBlock(enhanced, query);

      if (!markdown) {
        return null;
      }

      const intent = detectFinancialIntent(query);
      const financialTicker = intent?.symbol
        ? intent.symbol.toUpperCase()
        : 'AAPL';
      const metadata = parseFinancialMetadata(markdown, financialTicker);

      return { markdown, metadata };
    } catch (err) {
      logger.error(`[FinanceStockProvider] Fetch error: ${err.message}`);
      return null;
    }
  },
};
