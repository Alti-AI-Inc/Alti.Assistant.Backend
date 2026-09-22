import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { groqChat, groqStream, groqLightChat } from '../../services/groq.client.js';
import Chat from '../chat/chat.model.js';
import UserModel from '../auth/auth.model.js';

// Lazy loaders for subsystems
const loadService = async (loader) => {
  try {
    return await loader();
  } catch (err) {
    logger.warn(`[SovereignRouter] Service load failed: ${err.message}`);
    return null;
  }
};

/**
 * Sovereign Router — Central Intelligence Engine
 * Unifies all 14 data intelligence subsystems into one prompt-driven platform.
 */
export const SovereignRouterService = {

  /**
   * Fast rule-based + NLP Intent Classifier across all 14 subsystems
   */
  classifyIntent(prompt) {
    const p = (prompt || '').trim().toLowerCase();

    // 1. Weather
    if (/\b(weather|temperature|forecast|rain|snow|humidity|storm|windspeed|celsius|fahrenheit|degrees|precipitation|radar|uv index)\b/i.test(p)) {
      return 'WEATHER';
    }

    // 2. Aviation / Flights
    if (/\b(flight|fly|airline|airport|airplane|aircraft|boarding|takeoff|departure|arrival|terminal|gate|delayed flight|aviation|iata|icao)\b/i.test(p)) {
      return 'AVIATION';
    }

    // 3. Sports
    if (/\b(score|game|match|fixture|standings|premier league|nba|nfl|f1|formula 1|uefa|champions league|bundesliga|laliga|serie a|mls|nhl|mlb|mma|ufc|boxing|lakers|warriors|celtics|arsenal|chelsea|real madrid|barcelona|manchester)\b/i.test(p)) {
      return 'SPORTS';
    }

    // 4. Prediction Markets & Odds
    if (/\b(polymarket|kalshi|prediction market|odds|spread|moneyline|over\/under|betting line|implied probability|bet_type|sportsbook|draftkings|fanduel|pinnacle)\b/i.test(p)) {
      return 'PREDICTIONS';
    }

    // 5. Crypto
    if (/\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|cryptocurrency|altcoin|memecoin|token|orderbook|coinapi|binance|coinbase|kraken|satoshi|halving|onchain|dex)\b/i.test(p)) {
      return 'CRYPTO';
    }

    // 6. Stocks / Traditional Finance
    if (/\b(stock|ticker|nasdaq|s&p|sp500|dow|nyse|options chain|put\/call|call option|put option|forex|fx|dividend|earnings|pe ratio|market cap|etf|futures|massive\.com|nvda|aapl|tsla|msft|amzn|googl|meta)\b/i.test(p)) {
      return 'FINANCE';
    }

    // 7. Breaking News & World Events
    if (/\b(breaking news|headline|latest news|press release|current events|geopolitics|election news|world news|newsapi|event registry|scandal)\b/i.test(p)) {
      return 'NEWS';
    }

    // 8. Geospatial & Maps
    if (/\b(directions|navigate|route to|how far|distance to|isochrone|commute|coffee shop near|restaurants in|find places|poi|mapbox|geocode|address lookup)\b/i.test(p)) {
      return 'LOCATION';
    }

    // 9. B2B Intelligence & Leads
    if (/\b(b2b|firmographics|company employees|headcount|ceo of|cto of|funding round|series [a-z]|explorium|prospect|lead list|technographics|company revenue)\b/i.test(p)) {
      return 'B2B';
    }

    // 10. Code & Data Execution
    if (/\b(code|python|javascript|typescript|function|regex|sql|debug|algorithm|syntax|compile|execute code|run script|open codex|data analysis|plot|chart)\b/i.test(p)) {
      return 'CODE';
    }

    // 11. SaaS App Actions
    if (/\b(send email|post to slack|slack message|create ticket|jira|github issue|google calendar|schedule meeting|composio|crm|hubspot|salesforce)\b/i.test(p)) {
      return 'TOOL_CALL';
    }

    // 12. Deep Research
    if (/\b(deep research|comprehensive report|in-depth analysis|white paper|literature review|market landscape)\b/i.test(p)) {
      return 'RESEARCH';
    }

    // 13. Search (real-time facts, lookups)
    if (/\b(who is|what is|when did|where is|latest|current|recent|facts|search|find|source)\b/i.test(p)) {
      return 'SEARCH';
    }

    return 'GENERAL';
  },

  /**
   * Fetch live, grounded data across the detected subsystem
   */
  async fetchSubsystemData(route, prompt) {
    const startTime = Date.now();
    let dataContext = '';
    const references = [];

    try {
      switch (route) {
        case 'WEATHER': {
          const { VisualCrossingService } = await import('../visualcrossing/visualcrossing.service.js');
          // Extract location or default to prompt
          const locMatch = prompt.match(/\b(?:in|at|for|near)\s+([A-Za-z\s,]+)/i);
          const location = locMatch ? locMatch[1].trim() : prompt.replace(/weather|temperature|forecast/gi, '').trim() || 'New York';
          const wx = await VisualCrossingService.getForecast(location);
          if (wx) {
            const current = wx.currentConditions || {};
            const nextDays = (wx.days || []).slice(0, 5).map(d => `${d.datetime}: ${d.temp}°C, ${d.conditions} (Rain: ${d.precipprob || 0}%)`).join(' | ');
            dataContext = `Location: ${wx.resolvedAddress || location}\nCurrent Conditions: ${current.temp}°C, Conditions: ${current.conditions}, Humidity: ${current.humidity}%, Wind: ${current.windspeed} km/h\n5-Day Forecast: ${nextDays}`;
            references.push({
              title: `Weather in ${wx.resolvedAddress || location}`,
              url: `https://www.visualcrossing.com/weather-forecast/${encodeURIComponent(location)}`,
              snippet: dataContext,
              source: 'Visual Crossing Weather API'
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
            dataContext = flights.map(f => `Flight ${f.flight?.iata || f.flight?.icao || 'N/A'}: ${f.departure?.airport || 'Dep'} (${f.departure?.iata}) -> ${f.arrival?.airport || 'Arr'} (${f.arrival?.iata}) | Status: ${f.flight_status} | Dep Time: ${f.departure?.estimated || f.departure?.scheduled} | Arr Time: ${f.arrival?.estimated || f.arrival?.scheduled}`).join('\n');
            references.push({
              title: `Flight Status: ${flightNumber || 'Live Aviation Tracking'}`,
              url: 'https://aviationstack.com',
              snippet: dataContext,
              source: 'AviationStack Global Radar'
            });
          }
          break;
        }

        case 'SPORTS': {
          const { ApiSportsService } = await import('../apisports/apisports.service.js');
          const liveScores = await ApiSportsService.getAllCachedLiveScores();
          const liveList = Object.entries(liveScores || {})
            .map(([sport, games]) => `${sport.toUpperCase()}: ${Array.isArray(games) ? games.length : 0} live fixtures`)
            .join(', ');
          dataContext = `Live Sports Status across 12 sports: ${liveList || 'All leagues active'}`;
          references.push({
            title: 'Live Sports Streaming Scores & Intelligence',
            url: 'https://api-sports.io',
            snippet: dataContext,
            source: 'API-Sports.io (12 Sports Engine)'
          });
          break;
        }

        case 'PREDICTIONS': {
          const { PredictionDataService } = await import('../predictiondata/predictiondata.service.js');
          const mkts = await PredictionDataService.getMarkets({ limit: 5 });
          const mList = Array.isArray(mkts?.data) ? mkts.data.slice(0, 5).map(m => `${m.title || m.name || 'Market'}: Implied Odds: ${m.odds || m.price || 'Active'}`).join('\n') : 'Active Prediction Markets';
          dataContext = `Prediction Markets & Odds:\n${mList}`;
          references.push({
            title: 'Prediction Markets & Betting Odds Intelligence',
            url: 'https://www.predictiondata.io',
            snippet: dataContext,
            source: 'PredictionData.io (Polymarket / Kalshi / Sportsbooks)'
          });
          break;
        }

        case 'CRYPTO': {
          const { CoinApiService } = await import('../coinapi/coinapi.service.js');
          const symMatch = prompt.match(/\b(BTC|ETH|SOL|BNB|XRP|DOGE|ADA|AVAX|DOT)\b/i);
          const assetId = symMatch ? symMatch[1].toUpperCase() : 'BTC';
          const rate = await CoinApiService.getExchangeRate(assetId, 'USD');
          if (rate) {
            dataContext = `Real-time Crypto Exchange Rate: 1 ${assetId} = $${Number(rate.rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (Time: ${rate.time || new Date().toISOString()})`;
            references.push({
              title: `${assetId}/USD Real-Time Price & Order Book`,
              url: `https://www.coinapi.io/pricing/${assetId}`,
              snippet: dataContext,
              source: 'CoinAPI.io Multi-Exchange Feed'
            });
          }
          break;
        }

        case 'FINANCE': {
          const { MassiveService } = await import('../massive/massive.service.js');
          const tMatch = prompt.match(/\b(NVDA|AAPL|TSLA|MSFT|AMZN|GOOGL|META|SPY|QQQ)\b/i);
          const ticker = tMatch ? tMatch[1].toUpperCase() : 'SPY';
          const quote = await MassiveService.getQuote(ticker);
          if (quote) {
            dataContext = `Ticker ${ticker} Quote: Price: $${quote.price || quote.c || quote.last || 'N/A'}, Change: ${quote.change || quote.d || '0'}%, High: $${quote.high || quote.h || 'N/A'}, Low: $${quote.low || quote.l || 'N/A'}, Volume: ${quote.volume || quote.v || 'N/A'}`;
            references.push({
              title: `${ticker} Real-time Market Quote & Financials`,
              url: `https://massive.com/stocks/${ticker}`,
              snippet: dataContext,
              source: 'Massive.com Institutional Market Feed'
            });
          }
          break;
        }

        case 'NEWS': {
          const { NewsApiService } = await import('../newsapi/newsapi.service.js');
          const news = await NewsApiService.searchArticles({ keyword: prompt.slice(0, 100), maxItems: 5 });
          const articles = news?.articles?.results || news?.articles || [];
          if (articles.length > 0) {
            dataContext = articles.slice(0, 4).map((a, i) => `[${i + 1}] "${a.title}" (${a.source?.title || 'News'} - ${a.date || 'Recent'}): ${a.body?.slice(0, 150) || a.description || ''}...`).join('\n\n');
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
            dataContext = suggestions.map((s, i) => `${i + 1}. ${s.name} - ${s.place_formatted || s.full_address || ''}`).join('\n');
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
          dataContext = `Explorium B2B Match for "${companyName}": ${JSON.stringify(matchResult).slice(0, 400)}`;
          references.push({
            title: `B2B Intelligence: ${companyName}`,
            url: 'https://www.explorium.ai',
            snippet: dataContext,
            source: 'Explorium AgentSource v2'
          });
          break;
        }

        case 'CODE': {
          const { OpenCodexService } = await import('../codex/codex.service.js');
          dataContext = `Open Codex sovereign sandbox ready for Python / Node.js logic and math verification.`;
          break;
        }

        case 'RESEARCH':
        case 'SEARCH':
        default: {
          // Neural search via Exa
          const { ExaSearchService } = await import('../ExaSearch/exaSearch.service.js');
          const searchRes = await ExaSearchService.searchDirectly(prompt, { numResults: 5 });
          const results = searchRes?.results || [];
          if (results.length > 0) {
            dataContext = results.map((r, i) => `[${i + 1}] "${r.title}" (${r.url}):\n${r.summary || r.text?.slice(0, 250) || ''}`).join('\n\n');
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

  /**
   * Build the Perplexity-beating system prompt with live grounded context
   */
  buildSystemPrompt(route, dataContext, userContext = {}) {
    return `You are Aphura (Alti AI), the sovereign data intelligence search & answer engine, engineered to surpass Perplexity in factual accuracy, real-time depth, and immediate utility.

Platform Capabilities:
You have real-time live connections to 14 sovereign subsystems:
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

Current User Context:
- Active Route: ${route}
- Timezone: ${userContext.timezone || 'UTC'}
- Local Date: ${userContext.localDate || new Date().toDateString()}
- Local Time: ${userContext.localTime || new Date().toTimeString()}

LIVE GROUNDED DATA FROM PLATFORM:
${dataContext ? dataContext : 'No external live stream required for this query. Use internal verified knowledge.'}

Directives:
1. Answer directly and authoritatively. Never begin with conversational filler ("Sure!", "Here is...", "Based on..."). Lead with the exact answer or data.
2. Ground your answer with the live facts, numbers, scores, and statistics provided above.
3. Cite sources with in-line markdown links or brackets like [1], [2] matching the provided references.
4. Format complex data into clean markdown tables, bold key metrics, and bulleted breakdowns.
5. End every response with:
### Related Questions
- [Follow-up question 1]
- [Follow-up question 2]
- [Follow-up question 3]`;
  },

  /**
   * Main unified prompt handler for SSE streaming (primary frontend prompt box target)
   */
  async handlePromptStream({ prompt, sessionId, userId, userContext, res }) {
    const route = this.classifyIntent(prompt);
    logger.info(`[SovereignRouter] Stream prompt: "${prompt.slice(0, 60)}" -> Route: ${route}`);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const convId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 1. Send connected event with conversationId
    res.write(`data: ${JSON.stringify({ type: 'connected', conversationId: convId })}\n\n`);

    // 2. Fetch live data from subsystem
    const { dataContext, references } = await this.fetchSubsystemData(route, prompt);

    // 3. Send metadata with citations & references
    res.write(`data: ${JSON.stringify({
      type: 'metadata',
      route,
      reference: references,
      citations: references,
      conversationId: convId
    })}\n\n`);

    // 4. Stream LLM tokens from Groq 120B
    const systemPrompt = this.buildSystemPrompt(route, dataContext, userContext);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    let fullReply = '';
    const startTime = Date.now();

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

    // 5. Persist to MongoDB Chat model asynchronously
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    this.persistChat(userId, convId, prompt, fullReply, references, totalTime).catch(err => {
      logger.warn(`[SovereignRouter] Chat persistence error: ${err.message}`);
    });
  },

  /**
   * Main unified prompt handler for JSON response (non-streaming fallback)
   */
  async handlePromptJson({ prompt, sessionId, userId, userContext }) {
    const route = this.classifyIntent(prompt);
    const convId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const { dataContext, references } = await this.fetchSubsystemData(route, prompt);
    const systemPrompt = this.buildSystemPrompt(route, dataContext, userContext);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    const startTime = Date.now();
    const result = await groqChat(messages, {
      model: config.groq?.model || 'gpt-oss-120b',
      temperature: 0.2,
    });

    const reply = result.choices?.[0]?.message?.content || '';
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    await this.persistChat(userId, convId, prompt, reply, references, totalTime);

    return {
      prompt,
      sessionId: convId,
      conversationId: convId,
      route,
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
};

export default SovereignRouterService;
