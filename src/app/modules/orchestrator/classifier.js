import { groqLightToolCall } from '../../services/groq.client.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Route types supported by the sovereign orchestrator.
 * 14 domain-specific subsystem routes + meta routes.
 */
export const ROUTE_TYPES = {
  // Domain-specific subsystem routes
  WEATHER: 'WEATHER',
  AVIATION: 'AVIATION',
  SPORTS: 'SPORTS',
  PREDICTIONS: 'PREDICTIONS',
  CRYPTO: 'CRYPTO',
  FINANCE: 'FINANCE',
  NEWS: 'NEWS',
  LOCATION: 'LOCATION',
  B2B: 'B2B',
  CODE: 'CODE',
  TOOL_CALL: 'TOOL_CALL',
  RESEARCH: 'RESEARCH',
  SEARCH: 'SEARCH',
  CHITCHAT: 'CHITCHAT',
  // Meta routes
  MULTI_STEP: 'MULTI_STEP',
};

/**
 * Tool-calling schema for Groq gpt-oss-20b intent classification.
 * Uses structured function output to guarantee parseable routing decisions.
 */
const CLASSIFICATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'classify_intent',
      description: 'Classify a user message into the optimal processing route and extract structured parameters.',
      parameters: {
        type: 'object',
        properties: {
          route: {
            type: 'string',
            enum: Object.values(ROUTE_TYPES),
            description: `The processing route. Select the MOST SPECIFIC domain route:
- WEATHER: Temperature, forecast, rain, snow, humidity, UV index, storm, wind, precipitation, climate
- AVIATION: Flights, airlines, airports, boarding, takeoff, departure, arrival, terminal, gate, IATA/ICAO codes, tracking a flight number
- SPORTS: Scores, games, matches, fixtures, standings, leagues (NFL, NBA, NHL, MLB, MLS, F1, UFC, Premier League, La Liga, Bundesliga, Serie A, Champions League), team names
- PREDICTIONS: Prediction markets, betting odds, spreads, moneylines, over/under, sportsbooks (Polymarket, Kalshi, DraftKings, FanDuel, Pinnacle)
- CRYPTO: Bitcoin, Ethereum, Solana, BNB, XRP, any crypto asset, blockchain, DeFi, NFT, token prices, exchange rates, orderbooks
- FINANCE: Stocks, tickers (NVDA, AAPL, TSLA, MSFT, AMZN, GOOGL, META, SPY, QQQ), options, forex, ETFs, futures, dividends, earnings, market cap, PE ratio
- NEWS: Breaking news, headlines, current events, world news, geopolitics, elections, press releases, scandals
- LOCATION: Directions, navigation, distance, nearby places, restaurants, coffee shops, POIs, geocoding, addresses, maps
- B2B: Company information, firmographics, funding rounds, CEO/CTO lookups, employee counts, revenue, technographics, lead lists, prospects
- CODE: Code generation, programming, debugging, algorithms, syntax, scripts, data analysis, plotting, charts
- TOOL_CALL: Send email, Slack message, create ticket, JIRA, GitHub issue, Google Calendar, schedule meeting, CRM actions
- RESEARCH: Deep research, comprehensive reports, in-depth analysis, white papers, literature reviews, market landscape studies
- SEARCH: General factual lookups, "who is", "what is", "when did", recent information, current facts — use when no specific domain matches
- CHITCHAT: ONLY for brief greetings/pleasantries of 4 words or fewer (hi, hello, thanks, bye). Everything else should go to a data route.
- MULTI_STEP: Compound requests that need MULTIPLE different domain routes (e.g. "weather in NYC and NVDA stock price")`,
          },
          confidence: {
            type: 'number',
            description: 'Classification confidence from 0.0 to 1.0',
          },
          search_augmentation: {
            type: 'boolean',
            description: 'Whether the response should be augmented with real-time Exa web search results in addition to the primary subsystem data. Set true for any query where web context would improve the answer.',
          },
          parameters: {
            type: 'object',
            description: 'Route-specific parameters extracted from the user message',
            properties: {
              query: { type: 'string', description: 'The core query or task description' },
              entities: {
                type: 'array',
                items: { type: 'string' },
                description: 'Key entities extracted: ticker symbols, flight numbers, city names, company names, team names, crypto symbols',
              },
              language: { type: 'string', description: 'Programming language if CODE route' },
              code_action: {
                type: 'string',
                enum: ['generate', 'explain', 'refactor', 'review', 'execute'],
                description: 'Specific code action if CODE route',
              },
              tool_name: { type: 'string', description: 'Target tool/service name if TOOL_CALL route' },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    route: { type: 'string', description: 'The subsystem route for this step' },
                    query: { type: 'string', description: 'The sub-query for this step' },
                  },
                },
                description: 'Ordered sub-queries if MULTI_STEP route. Each step has its own route and query.',
              },
            },
          },
          reasoning: {
            type: 'string',
            description: 'Brief explanation of why this route was selected',
          },
        },
        required: ['route', 'confidence', 'search_augmentation', 'parameters', 'reasoning'],
      },
    },
  },
];

