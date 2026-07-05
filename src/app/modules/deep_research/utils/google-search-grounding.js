import { GoogleGenAI } from '@google/genai';
import { StructuredTool } from '@langchain/core/tools';
import config from '../../../../../config/index.js';
import { GcpSearchAggregatorService } from '../../gcp_native/gcp-search-aggregator.service.js';
import { UnifiedSmartRouter } from '../../../helpers/UnifiedSmartRouter.js';
import { logger } from '../../../../shared/logger.js';

/**
 * @type {GoogleGenAI}
 * @description Instance of GoogleGenAI for interacting with Gemini models, initialized with an API key from config or environment variables.
 */
const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY });

/**
 * Strips HTML tags (e.g. `<b>...</b>` from Custom Search results) and sanitizes title text.
 * It also removes square brackets to avoid collision with citation syntax.
 * @param {string} title - The title string to sanitize.
 * @returns {string} The sanitized title. Returns an empty string if the input is not a valid string.
 */
const sanitizeTitle = (title) => {
  if (!title || typeof title !== 'string') return '';
  return title
    .replace(/<\/?[^>]+(>|$)/g, '') // Strip HTML tags
    .replace(/[\[\]]/g, '')        // Strip square brackets to avoid citation syntax collision
    .trim();
};

/**
 * Extracts a clean hostname domain from a URL string.
 * @param {string} urlStr - The URL string.
 * @returns {string} The cleaned domain name (e.g., 'example.com') or 'Web Source' if the URL is invalid or not a string.
 */
const getDomainFromUrl = (urlStr) => {
  if (!urlStr || typeof urlStr !== 'string') return 'Web Source';
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return 'Web Source';
  }
};

/**
 * Executes a Gemini model call, automatically wrapping it in a resilient
 * billing/quota dunning error fallback for standard sandbox environments.
 * This function specifically catches errors related to API key, billing, or permission denied issues
 * and provides a fallback mechanism.
 * @async
 * @param {object} params - Parameters for the Gemini model's `generateContent` call.
 * @param {Function} fallbackGenerator - A function that returns a mock response structure when a billing/quota error occurs.
 * @returns {Promise<object>} The response from the Gemini model or the fallback generator's response if an error occurs.
 * @throws {Error} If an error other than billing/quota/API key related issues occurs during the Gemini call.
 */
const callGeminiWithResilience = async (params, fallbackGenerator) => {
  try {
    return await ai.models.generateContent(params);
  } catch (err) {
    // Refined error check to strictly target billing/quota/API key related issues
    const isBillingOrApiError = err.message.includes('dunning') || 
                                err.message.includes('403') || 
                                err.message.includes('API key') || 
                                err.message.includes('invalid_grant') ||
                                err.message.includes('PERMISSION_DENIED');
    if (isBillingOrApiError) {
      logger.warn(`[GoogleSearchGroundingTool] Gemini call failed: "${err.message}". Activating Cognitive Sandbox Fallback.`);
      return fallbackGenerator();
    }
    throw err;
  }
};

/**
 * @class GoogleSearchGroundingTool
 * @augments {StructuredTool}
 * @description A Langchain StructuredTool for performing advanced web searches using Google Custom Search and native Gemini Search Grounding.
 * This tool deconstructs complex queries, performs concurrent searches across multiple sources,
 * deduplicates results, and synthesizes a concise, factual answer.
 */
export class GoogleSearchGroundingTool extends StructuredTool {
  /**
   * @property {string} name - The name of the tool, used for identification in tool-calling scenarios.
   */
  name = 'google_search_grounding';

  /**
   * @property {string} description - A detailed description of what the tool does, aiding LLMs in understanding its utility.
   */
  description = 'Search the web using Live Web Grounding and Custom Search APIs for real-time information';

  /**
   * @property {number} maxResults - The maximum number of search results (citations) to return.
   */
  maxResults;

  /**
   * Creates an instance of GoogleSearchGroundingTool.
   * @param {object} [options] - Configuration options for the tool.
   * @param {number} [options.maxResults=8] - The maximum number of search results to return. Defaults to 8.
   */
  constructor(options = {}) {
    super();
    this.maxResults = options.maxResults || 8;
  }

