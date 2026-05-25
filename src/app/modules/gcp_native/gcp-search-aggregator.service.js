import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// Heuristic sub-query generator for zero-latency, high-reliability query expansion
const generateSubQueries = (query) => {
  const base = query.trim();
  
  // Strip common filler words
  const cleanBase = base
    .replace(/\b(please|tell me about|what is|who is|show me|search for|find)\b/gi, '')
    .trim();

  // If the query is too short, just return variations of the base
  if (cleanBase.split(/\s+/).length <= 2) {
    return [
      base,
      `${base} latest updates`,
      `${base} overview details`
    ];
  }

  // General research query expansion
  return [
    base,
    `${cleanBase} recent news analysis`,
    `${cleanBase} core details specifications`
  ];
};

/**
 * Natively executes a raw Google Custom Search Engine REST request.
 * Supports web and image search modes.
 */
const executeRawSearch = async (query, searchType = 'web', num = 10, start = 1, safe = 'active') => {
  try {
    const apiKey = config.google_search_api_key || process.env.GOOGLE_SEARCH_API_KEY;
    const cx = config.google_engine_id || process.env.GOOGLE_ENGINE_ID;

    if (!apiKey || !cx) {
      throw new Error('Google Search API Key or CSE Engine ID is not configured.');
    }

    const params = {
      q: query,
      key: apiKey,
      cx: cx,
      num: Math.min(num, 10), // Google CSE maximum results per single request is 10
      start: start,
      safe: safe
    };

    if (searchType === 'image') {
      params.searchType = 'image';
    }

    logger.info(`GCP Search Aggregator: Querying CSE "${query}" (type: ${searchType}, start: ${start})...`);

    const response = await axios.get('https://www.googleapis.com/customsearch/v1', { params });
    const items = response.data.items || [];

    if (searchType === 'image') {
      return items.map((item, index) => ({
        title: item.title,
        link: item.link,
        displayLink: item.displayLink,
        snippet: item.snippet || '',
        width: item.image?.width,
        height: item.image?.height,
        thumbnailLink: item.image?.thumbnailLink,
        source: 'google_image',
        index: start + index
      }));
    }

    return items.map((item, index) => ({
      title: item.title,
      link: item.link,
      displayLink: item.displayLink,
      snippet: item.snippet || '',
      formattedUrl: item.formattedUrl,
      source: 'google_web',
      index: start + index
    }));
  } catch (err) {
    logger.error('GCP Search Aggregator Raw Search Error:', err.message);
    // Return empty results array on failure to prevent entire parallel chain from failing
    return [];
  }
};

/**
 * Executes a highly parallelized sub-query search aggregator.
 * Generates 3 sub-queries, executes them concurrently, and merges, deduplicates, and scores results.
 */
const executeParallelSearch = async (query, searchType = 'web', numResults = 10, safe = 'active') => {
  try {
    logger.info(`GCP Search Aggregator: Initiating parallel search for "${query}" (mode: ${searchType})...`);

    const subQueries = generateSubQueries(query);
    logger.info(`GCP Search Aggregator: Generated sub-queries: ${JSON.stringify(subQueries)}`);

    // Execute all three searches in parallel using Promise.all
    const searchPromises = subQueries.map(subQ => executeRawSearch(subQ, searchType, 10, 1, safe));
    const resultsArrays = await Promise.all(searchPromises);

    // Merge all results
    const allResults = resultsArrays.flat();

    // Deduplicate by link
    const uniqueMap = new Map();
    for (const res of allResults) {
      if (!uniqueMap.has(res.link)) {
        uniqueMap.set(res.link, res);
      }
    }
    const deduplicatedResults = Array.from(uniqueMap.values());

    // Score and rerank results based on keyword density
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    const scoredResults = deduplicatedResults.map(res => {
      let score = 0;
      const title = res.title.toLowerCase();
      const snippet = res.snippet.toLowerCase();

      for (const term of queryTerms) {
        if (title.includes(term)) score += 10; // Extra weight for title matches
        if (snippet.includes(term)) score += 2;
      }

      return { ...res, relevanceScore: score };
    });

    // Sort by relevanceScore descending
    scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Trim to requested size
    const finalResults = scoredResults.slice(0, numResults).map((res, idx) => ({
      ...res,
      finalRank: idx + 1
    }));

    logger.info(`GCP Search Aggregator: Parallel search completed. Deduplicated from ${allResults.length} to ${deduplicatedResults.length} results. Returning top ${finalResults.length}.`);

    return {
      success: true,
      originalQuery: query,
      searchType,
      subQueries,
      totalCandidates: allResults.length,
      uniqueCount: deduplicatedResults.length,
      results: finalResults
    };
  } catch (err) {
    logger.error('GCP Search Aggregator Parallel Search Error:', err);
    return {
      success: false,
      originalQuery: query,
      error: err.message,
      results: []
    };
  }
};

export const GcpSearchAggregatorService = {
  executeRawSearch,
  executeParallelSearch
};
