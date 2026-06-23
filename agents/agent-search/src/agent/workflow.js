/**
 * @fileoverview Search agent workflow — three-stage pipeline.
 *
 *   classifyIntent  →  executeSearch  →  synthesizeResults
 *
 * Uses LangGraph to manage state and allow for more complex routing in the future.
 */

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { SearchService } from '../services/searchService.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('search-workflow');

let _searchService;
function getSearchService() {
  if (!_searchService) _searchService = new SearchService();
  return _searchService;
}

// ── State Schema ─────────────────────────────────────────────────────────────

const SearchState = Annotation.Root({
  query: Annotation({ reducer: (_, v) => v, default: () => '' }),
  conversationHistory: Annotation({ reducer: (_, v) => v, default: () => [] }),
  userContext: Annotation({ reducer: (_, v) => v, default: () => ({}) }),
  queryType: Annotation({ reducer: (_, v) => v, default: () => 'general' }),
  siteRestrictions: Annotation({ reducer: (_, v) => v, default: () => '' }),
  _querySuffix: Annotation({ reducer: (_, v) => v, default: () => '' }),
  results: Annotation({ reducer: (_, v) => v, default: () => null }),
  sources: Annotation({ reducer: (_, v) => v, default: () => [] }),
  response: Annotation({ reducer: (_, v) => v, default: () => '' }),
});

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
    type: 'crypto',
    keywords: ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'defi', 'nft', 'token', 'wallet', 'mining', 'altcoin', 'solana'],
    sites: 'site:coinmarketcap.com OR site:coingecko.com OR site:coindesk.com OR site:cointelegraph.com',
  },
];

// ── Node 1: classifyIntent ──────────────────────────────────────────────────

async function classifyIntent(state) {
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

  // LLM Fallback if heuristics fail for complex queries
  if (bestScore === 0) {
    try {
      const svc = getSearchService();
      // Use Gemini to classify the prompt
      const result = await svc.ai.models.generateContent({
        model: svc.model,
        contents: `Classify the following query into ONE of these categories: academic, news, medical, financial, weather, legal, sports, crypto, general. Output ONLY the category word.\n\nQuery: ${query}`,
        config: { temperature: 0.1, maxOutputTokens: 10 }
      });
      const llmType = (result.text || '').trim().toLowerCase();
      const matchedPattern = QUERY_TYPE_PATTERNS.find(p => p.type === llmType);
      if (matchedPattern) {
        bestType = matchedPattern.type;
        bestSites = matchedPattern.sites || '';
        suffix = matchedPattern.suffix || '';
        logger.info('classifyIntent: LLM fallback used', { queryType: bestType });
      }
    } catch (err) {
      logger.warn('classifyIntent: LLM fallback failed', { error: err.message });
    }
  } else {
    logger.info('classifyIntent: heuristic match', { queryType: bestType, score: bestScore });
  }

  return {
    queryType: bestType,
    siteRestrictions: bestSites,
    _querySuffix: suffix,
  };
}

// ── Node 2: executeSearch ───────────────────────────────────────────────────

async function executeSearch(state) {
  const svc = getSearchService();

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
    results: result,
    sources: result.references || [],
    response: result.content || '',
  };
}

// ── Node 3: synthesizeResults ───────────────────────────────────────────────

function synthesizeResults(state) {
  if (state.results?.metadata) {
    state.results.metadata.queryType = state.queryType;
  }
  return { results: state.results };
}

// ── Build the Graph ──────────────────────────────────────────────────────────

const workflowGraph = new StateGraph(SearchState)
  .addNode('classifyIntent', classifyIntent)
  .addNode('executeSearch', executeSearch)
  .addNode('synthesizeResults', synthesizeResults)
  .addEdge(START, 'classifyIntent')
  .addEdge('classifyIntent', 'executeSearch')
  .addEdge('executeSearch', 'synthesizeResults')
  .addEdge('synthesizeResults', END);

export const searchAgentGraph = workflowGraph.compile();

// ── Pipeline runners ─────────────────────────────────────────────────────────

export async function runWorkflow(input) {
  const resultState = await searchAgentGraph.invoke(input);
  return resultState.results;
}

export async function* runStreamingWorkflow(input) {
  const svc = getSearchService();
  
  // Reuse classifyIntent logic directly for the stream since graph.stream() yields node updates
  // rather than the raw SSE chunks that executeStreamingSearch yields.
  const state = await classifyIntent({ query: input.query || '' });
  
  let enrichedPrompt = input.query || '';
  if (state.siteRestrictions) {
    enrichedPrompt = `${enrichedPrompt} (${state.siteRestrictions})`;
  } else if (state._querySuffix) {
    enrichedPrompt = `${enrichedPrompt} ${state._querySuffix}`;
  }

  yield* svc.executeStreamingSearch(enrichedPrompt, input.userContext || {}, {
    conversationHistory: input.conversationHistory || [],
  });
}

export default { runWorkflow, runStreamingWorkflow, searchAgentGraph };