  /**
   * Executes the advanced search grounding process. This involves:
   * 1. Dynamically deconstructing the main query into multiple sub-queries using Gemini.
   * 2. Performing concurrent parallel searches using Google Custom Search Engine (CSE) and native Gemini Search Grounding.
   * 3. Deduplicating and sanitizing search results to create a list of unique, high-fidelity sources.
   * 4. Reranking results based on relevance to the original query.
   * 5. Synthesizing a concise, factual answer using Gemini, grounded strictly on the retrieved sources.
   *
   * @async
   * @param {object} params - Parameters for the search invocation.
   * @param {string} params.query - The main search query provided by the user.
   * @param {'basic'|'advanced'} [params.searchDepth='basic'] - The depth of the search. While the implementation performs advanced multi-query, 'basic' is the current explicit option.
   * @param {boolean} [params.includeAnswer=true] - Whether to synthesize a direct answer from the search results. Defaults to true.
   * @param {Function} [params.onProgressUpdate] - Optional callback for streaming progress updates during the search process, useful for interactive UIs.
   * @returns {Promise<object>} An object containing the original query, the synthesized answer, a list of final search results (citations), and search metadata.
   * @throws {Error} If the search process encounters a critical failure that cannot be handled by fallbacks.
   */
  async invoke(params) {
    const {
      query,
      searchDepth = 'basic',
      includeAnswer = true,
      onProgressUpdate, // Optional streaming callback for interactive phase update
    } = params;

    const currentDateString = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York'
    });

    try {
      logger.info(`[GoogleSearchGroundingTool] Running advanced search grounding for: "${query}" (Today: ${currentDateString})`);

      // 1. DYNAMIC QUERY DECONSTRUCTION (Multi-Query Expansion)
      let subQueries = [query];
      try {
        if (onProgressUpdate) onProgressUpdate('Deconstructing query into multi-turn search strategies...');
        
        const deconstructResponse = await callGeminiWithResilience({
          model: 'gemini-3.5-flash',
          contents: `Analyze the user's search query and deconstruct it into exactly 2-3 distinct, highly targeted, and non-overlapping search engine queries to gather complete, multi-turn factual details. Respond strictly with a valid JSON array of strings. Do not use markdown blocks.
          
          Current Date Context: Today is ${currentDateString}
          Query: "${query}"`,
          config: {
            temperature: 0.05,
            responseMimeType: 'application/json',
          }
        }, () => {
          // Resilient billing fallback
          return {
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify([query, `${query} latest updates`, `${query} news`]) }]
              }
            }]
          };
        });
        
        const rawJson = deconstructResponse?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const parsed = JSON.parse(rawJson.replace(/```json/g, '').replace(/```/g, '').trim());
        if (Array.isArray(parsed) && parsed.length > 0) {
          subQueries = parsed.slice(0, 3);
          logger.info(`[GoogleSearchGroundingTool] Generated sub-queries: ${JSON.stringify(subQueries)}`);
        }
      } catch (deconstructErr) {
        logger.warn(`[GoogleSearchGroundingTool] Sub-query generation failed, using fallback: ${deconstructErr.message}`);
        subQueries = [query, `${query} latest`, `${query} news`].slice(0, 3);
      }

      if (onProgressUpdate) {
        onProgressUpdate(`Searching concurrently for:\n${subQueries.map(q => `• "${q}"`).join('\n')}`);
      }

      // 2. CONCURRENT PARALLEL MULTI-QUERY SEARCH
      const rawCandidates = [];
      const searchPromises = subQueries.map(async (subQ) => {
        const queryCandidates = [];

        // Route A: Google Custom Search Engine REST API
        try {
          const cseResults = await GcpSearchAggregatorService.executeRawSearch(subQ, 'web', 6);
          if (Array.isArray(cseResults)) {
            for (const item of cseResults) {
              queryCandidates.push({
                title: sanitizeTitle(item.title),
                url: item.link || item.formattedUrl || '',
                snippet: item.snippet || '',
                source: 'custom_search'
              });
            }
          }
        } catch (cseErr) {
          logger.warn(`[GoogleSearchGroundingTool] CSE search failed for sub-query "${subQ}": ${cseErr.message}`);
        }

        // Route B: Native Live Web Grounding (Gemini native tools)
        try {
          const geminiResult = await callGeminiWithResilience({
            model: 'gemini-3.5-flash',
            contents: `Search the web and retrieve precise, factual details about: ${subQ}`,
            config: {
              temperature: 0.1,
              tools: [{ googleSearch: {} }],
            },
          }, () => {
            // Resilient fallback: return empty grounding metadata to allow Custom Search Engine (Route A) to handle results
            return {
              candidates: [{
                content: {
                  parts: [{ text: '' }]
                },
                groundingMetadata: {
                  groundingChunks: [],
                  webSearchQueries: [subQ]
                }
              }]
            };
          });

          const meta = geminiResult.candidates?.[0]?.groundingMetadata;
          const chunks = meta?.groundingChunks || [];
          const textAnswer = geminiResult.candidates?.[0]?.content?.parts
            ?.filter((p) => p.text && !p.thought)
            ?.map((p) => p.text)
            ?.join('') || '';

          chunks.forEach((chunk) => {
            if (chunk.web?.uri) {
              queryCandidates.push({
                title: sanitizeTitle(chunk.web.title),
                url: chunk.web.uri,
                snippet: textAnswer ? textAnswer.substring(0, 400) : 'Google search grounding context segment.',
                source: 'native_grounding'
              });
            }
          });
        } catch (nativeErr) {
          logger.warn(`[GoogleSearchGroundingTool] Native search grounding failed for sub-query "${subQ}": ${nativeErr.message}`);
        }

        return queryCandidates;
      });

      const resultsArrays = await Promise.all(searchPromises);
      resultsArrays.forEach(arr => rawCandidates.push(...arr));

      // 3. UNIFIED CITATION DEDUPLICATION & METADATA SANITIZATION
      const uniqueSourcesMap = new Map();
      const normalizeUrl = (u) => {
        if (!u || typeof u !== 'string') return '';
        try {
          let c = u.toLowerCase().trim();
          if (c.endsWith('/')) c = c.slice(0, -1);
          return c;
        } catch {
          return u.toLowerCase().trim();
        }
      };

      for (const cand of rawCandidates) {
        if (!cand.url) continue;
        const norm = normalizeUrl(cand.url);
        if (!uniqueSourcesMap.has(norm)) {
          uniqueSourcesMap.set(norm, {
            title: cand.title || 'Web Reference',
            url: cand.url,
            domain: getDomainFromUrl(cand.url),
            snippets: [cand.snippet].filter(Boolean),
            relevanceScore: 0
          });
        } else {
          // If already registered, append new snippets to enrich background details
          const existing = uniqueSourcesMap.get(norm);
          if (cand.snippet && !existing.snippets.includes(cand.snippet)) {
            existing.snippets.push(cand.snippet);
          }
        }
      }

      const deduplicatedList = Array.from(uniqueSourcesMap.values());

      // 4. RELEVANCE SCORING & RERANKING BASED ON KEYWORD DENSITY
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      deduplicatedList.forEach(src => {
        let score = 0;
        const titleLower = src.title.toLowerCase();
        const snippetCombined = src.snippets.join(' ').toLowerCase();

        for (const term of queryTerms) {
          if (titleLower.includes(term)) score += 15;
          if (snippetCombined.includes(term)) score += 3;
        }
        src.relevanceScore = score;
      });

      // Sort by score descending and keep only sources with a positive relevance score (unless all are 0, fallback to top 3)
      deduplicatedList.sort((a, b) => b.relevanceScore - a.relevanceScore);
      let topSources = deduplicatedList.filter(src => src.relevanceScore > 0);
      if (topSources.length === 0) {
        topSources = deduplicatedList.slice(0, 3);
      } else {
        topSources = topSources.slice(0, this.maxResults);
      }

      // Clean up snippets inside each source for final display
      let finalResults = topSources.map((src, idx) => ({
        index: idx + 1,
        title: src.title,
        url: src.url,
        domain: src.domain,
        content: src.snippets.slice(0, 2).join(' — ').substring(0, 600), // Max 600 chars per source snippet
        score: 1.0 - (idx * 0.05)
      }));

      logger.info(`[GoogleSearchGroundingTool] Deduplicated from ${rawCandidates.length} down to ${finalResults.length} high-fidelity references.`);

      if (onProgressUpdate) {
        onProgressUpdate(`Consolidated ${finalResults.length} pristine web citations.\nSynthesizing factual grounding response...`);
      }

      // 5. FACTUAL GROUNDING SYNTHESIS (Unbranded Fact Compilation)
      let synthesizedAnswer = '';
      if (includeAnswer && finalResults.length > 0) {
        const snippetsBlock = finalResults.map(r => `[Source #${r.index}] Title: ${r.title}\nDomain: ${r.domain}\nURL: ${r.url}\nSnippet: ${r.content}`).join('\n\n');
        
        const synthesisResponse = await callGeminiWithResilience({
          model: 'gemini-3.5-flash',
          contents: `Answer the user's question using ONLY the provided sources. Be extremely concise.
          
          Current Date Context: Today is ${currentDateString}
          User Query: "${query}"
          
          Sources:
          ${snippetsBlock}
          
          Rules:
          1. Give ONLY the direct answer. No preambles, no introductions, no closing remarks.
          2. If the answer is one sentence, give ONE sentence.
          3. Maximum 100 words for simple factual questions. Up to 200 words for complex questions.
          4. NO bracketed citations, source indices, or URLs in the body of the response.
          5. NO markdown headers.
          6. Be factual, neutral, professional.
          7. If the provided sources do not contain sufficient or clear information to answer the question, but you can confidently and accurately answer it based on your general knowledge or logical inference, provide the correct answer. Only state "The requested information is not available in the retrieved sources." if the answer is completely unverifiable or unknown.
          8. Ensure the output is highly accurate, logically coherent, and makes complete sense.
          9. At the very end of your response, on a new line, write "Used Sources: " followed by a JSON array of the Source # indices that you actually used to compile the answer. For example: "Used Sources: [1, 3]". Only list the sources that were strictly necessary to answer. If you used only your general knowledge, write "Used Sources: []".`,
          config: {
            temperature: 0.05,
            maxOutputTokens: 4096
          }
        }, () => {
          // Resilient fallback: build a consolidated summary using actual Custom Search results
          let text = '';
          if (finalResults.length > 0) {
            text = `Based on search results:\n\n` + 
              finalResults.map(r => `• ${r.title}: ${r.content}`).join('\n\n');
          } else {
            text = `No direct answer could be synthesized because no web search results were found.`;
          }
          return {
            candidates: [{
              content: {
                parts: [{ text }]
              }
            }]
          };
        });

        const rawText = synthesisResponse?.candidates?.[0]?.content?.parts
          ?.filter((p) => p.text && !p.thought)
          ?.map((p) => p.text)
          ?.join('') || 'Unable to synthesize response context.';

        // Parse referenced indices and filter finalResults accordingly
        const match = rawText.match(/Used Sources:\s*(\[[\d,\s,]*\])/i);
        if (match) {
          try {
            const usedIndices = JSON.parse(match[1]);
            if (Array.isArray(usedIndices) && usedIndices.length > 0) {
              const filtered = finalResults.filter(r => usedIndices.includes(r.index));
              if (filtered.length > 0) {
                finalResults = filtered.map((r, idx) => ({ ...r, index: idx + 1 }));
              }
            }
          } catch (e) {
            logger.warn(`[GoogleSearchGroundingTool] Failed to parse used sources JSON array: ${e.message}`);
          }
          synthesizedAnswer = rawText.replace(/Used Sources:\s*\[[\d,\s,]*\]/i, '').trim();
        } else {
          synthesizedAnswer = rawText.trim();
        }
      } else if (includeAnswer) {
        synthesizedAnswer = `No web search results could be retrieved to answer: "${query}".`;
      }

      return {
        query,
        answer: synthesizedAnswer,
        results: finalResults,
        search_metadata: {
          search_depth: searchDepth,
          total_results: finalResults.length,
          timestamp: new Date().toISOString(),
          webSearchQueries: subQueries,
        },
      };

    } catch (error) {
      logger.error('[GoogleSearchGroundingTool] Execution Error:', error);
      throw new Error(`Failed to search with advanced Live Web Grounding: ${error.message}`);
    }
  }

  /**
   * Alias for the `invoke` method, adhering to Langchain's tool interface.
   * @async
   * @param {object} params - Parameters for the search invocation, same as `invoke`.
   * @returns {Promise<object>} An object containing the query, synthesized answer, search results, and metadata.
   * @throws {Error} If the search process fails.
   */
  async call(params) {
    return this.invoke(params);
  }
}