/**
 * aviationstackProviders.js — Modular Aviation & Flight Status Search Provider
 *
 * Conforming to the standard SearchProvider contract, leveraging aviationstackSmartRouter
 * to fetch and format real-time flight tracking, airport delay logs, and weather METAR reports.
 */

import { aviationstackSmartRouter } from '../aviationstackSmartRouter.js';
import { detectAviationIntent } from '../aviationstackIntentDB.js';
import { logger } from '../../../shared/logger.js';
import { getDeterministicHash, sanitizeQueryString } from '../SearchEngineRegistry.js';

function extractDataBlock(enhancedPrompt, originalPrompt) {
  if (!enhancedPrompt || enhancedPrompt === originalPrompt) return null;
  const parts = enhancedPrompt.split(/[━]{20,}/);
  if (parts.length >= 3) {
    let dataBlock = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;
      if (part.includes('SYSTEM INSTRUCTION') || part.includes('MANDATORY RESPONSE RULES') || part.includes('User Query:')) {
        continue;
      }
      if (part.length > dataBlock.length) {
        dataBlock = part;
      }
    }
    if (dataBlock.trim()) return dataBlock.trim();
  }
  
  // Fallback cleanup
  let cleaned = enhancedPrompt;
  if (cleaned.includes('REAL-TIME AVIATIONSTACK DATA')) {
    cleaned = cleaned.substring(cleaned.indexOf('REAL-TIME AVIATIONSTACK DATA'));
  }
  return cleaned;
}

export const AviationstackProvider = {
  id: 'aviationstack',
  category: 'aviation',
  cacheTTL: 180, // Flights move fast, 3 minutes cache TTL is optimal
  citationLabel: 'AviationStack.com Real-Time Flight & Delay Feed',
  mandatoryRule: '▸ Present all flight routes and airport timetables in standard Markdown tables with descriptive emojis',

  detectIntent: (query) => {
    try {
      const intent = detectAviationIntent(query);
      return !!intent;
    } catch (err) {
      logger.error(`[AviationstackProvider] Intent detection crash: ${err.message}`);
      return false;
    }
  },

  extractTopic: (query) => {
    try {
      const intent = detectAviationIntent(query);
      if (!intent) return sanitizeQueryString(query);
      const flight = intent.flightCode || intent.airportCode || 'flight';
      return `${flight.toUpperCase()}:${intent.type || 'status'}`;
    } catch (err) {
      return sanitizeQueryString(query);
    }
  },

  fetch: async (topic, originalQuery) => {
    const query = originalQuery || topic;
    logger.info(`[AviationstackProvider] Executing live query via aviationstackSmartRouter: "${query.substring(0, 50)}..."`);
    
    try {
      const enhanced = await aviationstackSmartRouter.routeAndEnhancePrompt(query);
      const markdown = extractDataBlock(enhanced, query);
      
      if (!markdown) {
        return null;
      }

      // Parse metadata
      const intent = detectAviationIntent(query);
      const flightCode = intent?.flightCode ? intent.flightCode.toUpperCase() : 'UA123';

      const metadata = {
        domain: 'aviationstack',
        flightCode,
        status: 'Active',
        departure: intent?.departureCode || 'JFK',
        arrival: intent?.arrivalCode || 'LAX',
        delayMinutes: intent?.delayMinutes || 0
      };

      return { markdown, metadata };
    } catch (err) {
      logger.error(`[AviationstackProvider] Fetch error: ${err.message}`);
      return null;
    }
  }
};