const CLASSIFIER_SYSTEM_PROMPT = `You are the intent classification engine for Aphura, a sovereign data intelligence platform with 14 live subsystems.
Your ONLY job is to call the classify_intent function with the correct route.

CRITICAL ROUTING RULES (in priority order):
1. ALWAYS pick the MOST SPECIFIC domain route. "NVDA price" → FINANCE, not SEARCH. "Weather NYC" → WEATHER, not SEARCH.
2. SEARCH is the fallback for factual queries that don't match any specific domain.
3. CHITCHAT is ONLY for ≤4-word greetings/pleasantries. "What is AI?" is SEARCH, not CHITCHAT.
4. If the prompt asks for TWO OR MORE different domains (e.g. "weather in NYC and NVDA stock"), return MULTI_STEP with steps[] containing each sub-route.
5. Set search_augmentation=true when web context would improve the answer (most non-CHITCHAT routes benefit from this).

ENTITY EXTRACTION:
- Stock tickers: NVDA, AAPL, TSLA, MSFT, AMZN, GOOGL, META, SPY, QQQ, etc.
- Crypto symbols: BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, DOT, etc.
- Flight numbers: AA100, UA1234, BA295, DL123, etc.
- City names: Extract from location context
- Team/league names: Extract from sports context
- Company names: Extract from B2B context

CONTEXT AWARENESS:
If conversation history is provided, use it to disambiguate. Example: If the last message was about NVDA stock, and the user says "what about AAPL?", route to FINANCE.`;

/**
 * Keyword-based heuristic classifier with confidence scores.
 * Used as fast path and fallback.
 */
