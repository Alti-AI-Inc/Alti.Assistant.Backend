/**
 * sportsBettingProviders.js — Modular Sports Betting & Odds Search Provider
 *
 * Conforming to the standard SearchProvider contract, leveraging sportsSmartRouter
 * to fetch and format real-time sports betting information.
 */

import { logger } from '../../../shared/logger.js';
import { sanitizeQueryString } from '../SearchEngineRegistry.js';
import { sportsSmartRouter } from '../sportsSmartRouter.js';

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
  if (cleaned.includes('REAL-TIME SPORTS INTELLIGENCE INJECTOR')) {
    cleaned = cleaned.substring(
      cleaned.indexOf('REAL-TIME SPORTS INTELLIGENCE INJECTOR')
    );
  }
  return cleaned;
}

function parseSportsMetadata(markdown) {
  const matchup = markdown.match(
    /(?:Matchup|Game|Event)\s*\|\s*([^\n]+?)\s+vs\.?\s+([^\n|]+)|([A-Za-z0-9 .'-]+)\s+vs\.?\s+([A-Za-z0-9 .'-]+)/i
  );
  const odds = [...markdown.matchAll(/([+-]\d{2,3})/g)].map((m) => m[1]);
  const spreadMatch = markdown.match(/Spread\s*\|\s*([+-]?\d+(?:\.\d+)?)/i);
  const totalMatch = markdown.match(/Total\s*\|\s*([0-9]+(?:\.\d+)?)/i);

  return {
    domain: 'sports_odds',
    homeTeam: matchup?.[1]?.trim() || matchup?.[3]?.trim() || 'Home Team',
    awayTeam: matchup?.[2]?.trim() || matchup?.[4]?.trim() || 'Away Team',
    homeMoneyline: odds[0] || '+100',
    awayMoneyline: odds[1] || '-110',
    spread: spreadMatch ? spreadMatch[1] : null,
    totalOverUnder: totalMatch ? totalMatch[1] : null,
    lastUpdated: new Date().toISOString(),
  };
}

export const SportsBettingProvider = {
  id: 'sports_odds',
  category: 'sports',
  cacheTTL: 60, // Fast-moving odds, 1 minute cache TTL
  citationLabel: 'PredictionData.io Live Sports Odds Feed & API-Sports',
  mandatoryRule:
    '▸ Present all betting odds in **BOLD** (e.g. **-115**, **+140**) and use Markdown tables for comparisons',

  detectIntent: (query) => {
    try {
      const intent = sportsSmartRouter.detectSportsIntent(query);
      return !!intent;
    } catch (err) {
      logger.error(`[SportsProvider] Intent detection crash: ${err.message}`);
      return false;
    }
  },

  extractTopic: (query) => {
    try {
      const intent = sportsSmartRouter.detectSportsIntent(query);
      if (!intent) return sanitizeQueryString(query);
      return `${intent.league || 'NFL'}:${intent.type || 'odds'}`;
    } catch (err) {
      return sanitizeQueryString(query);
    }
  },

  fetch: async (topic, originalQuery) => {
    const query = originalQuery || topic;
    logger.info(
      `[SportsProvider] Executing live query via sportsSmartRouter: "${query.substring(0, 50)}..."`
    );

    try {
      const enhanced = await sportsSmartRouter.routeAndEnhancePrompt(query);
      const markdown = extractDataBlock(enhanced, query);

      if (!markdown) {
        return null;
      }

      const metadata = parseSportsMetadata(markdown);
      return { markdown, metadata };
    } catch (err) {
      logger.error(`[SportsProvider] Fetch error: ${err.message}`);
      return null;
    }
  },
};
