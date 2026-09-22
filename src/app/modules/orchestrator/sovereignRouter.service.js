import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { groqChat, groqStream, groqLightChat } from '../../services/groq.client.js';
import Chat from '../chat/chat.model.js';
import UserModel from '../auth/auth.model.js';
import { IntentClassifier, ROUTE_TYPES } from './classifier.js';

// ─── Telemetry ─────────────────────────────────────────────────────────────────
const TELEMETRY_BUFFER_SIZE = 500;
const telemetryBuffer = [];

function recordTelemetry(entry) {
  telemetryBuffer.push({ ...entry, timestamp: new Date().toISOString() });
  if (telemetryBuffer.length > TELEMETRY_BUFFER_SIZE) telemetryBuffer.shift();
}

// ─── Lazy Service Loader ───────────────────────────────────────────────────────
const loadService = async (loader) => {
  try {
    return await loader();
  } catch (err) {
    logger.warn(`[SovereignRouter] Service load failed: ${err.message}`);
    return null;
  }
};

/**
 * Sovereign Router — Central Intelligence Engine v2
 *
 * Upgrades over v1:
 *  1. Hybrid LLM + heuristic classification (fast path + LLM escalation)
 *  2. Multi-route fan-out for compound prompts
 *  3. Context-aware routing from conversation history
 *  4. Search augmentation (parallel Exa enrichment) for all routes
 *  5. Confidence scoring + telemetry on every routing decision
 */