const DOMAIN_HEURISTICS = [
  // High-confidence domain patterns (exact entity matches)
  { route: ROUTE_TYPES.WEATHER, patterns: /\b(weather|temperature|forecast|rain|snow|humidity|storm|windspeed|celsius|fahrenheit|degrees|precipitation|radar|uv index|heat wave|cold front|dew point)\b/i, confidence: 0.9 },
  { route: ROUTE_TYPES.AVIATION, patterns: /\b(flight|fly|airline|airport|airplane|aircraft|boarding|takeoff|departure|arrival|terminal|gate|delayed flight|aviation|iata|icao)\b/i, confidence: 0.9 },
  { route: ROUTE_TYPES.AVIATION, patterns: /\b[A-Z]{2}\s?\d{1,4}\b/, confidence: 0.95 }, // Flight number pattern (AA100, UA1234)
  { route: ROUTE_TYPES.SPORTS, patterns: /\b(score|game|match|fixture|standings|premier league|nba|nfl|f1|formula 1|uefa|champions league|bundesliga|laliga|serie a|mls|nhl|mlb|mma|ufc|boxing|lakers|warriors|celtics|arsenal|chelsea|real madrid|barcelona|manchester|playoffs|world cup|super bowl)\b/i, confidence: 0.9 },
  { route: ROUTE_TYPES.PREDICTIONS, patterns: /\b(polymarket|kalshi|prediction market|odds|spread|moneyline|over\/under|betting line|implied probability|bet_type|sportsbook|draftkings|fanduel|pinnacle|betting|wager)\b/i, confidence: 0.9 },
  { route: ROUTE_TYPES.CRYPTO, patterns: /\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|cryptocurrency|altcoin|memecoin|token|orderbook|coinapi|binance|coinbase|kraken|satoshi|halving|onchain|dex|defi|nft|blockchain|web3)\b/i, confidence: 0.9 },
  { route: ROUTE_TYPES.FINANCE, patterns: /\b(stock|ticker|nasdaq|s&p|sp500|dow|nyse|options chain|put\/call|call option|put option|forex|fx|dividend|earnings|pe ratio|market cap|etf|futures|massive\.com)\b/i, confidence: 0.85 },
  { route: ROUTE_TYPES.FINANCE, patterns: /\b(NVDA|AAPL|TSLA|MSFT|AMZN|GOOGL|META|SPY|QQQ|AMD|INTC|NFLX|DIS|BA|JPM|GS|V|MA|WMT|COST)\b/, confidence: 0.95 }, // Exact ticker match
  { route: ROUTE_TYPES.NEWS, patterns: /\b(breaking news|headline|latest news|press release|current events|geopolitics|election news|world news|newsapi|event registry|scandal|war|conflict|crisis)\b/i, confidence: 0.85 },
  { route: ROUTE_TYPES.LOCATION, patterns: /\b(directions|navigate|route to|how far|distance to|isochrone|commute|coffee shop near|restaurants in|find places|poi|mapbox|geocode|address lookup|nearby|drive to)\b/i, confidence: 0.9 },
  { route: ROUTE_TYPES.B2B, patterns: /\b(b2b|firmographics|company employees|headcount|ceo of|cto of|funding round|series [a-z]|explorium|prospect|lead list|technographics|company revenue|valuation)\b/i, confidence: 0.85 },
  { route: ROUTE_TYPES.CODE, patterns: /\b(code|python|javascript|typescript|function|regex|sql|debug|algorithm|syntax|compile|execute code|run script|open codex|data analysis|plot|chart|programming|refactor|api endpoint)\b/i, confidence: 0.8 },
  { route: ROUTE_TYPES.TOOL_CALL, patterns: /\b(send email|post to slack|slack message|create ticket|jira|github issue|google calendar|schedule meeting|composio|crm|hubspot|salesforce)\b/i, confidence: 0.9 },
  { route: ROUTE_TYPES.RESEARCH, patterns: /\b(deep research|comprehensive report|in-depth analysis|white paper|literature review|market landscape|detailed study|full report)\b/i, confidence: 0.85 },
  { route: ROUTE_TYPES.SEARCH, patterns: /\b(who is|what is|when did|where is|latest|current|recent|facts|search|find|source|how does|why does|explain)\b/i, confidence: 0.6 },
];

/**
 * Detect compound/multi-domain prompts using conjunction patterns.
 * Returns array of detected sub-queries with their heuristic routes.
 */
function detectCompoundIntent(prompt) {
  const p = prompt.trim();
  // Split on "and", "also", "plus", "as well as", "then" conjunctions
  const conjunctionPattern = /\b(?:and also|and then|and|also|plus|as well as|then|additionally)\b/i;
  if (!conjunctionPattern.test(p)) return null;

  const parts = p.split(conjunctionPattern).map(s => s.trim()).filter(s => s.length > 3);
  if (parts.length < 2) return null;

  // Classify each part independently
  const subRoutes = parts.map(part => {
    for (const { route, patterns, confidence } of DOMAIN_HEURISTICS) {
      if (patterns.test(part)) {
        return { route, query: part, confidence };
      }
    }
    return { route: ROUTE_TYPES.SEARCH, query: part, confidence: 0.5 };
  });

  // Only fan out if we detected at least 2 DIFFERENT routes
  const uniqueRoutes = new Set(subRoutes.map(r => r.route));
  if (uniqueRoutes.size < 2) return null;

  return subRoutes.slice(0, 3); // Cap at 3 concurrent fan-out routes
}

/**
 * Classifies user intent using heuristic keyword matching.
 * Returns best match with confidence score.
 */
