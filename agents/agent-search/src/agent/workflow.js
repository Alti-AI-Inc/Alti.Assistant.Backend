/**
 * @fileoverview Search agent workflow — three-stage pipeline.
 *
 *   classifyIntent  →  executeSearch  →  synthesizeResults
 *
 * Uses a plain async pipeline (no LangGraph dependency) to keep the agent
 * lightweight. The state object flows through each node in sequence.
 *
 * classifyIntent:   rule-based query type detection with optional site restrictions
 * executeSearch:    calls SearchService (Gemini 3.5 Flash + Google Search Grounding)
 * synthesizeResults: pass-through — Gemini's grounding already synthesises the answer
 */

import { SearchService } from '../services/searchService.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('search-workflow');

// ── Singleton service instance ──────────────────────────────────────────────
let _searchService;
function getSearchService() {
  if (!_searchService) _searchService = new SearchService();
  return _searchService;
}

// ── Query type → site restriction mapping ───────────────────────────────────
const QUERY_TYPE_PATTERNS = [
  {
    type: 'academic',
    keywords: ['research', 'study', 'paper', 'journal', 'thesis', 'peer-reviewed', 'citation', 'doi', 'arxiv', 'pubmed', 'scholar'],
    sites: 'site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR site:scholar.google.com OR site:nature.com OR site:ieee.org',
  },
  {
    type: 'news',
    keywords: ['news', 'latest', 'breaking', 'headline', 'report', 'announced', 'update', 'today'],
    sites: '',
    suffix: 'news latest',
  },
  {
    type: 'medical',
    keywords: ['symptom', 'treatment', 'diagnosis', 'medication', 'drug', 'disease', 'clinical', 'health', 'medical', 'doctor', 'hospital', 'surgery', 'prescription'],
    sites: 'site:nih.gov OR site:fda.gov OR site:who.int OR site:cdc.gov OR site:pubmed.ncbi.nlm.nih.gov',
  },
  {
    type: 'financial',
    keywords: ['stock', 'market', 'invest', 'portfolio', 'dividend', 'earnings', 'revenue', 'ipo', 'nasdaq', 'dow', 'sp500', 's&p', 'bull', 'bear', 'trading', 'forex', 'etf', 'mutual fund'],
    sites: 'site:finance.yahoo.com OR site:bloomberg.com OR site:reuters.com OR site:sec.gov OR site:investopedia.com',
  },
  {
    type: 'weather',
    keywords: ['weather', 'forecast', 'temperature', 'rain', 'snow', 'humidity', 'wind', 'storm'],
    sites: 'site:weather.gov OR site:noaa.gov OR site:accuweather.com OR site:weather.com',
  },
  {
    type: 'legal',
    keywords: ['law', 'legal', 'court', 'ruling', 'statute', 'legislation', 'attorney', 'lawyer', 'precedent', 'constitution', 'regulation'],
    sites: 'site:courtlistener.com OR site:justia.com OR site:law.cornell.edu OR site:findlaw.com',
  },
  {
    type: 'sports',
    keywords: ['game', 'score', 'match', 'team', 'player', 'season', 'league', 'championship', 'nba', 'nfl', 'nhl', 'mlb', 'fifa', 'ufc', 'espn'],
    sites: 'site:espn.com OR site:nba.com OR site:nfl.com OR site:nhl.com OR site:mlb.com',
  },
  {
    type: 'technology',
    keywords: ['software', 'hardware', 'app', 'startup', 'ai', 'machine learning', 'algorithm', 'tech', 'gadget', 'release', 'open source'],
    sites: '',
  },
  {
    type: 'crypto',
    keywords: ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'defi', 'nft', 'token', 'wallet', 'mining', 'altcoin', 'solana'],
    sites: 'site:coinmarketcap.com OR site:coingecko.com OR site:coindesk.com OR site:cointelegraph.com',
  },
  {
    type: 'travel',
    keywords: ['flight', 'hotel', 'booking', 'travel', 'vacation', 'trip', 'destination', 'airline', 'airport', 'tourism'],
    sites: 'site:tripadvisor.com OR site:booking.com OR site:expedia.com OR site:lonelyplanet.com',
  },
  {
    type: 'entertainment',
    keywords: ['movie', 'film', 'tv show', 'series', 'actor', 'actress', 'director', 'imdb', 'netflix', 'streaming', 'album', 'artist', 'concert'],
    sites: 'site:imdb.com OR site:rottentomatoes.com OR site:metacritic.com OR site:billboard.com',
  },
];