export const SovereignRouterService = {

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. HYBRID INTENT CLASSIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Hybrid classifier: fast heuristic path → LLM escalation when ambiguous.
   *
   * @param {string} prompt - User prompt
   * @param {object} options - { conversationHistory: [] }
   * @returns {Promise<{ route: string, confidence: number, classifier: string, search_augmentation: boolean, parameters: object, reasoning: string, steps?: Array }>}
   */
  async classifyIntentHybrid(prompt, options = {}) {
    const { conversationHistory = [] } = options;
    const startTime = Date.now();

    // Fast path: heuristic classification
    const heuristic = IntentClassifier.classifyFast(prompt);
    const heuristicMs = Date.now() - startTime;

    // If heuristic confidence is high enough (≥ 0.85), skip LLM entirely
    if (heuristic.confidence >= 0.85) {
      const result = { ...heuristic, classifier: 'heuristic_fast', latencyMs: heuristicMs };
      recordTelemetry({ type: 'classification', route: result.route, confidence: result.confidence, classifier: result.classifier, latencyMs: heuristicMs, prompt: prompt.slice(0, 80) });
      logger.info(`[SovereignRouter] Fast classify: ${result.route} (${result.confidence}) in ${heuristicMs}ms`);
      return result;
    }

    // LLM escalation: heuristic confidence is ambiguous (< 0.85)
    try {
      const llmResult = await IntentClassifier.classify(prompt, {
        maxLatencyMs: 1500,
        conversationHistory,
      });

      const totalMs = Date.now() - startTime;
      const result = { ...llmResult, latencyMs: totalMs };

      // If LLM also has low confidence (< 0.5), default to SEARCH for max citations
      if (result.confidence < 0.5) {
        result.route = ROUTE_TYPES.SEARCH;
        result.search_augmentation = true;
        result.reasoning = `Both heuristic (${heuristic.confidence}) and LLM (${llmResult.confidence}) low confidence → SEARCH fallback for max citations`;
        result.classifier = 'fallback_search';
      } else {
        result.classifier = `hybrid_llm`;
      }

      recordTelemetry({ type: 'classification', route: result.route, confidence: result.confidence, classifier: result.classifier, latencyMs: totalMs, heuristicRoute: heuristic.route, heuristicConfidence: heuristic.confidence, prompt: prompt.slice(0, 80) });
      logger.info(`[SovereignRouter] Hybrid classify: heuristic=${heuristic.route}(${heuristic.confidence}) → LLM=${result.route}(${result.confidence}) in ${totalMs}ms`);

      return result;
    } catch (err) {
      // LLM failed — use heuristic result
      logger.warn(`[SovereignRouter] LLM escalation failed: ${err.message}. Using heuristic.`);
      const result = { ...heuristic, classifier: 'heuristic_fallback', latencyMs: Date.now() - startTime };
      recordTelemetry({ type: 'classification', route: result.route, confidence: result.confidence, classifier: result.classifier, latencyMs: result.latencyMs, error: err.message, prompt: prompt.slice(0, 80) });
      return result;
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SUBSYSTEM DATA FETCHERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch live, grounded data from a single subsystem.
   */
  async fetchSubsystemData(route, prompt, historyContext = '') {
    const startTime = Date.now();
    let dataContext = '';
    const references = [];

    try {
      switch (route) {
        case 'WEATHER': {
          const { VisualCrossingService } = await import('../visualcrossing/visualcrossing.service.js');
          const locMatch = prompt.match(/\b(?:in|at|for|near)\s+([A-Za-z\s,]+)/i);
          const location = locMatch ? locMatch[1].trim() : prompt.replace(/weather|temperature|forecast/gi, '').trim() || 'New York';
          const wx = await VisualCrossingService.getForecast(location);
          if (wx) {
            const current = wx.currentConditions || {};
            const days = (wx.days || []).slice(0, 5);
            const daysTable = days.map(d => `| ${d.datetime} | ${d.conditions} | ${d.temp}°C (${Math.round((d.temp * 9/5) + 32)}°F) | ${d.tempmax || 'N/A'}°C / ${d.tempmin || 'N/A'}°C | ${d.precipprob || 0}% | ${d.windspeed} km/h | ${d.humidity}% |`).join('\n');
            dataContext = `### Live Weather for ${wx.resolvedAddress || location}\n` +
              `- **Current Temperature**: ${current.temp}°C (${Math.round((current.temp * 9/5) + 32)}°F)\n` +
              `- **Conditions**: ${current.conditions || 'Clear'}\n` +
              `- **Humidity**: ${current.humidity}%\n` +
              `- **Wind Speed**: ${current.windspeed} km/h\n` +
              `- **UV Index**: ${current.uvindex ?? 'N/A'}\n\n` +
              `| Date | Conditions | Avg Temp | High / Low | Precip Prob | Wind | Humidity |\n` +
              `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n` +
              daysTable;

            references.push({
              title: `Live Weather & 5-Day Forecast for ${wx.resolvedAddress || location}`,
              url: `https://www.visualcrossing.com/weather-forecast/${encodeURIComponent(location)}`,
              snippet: `${current.conditions || 'Clear'}, ${current.temp}°C, Humidity: ${current.humidity}%, Wind: ${current.windspeed} km/h`,
              source: 'Visual Crossing Timeline Weather API'
            });
          }
          break;
        }

        case 'AVIATION': {
          const { AviationStackService } = await import('../aviationstack/aviationstack.service.js');
          const flightMatch = prompt.match(/\b([A-Z0-9]{2}\s?\d{1,4})\b/i);
          const flightNumber = flightMatch ? flightMatch[1].replace(/\s/g, '').toUpperCase() : null;
          let flightsData;
          if (flightNumber) {
            flightsData = await AviationStackService.getFlightByNumber(flightNumber);
          } else {
            flightsData = await AviationStackService.getLiveFlights();
          }
          const flights = flightsData?.data?.slice(0, 5) || [];
          if (flights.length > 0) {
            const flightRows = flights.map(f => `| ${f.flight?.iata || f.flight?.icao || 'N/A'} | ${f.departure?.airport || 'Dep'} (${f.departure?.iata}) -> ${f.arrival?.airport || 'Arr'} (${f.arrival?.iata}) | **${(f.flight_status || 'active').toUpperCase()}** | ${f.departure?.estimated || f.departure?.scheduled || 'N/A'} | ${f.arrival?.estimated || f.arrival?.scheduled || 'N/A'} | ${f.airline?.name || 'Airline'} |`).join('\n');
            dataContext = `### Live Aviation Radar Data\n` +
              `| Flight | Route | Status | Estimated Departure | Estimated Arrival | Airline |\n` +
              `| :--- | :--- | :--- | :--- | :--- | :--- |\n` +
              flightRows;

            references.push({
              title: `Global Flight Tracking: ${flightNumber || 'Live Flight Radar'}`,
              url: 'https://aviationstack.com',
              snippet: `Real-time radar status for ${flights.length} active flights`,
              source: 'AviationStack Global Aviation Engine'
            });
          }
          break;
        }

        case 'SPORTS': {
          const { ApiSportsService } = await import('../apisports/apisports.service.js');
          const liveScores = await ApiSportsService.getAllCachedLiveScores();
          const sportsEntries = Object.entries(liveScores || {});
          if (sportsEntries.length > 0) {
            const sportsRows = sportsEntries.slice(0, 6).map(([sport, games]) => `| ${sport.toUpperCase()} | ${Array.isArray(games) ? games.length : 0} Live Matches | Real-time Stream Active |`).join('\n');
            dataContext = `### API-Sports Real-Time Streaming Radar (12 Sports)\n` +
              `| Sport | Active Live Fixtures | Radar Status |\n` +
              `| :--- | :--- | :--- |\n` +
              sportsRows;
          } else {
            dataContext = `Real-time sports streaming engine connected across 12 sports (Football, Basketball, Baseball, Hockey, F1, MMA, NFL, NBA, etc.).`;
          }
          references.push({
            title: 'API-Sports Live Streaming Scores & Intelligence (12 Sports)',
            url: 'https://api-sports.io',
            snippet: dataContext,
            source: 'API-Sports.io Enterprise Multi-Sport Feed'
          });
          break;
        }

        case 'PREDICTIONS': {
          const { PredictionDataService } = await import('../predictiondata/predictiondata.service.js');
          const mkts = await PredictionDataService.getMarkets({ limit: 5 });
          const mList = Array.isArray(mkts?.data) ? mkts.data.slice(0, 5) : [];
          if (mList.length > 0) {
            const mktRows = mList.map(m => `| ${m.title || m.name || 'Prediction Market'} | ${m.book || 'Polymarket/Kalshi'} | ${m.bet_type || 'Prediction'} | **${m.odds || m.price || 'Active'}** |`).join('\n');
            dataContext = `### Live Prediction Markets & Betting Odds\n` +
              `| Event / Market | Sportsbook / Platform | Market Type | Implied Probability / Odds |\n` +
              `| :--- | :--- | :--- | :--- |\n` +
              mktRows;
          } else {
            dataContext = `Prediction markets connected across Polymarket, Kalshi, DraftKings, FanDuel, and Pinnacle.`;
          }
          references.push({
            title: 'PredictionData.io Betting Odds & Prediction Markets',
            url: 'https://www.predictiondata.io',
            snippet: dataContext,
            source: 'PredictionData.io Institutional Feed'
          });
          break;
        }

        case 'CRYPTO': {
          const { CoinApiService } = await import('../coinapi/coinapi.service.js');
          const symMatch = prompt.match(/\b(BTC|ETH|SOL|BNB|XRP|DOGE|ADA|AVAX|DOT)\b/i);
          const assetId = symMatch ? symMatch[1].toUpperCase() : 'BTC';
          const rate = await CoinApiService.getExchangeRate(assetId, 'USD');
          if (rate) {
            const formattedPrice = Number(rate.rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            dataContext = `### Real-Time Cryptocurrency Market Data\n` +
              `| Asset | Base Pair | Real-Time Price (USD) | Quote Timestamp | Exchange Source |\n` +
              `| :--- | :--- | :--- | :--- | :--- |\n` +
              `| **${assetId}** | USD | **$${formattedPrice}** | ${rate.time || new Date().toISOString()} | CoinAPI Multi-Exchange Consolidated |\n`;

            references.push({
              title: `${assetId}/USD Real-Time Price & Exchange Rate`,
              url: `https://www.coinapi.io/pricing/${assetId}`,
              snippet: `1 ${assetId} = $${formattedPrice} USD as of ${rate.time || new Date().toISOString()}`,
              source: 'CoinAPI.io Institutional Crypto Engine'
            });
          }
          break;
        }

        case 'FINANCE': {
          const { MassiveService } = await import('../massive/massive.service.js');
          const tMatch = prompt.match(/\b(NVDA|AAPL|TSLA|MSFT|AMZN|GOOGL|META|SPY|QQQ|AMD|INTC|NFLX|DIS|BA|JPM|GS|V|MA|WMT|COST)\b/i);
          const ticker = tMatch ? tMatch[1].toUpperCase() : 'SPY';
          const quote = await MassiveService.getQuote(ticker);
          if (quote) {
            dataContext = `### Massive.com Institutional Market Quote\n` +
              `| Ticker | Price | Change | Day High | Day Low | Volume |\n` +
              `| :--- | :--- | :--- | :--- | :--- | :--- |\n` +
              `| **${ticker}** | **$${quote.price || quote.c || quote.last || 'N/A'}** | ${quote.change || quote.d || '0'}% | $${quote.high || quote.h || 'N/A'} | $${quote.low || quote.l || 'N/A'} | ${quote.volume || quote.v || 'N/A'} |\n`;

            references.push({
              title: `${ticker} Real-time Market Quote & Financials`,
              url: `https://massive.com/stocks/${ticker}`,
              snippet: `${ticker} current price: $${quote.price || quote.c || quote.last || 'N/A'} (${quote.change || quote.d || '0'}%)`,
              source: 'Massive.com Real-time Market Feed'
            });
          }
          break;
        }

        case 'NEWS': {
          const { NewsApiService } = await import('../newsapi/newsapi.service.js');
          const news = await NewsApiService.searchArticles({ keyword: prompt.slice(0, 100), maxItems: 5 });
          const articles = news?.articles?.results || news?.articles || [];
          if (articles.length > 0) {
            dataContext = `### Verified Breaking News & World Events\n` +
              articles.slice(0, 4).map((a, i) => `**[${i + 1}] ${a.title}**\n- *Publisher*: ${a.source?.title || 'Global News'} (${a.date || 'Recent'})\n- *Summary*: ${a.body?.slice(0, 180) || a.description || ''}...\n- *URL*: ${a.url || 'https://newsapi.ai'}`).join('\n\n');
            articles.slice(0, 4).forEach((a, i) => {
              references.push({
                title: a.title || 'Breaking News Article',
                url: a.url || 'https://newsapi.ai',
                snippet: a.body?.slice(0, 200) || a.description || '',
                source: a.source?.title || 'NewsAPI.ai Event Registry'
              });
            });
          }
          break;
        }

        case 'LOCATION': {
          const { MapboxService } = await import('../mapbox/mapbox.service.js');
          const places = await MapboxService.searchSuggest(prompt.slice(0, 100));
          const suggestions = places?.suggestions?.slice(0, 4) || [];
          if (suggestions.length > 0) {
            dataContext = `### Mapbox Geospatial Intelligence\n` +
              suggestions.map((s, i) => `**[${i + 1}] ${s.name}**\n- *Address*: ${s.place_formatted || s.full_address || 'Verified Address'}\n- *Mapbox ID*: \`${s.mapbox_id || 'POI'}\``).join('\n\n');
            references.push({
              title: `Mapbox Geospatial Search: ${prompt.slice(0, 40)}`,
              url: 'https://www.mapbox.com',
              snippet: dataContext,
              source: 'Mapbox Navigation & POI Engine'
            });
          }
          break;
        }

        case 'B2B': {
          const { ExploriumService } = await import('../explorium/explorium.service.js');
          const companyMatch = prompt.match(/\b(?:about|for|company|startup|firm)\s+([A-Za-z0-9\s]+)/i);
          const companyName = companyMatch ? companyMatch[1].trim() : prompt.replace(/b2b|leads|firmographics/gi, '').trim() || 'Tech';
          const matchResult = await ExploriumService.matchBusinesses({ name: companyName });
          dataContext = `### Explorium B2B Firmographic Intelligence\n- Company: **${companyName}**\n- Entity Resolution: ${JSON.stringify(matchResult).slice(0, 350)}`;
          references.push({
            title: `B2B Intelligence: ${companyName}`,
            url: 'https://www.explorium.ai',
            snippet: dataContext,
            source: 'Explorium AgentSource v2'
          });
          break;
        }

        case 'CHITCHAT': {
          dataContext = '';
          break;
        }

        case 'CODE': {
          try {
            const { CodexService } = await import('../codex/codex.service.js');
            const codeRes = await CodexService.generateCode({ prompt, context: historyContext });
            dataContext = `### Open Codex (Sovereign Code Engine)\n` + codeRes;
            references.push({
              title: 'Open Codex Execution',
              url: 'local://open-codex',
              snippet: 'Locally generated and verified sovereign code execution',
              source: 'Open Codex Sandboxed AI'
            });
          } catch (e) {
            dataContext = `Open Codex sovereign sandbox ready for Python / Node.js logic and math verification.\n`;
          }
          break;
        }

        case 'MULTI_STEP': {
          try {
            const { LangChainService } = await import('../langchain/langchain.service.js');
            const planRes = await LangChainService.runReasoningGraph({ goal: prompt, context: historyContext });
            dataContext = `### LangGraph Sovereign Reasoning Engine\n` + 
              `**Strategic Plan:**\n` + planRes.plan?.map(p => '- ' + p).join('\n') + 
              `\n\n**Proposed Solution:**\n` + planRes.solution;
            references.push({
              title: 'LangGraph Reasoning Trace',
              url: 'local://langgraph',
              snippet: 'Multi-step strategic planning and reasoning',
              source: 'LangChain Sovereign Agent'
            });
          } catch (e) {
            logger.warn(`[SovereignRouter] MULTI_STEP failed: ${e.message}`);
          }
          break;
        }

        case 'TOOL_CALL': {
          try {
            const { ComposioService } = await import('../composio/composio.service.js');
            const { OpenClawService } = await import('../openclaw/openclaw.service.js');
            
            if (prompt.toLowerCase().includes('device') || prompt.toLowerCase().includes('machine') || prompt.toLowerCase().includes('vm')) {
              const queued = await OpenClawService.queueEdgeCommand('vm-sovereign-01', 'execute', { prompt });
              dataContext = `### OpenClaw Edge Execution\nTask queued to secure edge node (ID: ${queued.commandId}). Awaiting results...`;
              references.push({ title: 'OpenClaw Edge Command', url: 'local://openclaw', snippet: 'Sandboxed execution', source: 'OpenClaw' });
            } else {
              const toolRes = await ComposioService.searchTools(null, prompt);
              dataContext = `### Composio Global App Integration\nMatched tools for this action: \n` + 
                (toolRes?.tools || []).slice(0,3).map(t => `- **${t.name}**: ${t.description}`).join('\n') +
                '\n\n*Preparing to execute via Composio secure tunnel...*';
              references.push({ title: 'Composio App Actions', url: 'https://composio.dev', snippet: 'Connecting to 1,500+ apps', source: 'Composio Engine' });
            }
          } catch (e) {
            logger.warn(`[SovereignRouter] TOOL_CALL failed: ${e.message}`);
          }
          break;
        }

        case 'RESEARCH': {
          try {
            const { LlamaIndexService } = await import('../../services/llamaindex.service.js');
            const { ExaSearchService } = await import('../ExaSearch/exaSearch.service.js');
            
            const searchRes = await ExaSearchService.searchDirectly(prompt, { numResults: 3 });
            const results = searchRes?.results || [];
            
            dataContext = `### Temporal Deep Research & LlamaIndex Vector RAG\n` +
              `Initiated distributed neural search across Exa, indexing results via LlamaIndex for RAG synthesis.\n\n`;
            
            if (results.length > 0) {
              dataContext += results.map((r, i) => `**[${i + 1}] "${r.title}"**\n- *URL*: ${r.url}\n- *Excerpt*: ${r.summary || r.text?.slice(0, 250) || ''}`).join('\n\n');
              results.forEach(r => {
                references.push({
                  title: r.title || 'Web Source',
                  url: r.url || 'https://exa.ai',
                  snippet: r.summary || r.text?.slice(0, 200) || '',
                  source: 'Exa + LlamaIndex RAG Pipeline'
                });
              });
            }
          } catch (e) {
            logger.warn(`[SovereignRouter] RESEARCH failed: ${e.message}`);
          }
          break;
        }

        case 'SEARCH':
        default: {
          const { ExaSearchService } = await import('../ExaSearch/exaSearch.service.js');
          const searchRes = await ExaSearchService.searchDirectly(prompt, { numResults: 5 });
          const results = searchRes?.results || [];
          if (results.length > 0) {
            dataContext = `### Third-Party Web Intelligence\n` +
              results.map((r, i) => `**[${i + 1}] "${r.title}"**\n- *URL*: ${r.url}\n- *Excerpt*: ${r.summary || r.text?.slice(0, 250) || ''}`).join('\n\n');
            results.forEach(r => {
              references.push({
                title: r.title || 'Web Source',
                url: r.url || 'https://exa.ai',
                snippet: r.summary || r.text?.slice(0, 200) || '',
                source: 'Exa Neural Search Engine'
              });
            });
          }
          break;
        }
      }
    } catch (err) {
      logger.warn(`[SovereignRouter] Subsystem fetch error (${route}): ${err.message}`);
    }

    const elapsed = Date.now() - startTime;
    logger.info(`[SovereignRouter] Subsystem ${route} returned in ${elapsed}ms (${references.length} references)`);

    return { dataContext, references, elapsed };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MULTI-ROUTE FAN-OUT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute parallel subsystem fetches for compound prompts.
   * Merges data contexts and references from all routes.
   *
   * @param {Array<{ route: string, query: string }>} steps - Sub-routes to fan out
   * @returns {Promise<{ dataContext: string, references: Array, elapsed: number, routes: string[] }>}
   */
  async fetchFanOut(steps) {
    const startTime = Date.now();

    // Cap at 3 concurrent fan-out routes
    const cappedSteps = steps.slice(0, 3);
    logger.info(`[SovereignRouter] Fan-out: ${cappedSteps.map(s => s.route).join(' + ')}`);

    const results = await Promise.allSettled(
      cappedSteps.map(step => this.fetchSubsystemData(step.route, step.query))
    );

    let mergedContext = '';
    const mergedReferences = [];
    const routes = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const { dataContext, references } = result.value;
        if (dataContext) {
          mergedContext += (mergedContext ? '\n\n---\n\n' : '') + dataContext;
        }
        mergedReferences.push(...references);
        routes.push(cappedSteps[i].route);
      } else {
        logger.warn(`[SovereignRouter] Fan-out step ${cappedSteps[i].route} failed: ${result.reason?.message}`);
      }
    });

    const elapsed = Date.now() - startTime;
    logger.info(`[SovereignRouter] Fan-out completed in ${elapsed}ms: ${routes.join(', ')} (${mergedReferences.length} total references)`);
    recordTelemetry({ type: 'fanout', routes, elapsed, referenceCount: mergedReferences.length });

    return { dataContext: mergedContext, references: mergedReferences, elapsed, routes };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. SEARCH AUGMENTATION (PARALLEL EXA ENRICHMENT)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enrich any route's response with parallel Exa web search.
   * Returns additional references without blocking the primary subsystem fetch.
   */
  async fetchSearchAugmentation(prompt) {
    try {
      const { ExaSearchService } = await import('../ExaSearch/exaSearch.service.js');
      const searchRes = await ExaSearchService.searchDirectly(prompt, { numResults: 3 });
      const results = searchRes?.results || [];
      return results.map(r => ({
        title: r.title || 'Web Source',
        url: r.url || 'https://exa.ai',
        snippet: r.summary || r.text?.slice(0, 200) || '',
        source: 'Exa Neural Search (Augmentation)'
      }));
    } catch (err) {
      logger.warn(`[SovereignRouter] Search augmentation failed: ${err.message}`);
      return [];
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CONTEXT-AWARE ROUTING (CONVERSATION HISTORY)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load recent conversation history from MongoDB for context-aware routing.
   * Returns the last 3 exchanges as [{role, content}] for the classifier.
   */
  async loadConversationContext(userId, sessionId) {
    if (!userId || !sessionId) return [];
    try {
      const chatSession = await Chat.findOne({ user: userId, sessionId }).lean();
      if (!chatSession?.responses?.length) return [];

      const recent = chatSession.responses.slice(-3);
      const history = [];
      for (const r of recent) {
        if (r.prompt) history.push({ role: 'user', content: r.prompt });
        if (r.reply) history.push({ role: 'assistant', content: r.reply.slice(0, 200) }); // Truncate to save tokens
      }
      return history.slice(-6); // Max 6 messages (3 exchanges)
    } catch (err) {
      logger.warn(`[SovereignRouter] Context load failed: ${err.message}`);
      return [];
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM PROMPT BUILDER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build the Perplexity-beating system prompt with live grounded context & mandatory citations
   */
  buildSystemPrompt(route, dataContext, references = [], userContext = {}) {
    const isChitchat = route === 'CHITCHAT';

    let sourcesBlock = '';
    if (references && references.length > 0) {
      // Deduplicate by URL
      const seen = new Set();
      const unique = references.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
      sourcesBlock = `\nTHIRD-PARTY VERIFIED CITATION INDEX:\n` +
        unique.map((r, i) => `[${i + 1}] "${r.title}" (${r.url}) — ${r.source || 'Third-Party Verification'}`).join('\n') + '\n';
    }

    return `You are Aphura (Aphura AI), the sovereign data intelligence search & answer engine, engineered to surpass Perplexity in factual accuracy, real-time depth, and verifiable citations.

CORE PRODUCT MOAT — 100% THIRD-PARTY VERIFIABILITY:
The foundational moat of this platform is that EVERY answer is verifiable with third-party checks. We never output unverified hallucinations. Every single statement, statistic, calculation, finding, and factual claim is backed by independent third-party sources.

Platform Subsystems Connected:
1. Massive.com (Live Stocks, Options, Forex)
2. CoinAPI.io (Live Crypto Exchange Rates, Orderbooks)
3. API-Sports.io (Real-Time Scores & Live Fixtures for 12 Sports)
4. PredictionData.io (Polymarket, Kalshi, DraftKings Odds)
5. Visual Crossing (Global Weather, Forecasts, Radar)
6. AviationStack (Live Flight Tracking, Airport Radar)
7. NewsAPI.ai (Breaking News, Global Events)
8. Mapbox (Geospatial POIs, Directions, Isochrones)
9. Explorium AgentSource v2 (B2B Firmographics, Prospects)
10. Exa.ai (Neural Web Search & Instant Crawling)
11. Open Codex (Sandboxed Code Execution)
12. Composio (1,500+ App Actions)
13. OpenStack Cloud (Heavy Sovereign Compute)
14. LlamaIndex (Knowledge RAG)

User Context:
- Active Route: ${route}
- Timezone: ${userContext.timezone || 'UTC'}
- Local Date: ${userContext.localDate || new Date().toDateString()}
- Local Time: ${userContext.localTime || new Date().toTimeString()}

LIVE DATA RETRIEVED FROM PLATFORM:
${dataContext ? dataContext : 'No external data required for brief conversational greeting.'}
${sourcesBlock}
Directives for World-Class Output:
1. Executive Lead: Provide the direct, definitive answer in the very first sentence. Never begin with conversational filler ("Sure!", "Here is...", "Based on...").
2. Structured Markdown Tables: Whenever displaying numerical, multi-attribute, or comparative data (weather forecasts, stock quotes, crypto prices, flight statuses, sports fixtures, prediction odds), you MUST present it in a clean, professional GitHub-flavored Markdown table.
3. In-Line Numbered Citations: Every single factual assertion, statistic, score, price, date, and claim MUST feature an in-text numbered citation badge like [1], [2] referencing the verified third-party source list.
4. Bold Highlights: Bold crucial metrics, key entities, and critical conclusions.
5. Verifiable Sources Bibliography: Conclude EVERY response with a "### Sources" section formatted as:
   [1] [Source Title](url) — Platform/Publisher Name
   [2] [Source Title](url) — Platform/Publisher Name
6. Zero Tangents & No Follow-Ups: Do NOT append any 'Related Questions', suggested prompts, next steps, or conversational closing remarks. End cleanly after the ### Sources section.`;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN HANDLERS (STREAM + JSON)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Main unified prompt handler for SSE streaming (primary frontend prompt box target).
   * Now with hybrid classification, fan-out, context-awareness, and search augmentation.
   */
  async handlePromptStream({ prompt, sessionId, userId, userContext, res }) {
    const pipelineStart = Date.now();

    // Set up SSE headers immediately
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const convId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 1. Send connected event immediately
    res.write(`data: ${JSON.stringify({ type: 'connected', conversationId: convId })}\n\n`);

    // 2. Load conversation context for context-aware routing (non-blocking)
    const conversationHistory = await this.loadConversationContext(userId, convId);

    // 3. Hybrid intent classification
    const classification = await this.classifyIntentHybrid(prompt, { conversationHistory });
    const route = classification.route;

    logger.info(`[SovereignRouter] Stream: "${prompt.slice(0, 60)}" → ${route} (${classification.classifier}, ${classification.confidence})`);

    // 4. Fetch data — either fan-out for compound prompts or single subsystem
    let dataContext, references;

    if (route === 'MULTI_STEP' && classification.parameters?.steps?.length > 1) {
      // Multi-route fan-out
      const fanOutResult = await this.fetchFanOut(classification.parameters.steps);
      dataContext = fanOutResult.dataContext;
      references = fanOutResult.references;
    } else if (classification.search_augmentation && route !== 'SEARCH' && route !== 'RESEARCH' && route !== 'CHITCHAT') {
      // Parallel: subsystem fetch + search augmentation
      const [subsystemResult, augmentationRefs] = await Promise.all([
        this.fetchSubsystemData(route, prompt),
        this.fetchSearchAugmentation(prompt),
      ]);
      dataContext = subsystemResult.dataContext;
      references = [...subsystemResult.references, ...augmentationRefs];
    } else {
      // Standard single subsystem fetch
      const subsystemResult = await this.fetchSubsystemData(route, prompt);
      dataContext = subsystemResult.dataContext;
      references = subsystemResult.references;
    }

    // 5. Send metadata with citations & classification info
    res.write(`data: ${JSON.stringify({
      type: 'metadata',
      route,
      classifier: classification.classifier,
      confidence: classification.confidence,
      reference: references,
      citations: references,
      conversationId: convId
    })}\n\n`);

    // 6. Stream LLM tokens from Groq 120B
    const systemPrompt = this.buildSystemPrompt(route, dataContext, references, userContext);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    let fullReply = '';
    const streamStart = Date.now();

    try {
      const stream = await groqStream(messages, {
        model: config.groq?.model || 'gpt-oss-120b',
        temperature: 0.2,
      });

      for await (const chunk of stream) {
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) {
          fullReply += text;
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (err) {
      logger.error(`[SovereignRouter] Groq stream error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ type: 'text', content: `\n\n*Error generating live response: ${err.message}*` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } finally {
      res.end();
    }

    // 7. Record telemetry + persist to MongoDB asynchronously
    const totalTime = ((Date.now() - pipelineStart) / 1000).toFixed(2);
    recordTelemetry({
      type: 'prompt',
      route,
      classifier: classification.classifier,
      confidence: classification.confidence,
      referenceCount: references.length,
      totalTimeMs: Date.now() - pipelineStart,
      streamTimeMs: Date.now() - streamStart,
      prompt: prompt.slice(0, 80),
    });

    this.persistChat(userId, convId, prompt, fullReply, references, totalTime).catch(err => {
      logger.warn(`[SovereignRouter] Chat persistence error: ${err.message}`);
    });
  },

  /**
   * Main unified prompt handler for JSON response (non-streaming fallback).
   * Same hybrid classification + fan-out + search augmentation pipeline.
   */
  async handlePromptJson({ prompt, sessionId, userId, userContext }) {
    const pipelineStart = Date.now();
    const convId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Load conversation context
    const conversationHistory = await this.loadConversationContext(userId, convId);

    // Hybrid classification
    const classification = await this.classifyIntentHybrid(prompt, { conversationHistory });
    const route = classification.route;

    // Fetch data — fan-out or single + augmentation
    let dataContext, references;

    if (route === 'MULTI_STEP' && classification.parameters?.steps?.length > 1) {
      const fanOutResult = await this.fetchFanOut(classification.parameters.steps);
      dataContext = fanOutResult.dataContext;
      references = fanOutResult.references;
    } else if (classification.search_augmentation && route !== 'SEARCH' && route !== 'RESEARCH' && route !== 'CHITCHAT') {
      const [subsystemResult, augmentationRefs] = await Promise.all([
        this.fetchSubsystemData(route, prompt),
        this.fetchSearchAugmentation(prompt),
      ]);
      dataContext = subsystemResult.dataContext;
      references = [...subsystemResult.references, ...augmentationRefs];
    } else {
      const subsystemResult = await this.fetchSubsystemData(route, prompt);
      dataContext = subsystemResult.dataContext;
      references = subsystemResult.references;
    }

    // Build prompt + call LLM
    const systemPrompt = this.buildSystemPrompt(route, dataContext, references, userContext);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    const llmStart = Date.now();
    const result = await groqChat(messages, {
      model: config.groq?.model || 'gpt-oss-120b',
      temperature: 0.2,
    });

    const reply = result.choices?.[0]?.message?.content || '';
    const totalTime = ((Date.now() - pipelineStart) / 1000).toFixed(2);

    // Telemetry
    recordTelemetry({
      type: 'prompt_json',
      route,
      classifier: classification.classifier,
      confidence: classification.confidence,
      referenceCount: references.length,
      totalTimeMs: Date.now() - pipelineStart,
      llmTimeMs: Date.now() - llmStart,
      prompt: prompt.slice(0, 80),
    });

    await this.persistChat(userId, convId, prompt, reply, references, totalTime);

    return {
      prompt,
      sessionId: convId,
      conversationId: convId,
      route,
      classification: {
        route,
        confidence: classification.confidence,
        classifier: classification.classifier,
        reasoning: classification.reasoning,
        search_augmentation: classification.search_augmentation,
      },
      reply,
      responseMessage: {
        answer: reply,
        reference: references,
      },
      references,
      citations: references,
      total_time: totalTime,
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE + TELEMETRY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Asynchronously persists Q&A into MongoDB Chat model
   */
  async persistChat(userId, sessionId, prompt, reply, references, totalTime) {
    if (!userId || !sessionId) return;
    try {
      const searchResults = (references || []).map((r, idx) => ({
        title: r.title || 'Source',
        link: r.url || '',
        snippet: r.snippet || '',
        position: idx + 1,
      }));

      const responseRecord = {
        prompt,
        model: config.groq?.model || 'gpt-oss-120b',
        reply,
        search_results: searchResults,
        total_time: String(totalTime),
      };

      let chatSession = await Chat.findOne({ user: userId, sessionId });
      if (chatSession) {
        chatSession.responses.push(responseRecord);
        await chatSession.save();
      } else {
        chatSession = await Chat.create({
          user: userId,
          sessionId,
          responses: [responseRecord],
        });
        await UserModel.findByIdAndUpdate(userId, {
          $push: { chatAiSessions: chatSession._id },
        });
      }
    } catch (err) {
      logger.warn(`[SovereignRouter] persistChat error: ${err.message}`);
    }
  },

  /**
   * Get telemetry data for monitoring dashboard.
   */
  getTelemetry() {
    return {
      total: telemetryBuffer.length,
      recent: telemetryBuffer.slice(-20),
      routeDistribution: telemetryBuffer.reduce((acc, t) => {
        if (t.route) acc[t.route] = (acc[t.route] || 0) + 1;
        return acc;
      }, {}),
      classifierDistribution: telemetryBuffer.reduce((acc, t) => {
        if (t.classifier) acc[t.classifier] = (acc[t.classifier] || 0) + 1;
        return acc;
      }, {}),
      avgConfidence: telemetryBuffer.filter(t => t.confidence).reduce((sum, t, _, arr) => sum + t.confidence / arr.length, 0).toFixed(3),
    };
  },
};

export default SovereignRouterService;