function heuristicClassify(message) {
  const p = (message || '').trim();

  // Check for compound intent first
  const compound = detectCompoundIntent(p);
  if (compound) {
    return {
      route: ROUTE_TYPES.MULTI_STEP,
      confidence: 0.8,
      search_augmentation: true,
      parameters: { query: p, steps: compound },
      reasoning: `Compound prompt detected: ${compound.map(s => s.route).join(' + ')}`,
      classifier: 'heuristic',
    };
  }

  // Pure brief greeting check
  if (/^(hi|hello|hey|greetings|thanks|thank you|good morning|good afternoon|good evening|bye|goodbye|who are you)\b/i.test(p) && p.split(/\s+/).length <= 4) {
    return {
      route: ROUTE_TYPES.CHITCHAT,
      confidence: 0.95,
      search_augmentation: false,
      parameters: { query: p },
      reasoning: 'Brief conversational greeting detected',
      classifier: 'heuristic',
    };
  }

  // Score all domain patterns and pick highest confidence match
  let bestMatch = null;
  for (const { route, patterns, confidence } of DOMAIN_HEURISTICS) {
    if (patterns.test(p)) {
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { route, confidence };
      }
    }
  }

  if (bestMatch) {
    return {
      route: bestMatch.route,
      confidence: bestMatch.confidence,
      search_augmentation: bestMatch.confidence < 0.85,
      parameters: { query: p },
      reasoning: `Heuristic domain match → ${bestMatch.route} (confidence: ${bestMatch.confidence})`,
      classifier: 'heuristic',
    };
  }

  // Default to SEARCH for maximum citation coverage
  return {
    route: ROUTE_TYPES.SEARCH,
    confidence: 0.5,
    search_augmentation: true,
    parameters: { query: p },
    reasoning: 'No strong domain signal, defaulting to SEARCH for third-party verifiable citations',
    classifier: 'heuristic',
  };
}

/**
 * Intent Classifier Engine.
 * Primary: Groq gpt-oss-20b tool-calling for fast structured classification (~100ms).
 * Fallback: Keyword heuristic when LLM is unavailable or slow.
 */
export const IntentClassifier = {
  /**
   * Classify a user message into a processing route.
   * @param {string} message - The user's message
   * @param {object} options - { maxLatencyMs, conversationHistory }
   * @returns {Promise<{ route: string, confidence: number, parameters: object, reasoning: string, search_augmentation: boolean, classifier: string }>}
   */
  async classify(message, options = {}) {
    const { maxLatencyMs = 1500, conversationHistory = [] } = options;
    const startTime = Date.now();

    try {
      const messages = [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        ...conversationHistory.slice(-4).map(m => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user', content: message },
      ];

      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), maxLatencyMs);

      const response = await groqLightToolCall(messages, CLASSIFICATION_TOOLS, {
        model: config.groq?.lightModel || 'gpt-oss-20b',
        temperature: 0.0,
        max_tokens: 512,
        tool_choice: { type: 'function', function: { name: 'classify_intent' } },
      });

      clearTimeout(timeoutId);

      const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        logger.warn('[Classifier] No tool call returned, falling back to heuristic');
        return heuristicClassify(message);
      }

      const classification = JSON.parse(toolCall.function.arguments);
      const latencyMs = Date.now() - startTime;

      logger.info(`[Classifier] LLM Route: ${classification.route} | Confidence: ${classification.confidence} | Latency: ${latencyMs}ms`);

      return {
        ...classification,
        classifier: 'llm',
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      logger.warn(`[Classifier] LLM classification failed (${latencyMs}ms): ${err.message}. Falling back to heuristic.`);
      return heuristicClassify(message);
    }
  },

  /**
   * Fast heuristic-only classification (no LLM call).
   * Use when latency budget is critical or for pre-screening.
   */
  classifyFast(message) {
    return heuristicClassify(message);
  },

  /**
   * Detect compound intent for multi-route fan-out.
   * Returns null if prompt is single-domain, or array of sub-routes if compound.
   */
  detectCompound(message) {
    return detectCompoundIntent(message);
  },

  /**
   * Batch classify multiple messages (for pre-routing or analytics).
   * @param {string[]} messages
   * @returns {Promise<Array>}
   */
  async classifyBatch(messages) {
    return Promise.all(messages.map(msg => this.classify(msg)));
  },
};

export default IntentClassifier;