// ── Node 1: classifyIntent ──────────────────────────────────────────────────

/**
 * Rule-based intent classifier. Scores each query type by keyword hits
 * and returns the best match with optional site restrictions.
 */
function classifyIntent(state) {
  const query = (state.query || '').toLowerCase();
  let bestType = 'general';
  let bestScore = 0;
  let bestSites = '';
  let suffix = '';

  for (const pattern of QUERY_TYPE_PATTERNS) {
    let score = 0;
    for (const kw of pattern.keywords) {
      if (query.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = pattern.type;
      bestSites = pattern.sites || '';
      suffix = pattern.suffix || '';
    }
  }

  logger.info('classifyIntent', { queryType: bestType, score: bestScore });

  return {
    ...state,
    queryType: bestType,
    siteRestrictions: bestSites,
    _querySuffix: suffix,
  };
}

// ── Node 2: executeSearch ───────────────────────────────────────────────────

/**
 * Calls SearchService with the (optionally enriched) prompt.
 */
async function executeSearch(state) {
  const svc = getSearchService();

  // Optionally enrich the prompt with site restrictions
  let enrichedPrompt = state.query;
  if (state.siteRestrictions) {
    enrichedPrompt = `${state.query} (${state.siteRestrictions})`;
  } else if (state._querySuffix) {
    enrichedPrompt = `${state.query} ${state._querySuffix}`;
  }

  const result = await svc.executeSearch(enrichedPrompt, state.userContext, {
    conversationHistory: state.conversationHistory,
  });

  return {
    ...state,
    results: result,
    sources: result.references || [],
    response: result.content || '',
  };
}

// ── Node 3: synthesizeResults ───────────────────────────────────────────────

/**
 * Pass-through: Gemini's grounding already synthesises the answer.
 * We only attach the queryType to final metadata.
 */
function synthesizeResults(state) {
  if (state.results?.metadata) {
    state.results.metadata.queryType = state.queryType;
  }
  return state;
}

// ── Pipeline runner ─────────────────────────────────────────────────────────

/**
 * Run the full search workflow pipeline.
 *
 * @param {{ query: string, conversationHistory?: Array, userContext?: object }} input
 * @returns {Promise<object>} The final results object
 */
export async function runWorkflow(input) {
  let state = {
    query: input.query || '',
    conversationHistory: input.conversationHistory || [],
    userContext: input.userContext || {},
    queryType: 'general',
    siteRestrictions: '',
    results: null,
    sources: [],
    response: '',
  };

  state = classifyIntent(state);
  state = await executeSearch(state);
  state = synthesizeResults(state);

  return state.results;
}

/**
 * Run the streaming search workflow.
 * Returns an async generator yielding SSE-compatible chunks.
 */
export async function* runStreamingWorkflow(input) {
  const svc = getSearchService();

  let state = {
    query: input.query || '',
    conversationHistory: input.conversationHistory || [],
    userContext: input.userContext || {},
    queryType: 'general',
    siteRestrictions: '',
  };

  state = classifyIntent(state);

  let enrichedPrompt = state.query;
  if (state.siteRestrictions) {
    enrichedPrompt = `${state.query} (${state.siteRestrictions})`;
  } else if (state._querySuffix) {
    enrichedPrompt = `${state.query} ${state._querySuffix}`;
  }

  yield* svc.executeStreamingSearch(enrichedPrompt, state.userContext, {
    conversationHistory: state.conversationHistory,
  });
}

export default { runWorkflow, runStreamingWorkflow };
