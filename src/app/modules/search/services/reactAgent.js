import { SafeGoogleGenerativeAIEmbeddings } from '../../../../shared/embeddings.js';
import { DynamicTool } from '@langchain/core/tools';
import { WebBrowser } from 'langchain/tools/webbrowser';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { googleSearch, YouTubeSearchTool, newsapiGlobalNewsSearch, altiGreenlightIntelligenceSearch, altiPremiumIntelligenceSearch, altiEnterpriseIntelligenceSearch } from '../tools.js';
import config from '../../../../../config/index.js';
import vertexAiService from './vertexAiService.js';
import {
  selectModelSmart,
  gemini2_5Flash,
  gemini3ProPreview,
} from './geminiService.js';
import { checkTenantBudgetStatus } from './marketplaceMeteringService.js';
import { openMemoryClient } from '../../../shared/openMemoryClient.js';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';
import { sportsSmartRouter } from '../../../helpers/sportsSmartRouter.js';
import { aviationstackSmartRouter } from '../../../helpers/aviationstackSmartRouter.js';
import {
  classifyAcademicQuery,
  classifyDiscussionQuery,
  classifyNewsQuery,
  classifyWeatherQuery,
  classifyMedicalQuery,
  classifyFoodQuery,
  classifyLegalQuery,
  classifyPatentQuery,
  classifySecurityQuery,
  classifyGovFinanceQuery,
  classifyRealEstateQuery,
  classifyEconomicsQuery,
  classifyBiologyQuery,
  classifyEntertainmentQuery,
  classifyTravelQuery,
  classifyShoppingQuery,
  classifyCareerQuery,
  classifyAutomotiveQuery,
  classifyGamingQuery,
  classifyEnvironmentQuery,
  classifyLocalQuery,
  classifyEducationQuery,
  classifyDIYQuery,
  classifySpaceAviationQuery,
  classifyHistoryQuery,
  classifyArtDesignQuery,
  classifyPhilosophyQuery,
  classifyMusicQuery,
  classifyPetsQuery,
  classifyGeopoliticsQuery,
  classifyArchitectureQuery,
  classifyAgricultureQuery,
  classifyChemistryQuery,
  classifyHobbiesQuery,
  classifyLogisticsQuery,
  classifyPersonalFinanceQuery,
  classifyCryptoQuery,
  classifyFitnessQuery,
  classifyPsychologyQuery,
  classifyInsuranceQuery,
  classifyRoboticsQuery,
  classifyTicketingQuery,
  classifyAstronomyQuery,
  classifyAnthropologyQuery,
  classifyLinguisticsQuery,
  classifyPediatricsQuery,
  classifySustainabilityQuery,
  classifyDropshippingQuery,
  classifyCivilLawQuery,
  classifyPedagogyQuery,
  classifyVeterinaryQuery,
  classifyMeteorologyQuery,
  classifyUrbanPlanningQuery,
  classifyFoodChemistryQuery,
  classifyMarineBiologyQuery,
  classifyTheoreticalPhysicsQuery,
  classifyPaleontologyQuery,
  classifyBiomedicalQuery,
  classifyClimatologyQuery,
  classifyNeurotechQuery,
  classifyAstrobiologyQuery,
  classifyNanotechQuery,
  classifyNuclearQuery,
  classifyGeneticsQuery,
  classifyVentureCapitalQuery,
  classifyDigitalHumanitiesQuery,
  classifyVirologyQuery,
  classifyQuantumComputingQuery,
  classifyMetallurgyQuery,
  classifyOrganicChemistryQuery,
  classifyGridInfrastructureQuery,
  classifyMLOpsQuery,
  classifyFluidDynamicsQuery,
  classifyEndocrinologyQuery,
  classifyCryptographyQuery,
  classifyBehavioralEconomicsQuery,
  classifySeismologyQuery,
  classifyCompilerDesignQuery,
  classifyParticlePhysicsQuery,
  classifyNanomedicineQuery,
  classifyPropulsionQuery,
  classifyMechanismDesignQuery,
  classifyGlaciologyQuery,
  classifyFormalVerificationQuery,
} from './queryClassifier.js';

/**
 * ReAct Agent Service
 * Executes tool-based conversation with reasoning and action cycles
 * NOW WITH SMART MODEL SELECTION
 */

/**
 * Executes a ReAct (Reasoning + Acting) agent conversation with tool calls
 * @param {Array} messages - Array of conversation messages
 * @param {Object} options - Additional options including userId and query context
 * @returns {Object} Formatted response with answer, references, and citations
 */
export async function executeToolBasedConversation(messages, options = {}) {
  const budget = await checkTenantBudgetStatus('alti-enterprise-tenant-default');
  if (budget.isBlocked) {
    throw new Error(`BillingLimitExceeded: Budget limit exceeded. Spend: $${budget.currentSpend.toFixed(2)}, Limit: $${budget.budgetLimit.toFixed(2)}`);
  }

  const resolvedUserId =
    options?.userId || options?.authUserId || options?.user?.id || null;

  // Extract query from messages for smart model selection
  const userMessages = messages.filter((m) => m.role === 'user');
  const currentQuery =
    userMessages.length > 0
      ? userMessages[userMessages.length - 1].content
      : '';

  // SMART MODEL SELECTION based on query
  const conversationHistory = messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  );
  const selectedLLM = selectModelSmart(currentQuery, {
    conversationHistory,
    searchDepth: options.searchDepth || 'standard',
    previousToolCalls: options.previousToolCalls || 0,
  });

  console.log(
    '🤖 ReactAgent using selected model for tool-based conversation',
    selectModelSmart
  );

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const massiveFinancialTool = new DynamicTool({
    name: 'massive-financial-data',
    description: `Real-time financial market data from Massive.com. Use this tool for ANY query about:
- Stock prices, quotes, or market data (e.g. "AAPL price", "Tesla stock today")
- Options chains, calls, puts, open interest, implied volatility
- Cryptocurrency prices and technical analysis (Bitcoin, Ethereum, Solana, etc.)
- Forex / currency exchange rates (EUR/USD, GBP/USD, USD/JPY, etc.)
- Market indices: S&P 500, NASDAQ, Dow Jones, Russell 2000, VIX
- Commodities: Gold, Silver, Crude Oil, Natural Gas, Wheat, Copper
- Sector performance (Technology, Financials, Energy, Healthcare, etc.)
- Market overview / daily market summary
- Stock groups: FAANG, Magnificent 7, Big Banks, Chip Stocks, EV Stocks
- Technical indicators: RSI, MACD, EMA, SMA, golden cross / death cross
- 52-week high and low for any stock
- Dividend history and yield
- Short interest and days to cover
- Currency conversion with amounts (e.g. "convert 1000 EUR to USD")
- Top gainers, losers, most active stocks today
- Federal Reserve data: interest rates, CPI, treasury yields
- IPO calendar
Input: A natural language query about financial markets (e.g. "What is the current price of Apple?", "Show me Bitcoin RSI", "What are the top sector performers today?")`,
    async func(query) {
      try {
        const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(query);
        // If the router enhanced the prompt, it contains real-time financial data
        // Extract just the data block (everything after the [SYSTEM INSTRUCTION] header)
        if (result && result !== query) {
          const dataStart = result.indexOf('##');
          if (dataStart !== -1) {
            return result.slice(dataStart);
          }
          return result;
        }
        return `No financial data found for query: "${query}". This may not be a financial query.`;
      } catch (err) {
        return `Financial data lookup failed: ${err.message}`;
      }
    },
  });

  const sportsBettingTool = new DynamicTool({
    name: 'predictiondata-sports-odds', // REACT_AGENT_V4_SPORTS
    description: `Real-time sports betting intelligence powered by PredictionData.io. Use for ANY query involving:

**ODDS & LINES (live + pre-game)**
- Moneyline, spread, over/under, alternate lines, live in-game lines
- All bet periods: 1H, 2H, 1Q–4Q, 1P–3P, F1-F9, 1S-2S, REG
- No-vig fair value odds, line movement (open vs current), implied probability

**PLAYER PROPS — Auto-resolved by player name**
- Type a player name → automatically routes to correct league + props
- NFL: pass/rush/rec yards, TDs, receptions, completions, sacks, INTs
- NBA: points, rebounds, assists, 3PM, blocks, steals, double-double
- MLB: Ks, hits, HRs, RBIs, total bases, ERA, pitcher outs
- NHL: goals, assists, shots, saves, PPP, blocked shots
- UFC: method of victory, round, fight distance, strikes, takedowns
- Golf: outright winner, top 5/10/20, make cut, head-to-head, round score
- Tennis: match winner, games/sets, correct score, aces, double faults
- WNBA: points, rebounds, assists, 3PM, blocks, double-double
- DFS: PrizePicks (385), Underdog Fantasy (387), Sleeper (595) alongside sportsbooks

**FUTURES & CHAMPIONSHIPS**
- Auto-targeted: "Super Bowl odds" → ONLY Super Bowl Winner market
- NFL: SB winner, MVP, DPOY, conference winners, division winners
- NBA: Finals winner, MVP, DPOY, ROY, Sixth Man
- MLB: World Series, Cy Young, MVP, Silver Slugger
- NHL: Stanley Cup, Hart, Vezina, Calder, Conn Smythe
- UFC: Weight class champions, fight of the year
- Golf: Masters, US Open, The Open, PGA Championship outright winner
- WNBA: Commissioner Trophy, Finals MVP, Regular Season MVP

**SAME GAME PARLAY (SGP) — AUTO-PRICED**
- Specify 2+ legs from the same game → real combined odds from multiple books
- Example: "Price SGP: Chiefs ML + Mahomes over 280.5 yds + Kelce over 6.5 rec"

**PARLAY BUILDER — MULTI-GAME**
- Calculate combined odds for 2–12 legs across any games
- Shows payout table for $10/$25/$50/$100 stakes
- Example: "Build me a parlay: Chiefs -110, Lakers +105, Dodgers -130"

**ARBITRAGE DETECTION**
- Scans 11 books simultaneously for risk-free profit opportunities
- Shows optimal stake allocation and guaranteed profit %
- Example: "Find me arbitrage opportunities in the NFL tonight"

**LINE MOVEMENT / STEAM DETECTION**
- Tracks open → current odds delta — big moves = sharp money
- Example: "Show me the biggest line movers for NBA tonight"

**SHARP MONEY ANALYSIS**
- Uses Pinnacle (sharpest book) as reference vs public book average
- Divergence > 2¢ signals sharp side
- Example: "Where is the sharp money in NFL this week?"

**VALUE BETS (+EV)**
- Compares book implied probability vs no-vig fair value
- Surfaces markets with positive expected value edge
- Example: "Find me +EV bets in the NBA tonight"

**BEST AVAILABLE (Line Shopping)**
- Compares odds across all 11 books to find best price per side
- Example: "What's the best available odds for the Chiefs to win?"

**MATCHUP ANALYSIS**
- Side-by-side all odds for a specific game from all books
- Example: "Chiefs vs Raiders matchup odds"

**PREDICTION MARKETS**
- Polymarket and Kalshi bid/ask orderbook with volume
- Example: "Polymarket odds on the NBA Finals"

**MULTI-SPORT / ALL SPORTS**
- "All games tonight" → NFL + NBA + MLB + NHL + UFC simultaneously

**LIVE SCORES + LIVE ODDS**
- Real-time scores, period/quarter/inning, game clock
- Auto-promoted from standard odds when games are in-progress

**ALL LEAGUES**
NFL • NBA • MLB • NHL • UFC • WNBA • MLS • EPL • La Liga • Bundesliga • Serie A • Ligue 1 • Champions League • NCAA FB • NCAA BB • Golf (PGA/LIV) • Tennis (ATP/WTA) • CFL • UFL • XFL

**ALL SPORTSBOOKS (18)**
FanDuel (100) • DraftKings (200) • Caesars (300) • BetMGM (400) • Pinnacle (250) • ESPN Bet (700) • bet365 (365) • BetRivers (500) • Betway (555) • Bovada (643) • Fanatics (722) • LowVig (617) • Novig (192) • Circa (150) • Sporttrade (448) • PrizePicks (385) • Underdog Fantasy (387) • Sleeper (595)

Input: Any natural language sports betting query. The tool auto-detects intent, league, player name, and analysis mode.`,
    async func(query) {
      try {
        const result = await sportsSmartRouter.routeAndEnhancePrompt(query);
        if (result && result !== query) {
          const dataStart = result.indexOf('##');
          if (dataStart !== -1) return result.slice(dataStart);
          return result;
        }
        return `No sports betting data found for query: "${query}". This may not be a sports betting query, or the league may not be supported.`;
      } catch (err) {
        return `Sports odds lookup failed: ${err.message}`;
      }
    },
  });

  const aviationStackRealtimeTool = new DynamicTool({
    name: 'aviationstack-realtime-data',
    description: `Real-time global aviation intelligence powered by AviationStack.com, NOAA, FAA, and NTSB. Use this tool for ANY query involving:
- Flight tracking and live status (e.g. "flight UA342 status", "DL123 delayed?", "is AA456 on time?")
- Airport departures, arrivals, and operational boards (e.g. "JFK departures", "Heathrow arrivals board")
- Route searches and flight schedules (e.g. "flights from JFK to LHR", "LAX to ORD schedule")
- Airline details, fleet lookups, and descriptions (e.g. "United Airlines fleet", "Delta Air Lines details")
- Aircraft registration, tail number lookups, and plane models (e.g. "plane tail N104UA", "airplane registration N104UA")
- NOAA aviation weather reports and forecasts (METAR/TAF) (e.g. "JFK METAR weather report", "weather at LAX")
- FAA NAS airport operational status, Ground Stops, Ground Delays, and delay programs (e.g. "FAA ground stop at ORD", "delays at SFO")
- FAA NOTAM active notices, safety warnings, and runway status (e.g. "LAX airport active NOTAMs", "notams for ORD")
- NTSB historical civil aviation accident and safety incident logs (e.g. "Boeing 737 Max NTSB safety record", "United Airlines accidents")
- ICAO Fuel Planning and Weight limits (e.g. "Boeing 777 fuel burn over 8 hours", "payload flight plan fuel")
- Noise Curfew violations (e.g. "Frankfurt airport noise curfew", "LHR curfew hours delay")
- Oceanic Track (NAT-OTS) and ETOPS transoceanic alternate planner (e.g. "active Oceanic Track B weather", "ETOPS rules LHR to JFK")
- Passenger Delay Compensation (EU261/UK261, US DOT tarmac delay fines, Montreal Convention) (e.g. "passenger compensation rules DL123 delayed 4 hours")
- Volcanic Ash Trajectory Projection models (VAAC Reykjavik, Anchorage, Darwin) (e.g. "volcanic ash cloud trajectory Reykjavik Katla volcano")
- IATA HAZMAT Cargo Manifest compliance (e.g. "IATA dangerous goods compliance Lithium Batteries Paint")
- Jet Stream high-altitude turbulence (CAT) and wind shear (e.g. "jet stream wind shear forecast moderate turbulence speed")
Input: A natural language query about flights, routes, airports, airlines, aircraft, weather, FAA delays/NOTAMs, NTSB records, fuel planning, curfews, ETOPS, compensation, volcanic ash plume detours, HAZMAT manifests, or turbulence/jet streams.`,
    async func(query) {
      try {
        const result = await aviationstackSmartRouter.routeAndEnhancePrompt(query);
        if (result && result !== query) {
          const dataStart = result.indexOf('##');
          if (dataStart !== -1) return result.slice(dataStart);
          return result;
        }
        return `No aviation data found for query: "${query}". This may not be an aviation query.`;
      } catch (err) {
        return `Aviation stack lookup failed: ${err.message}`;
      }
    },
  });

  const lookupHuggingfaceIndicesTool = new DynamicTool({
    name: 'lookup-huggingface-indices',
    description: `Search Alti's local registry of fully indexed, commercially clean Hugging Face datasets. Use this when the user asks about specific domains or documents that might be in Alti's dataset repository (e.g. historical stock prices, academic literature, weather patterns, or specific custom datasets). Input is an optional search query string to filter dataset name and description.`,
    async func(rawInput) {
      try {
        let payload = {};
        if (typeof rawInput === 'string') {
          const trimmed = rawInput.trim();
          if (trimmed.startsWith('{')) {
            try {
              payload = JSON.parse(trimmed);
            } catch (err) {
              payload = { keyword: rawInput };
            }
          } else {
            payload = { keyword: rawInput };
          }
        } else if (typeof rawInput === 'object' && rawInput !== null) {
          payload = rawInput;
        }

        // Unwrap LangChain structured nesting if present
        if (payload.input !== undefined) {
          if (typeof payload.input === 'object' && payload.input !== null) {
            payload = payload.input;
          } else if (typeof payload.input === 'string') {
            const trimmedInput = payload.input.trim();
            if (trimmedInput.startsWith('{')) {
              try {
                payload = JSON.parse(trimmedInput);
              } catch (e) {
                payload = { keyword: payload.input };
              }
            } else {
              payload = { keyword: payload.input };
            }
          }
        }

        const keyword = payload.keyword || payload.query || payload.q || (typeof payload.input === 'string' ? payload.input : '');
        const { default: Dataset } = await import('../../datasets/datasets.model.js');
        
        let query = { status: 'indexed' };
        if (keyword && typeof keyword === 'string' && keyword.trim()) {
          const trimmed = keyword.trim();
          const terms = trimmed.split(/\s+/).filter(t => t.length > 2);
          if (terms.length === 0 && trimmed.length > 0) {
            terms.push(trimmed);
          }
          
          const orConditions = [];
          for (const term of terms) {
            orConditions.push(
              { datasetId: { $regex: term, $options: 'i' } },
              { name: { $regex: term, $options: 'i' } },
              { description: { $regex: term, $options: 'i' } },
              { tags: { $regex: term, $options: 'i' } }
            );
          }
          
          query = {
            $and: [
              { status: 'indexed' },
              { $or: orConditions }
            ]
          };
        }
        
        const datasets = await Dataset.find(query, 'datasetId name description tags rowCount features').limit(10);
        
        if (datasets.length === 0) {
          return 'No matching indexed Hugging Face datasets found in Alti\'s local registry.';
        }
        
        return JSON.stringify(datasets.map(d => ({
          datasetId: d.datasetId,
          name: d.name,
          description: d.description,
          tags: d.tags,
          rowCount: d.rowCount,
          features: d.features
        })));
      } catch (err) {
        return `Failed to lookup Hugging Face indices: ${err.message}`;
      }
    }
  });

  const queryHuggingfaceIndexTool = new DynamicTool({
    name: 'query-huggingface-index',
    description: `Retrieve relevant context chunks from a specific indexed Hugging Face dataset. Use this after identifying a relevant dataset from 'lookup-huggingface-indices' to search its contents. Input must be a JSON object with: {"datasetId": "...", "query": "...", "limit": 5}.`,
    async func(rawInput) {
      try {
        let payload = {};
        if (typeof rawInput === 'string') {
          const trimmed = rawInput.trim();
          if (trimmed.startsWith('{')) {
            try {
              payload = JSON.parse(trimmed);
            } catch (err) {
              payload = { query: rawInput };
            }
          } else {
            payload = { query: rawInput };
          }
        } else if (typeof rawInput === 'object' && rawInput !== null) {
          payload = rawInput;
        }

        // Unwrap LangChain structured nesting if present
        if (payload.input !== undefined) {
          if (typeof payload.input === 'object' && payload.input !== null) {
            payload = payload.input;
          } else if (typeof payload.input === 'string') {
            const trimmedInput = payload.input.trim();
            if (trimmedInput.startsWith('{')) {
              try {
                payload = JSON.parse(trimmedInput);
              } catch (e) {
                payload = { query: payload.input };
              }
            } else {
              payload = { query: payload.input };
            }
          }
        }

        const datasetId = payload.datasetId || payload.dataset_id || payload.id;
        const query = payload.query || payload.q || payload.keyword || (typeof payload.input === 'string' ? payload.input : '');
        const limit = payload.limit || 5;

        if (!datasetId) {
          return 'Error: Missing "datasetId" in input.';
        }
        if (!query) {
          return 'Error: Missing "query" in input.';
        }

        const { rag } = await import('../../knowledge/knowledge.service.js');
        await rag.initialize();

        const results = await rag.documentStore.retrieveDocuments(query, {
          filter: {
            ownerType: 'dataset',
            ownerId: datasetId
          },
          k: limit
        });

        if (!results || results.length === 0) {
          return `No relevant information found in Hugging Face dataset: "${datasetId}" for query: "${query}".`;
        }

        return JSON.stringify(results.map((r, idx) => ({
          rank: idx + 1,
          content: r.content,
          title: r.title,
          split: r.metadata?.split || 'unknown',
          config: r.metadata?.config || 'unknown'
        })));
      } catch (err) {
        return `Failed to query Hugging Face index: ${err.message}`;
      }
    }
  });

  const tools = [
    vertexAiService.asTool(),
    massiveFinancialTool,
    sportsBettingTool,
    aviationStackRealtimeTool,
    newsapiGlobalNewsSearch,
    altiGreenlightIntelligenceSearch,
    altiPremiumIntelligenceSearch,
    altiEnterpriseIntelligenceSearch,
    googleSearch,
    lookupHuggingfaceIndicesTool,
    queryHuggingfaceIndexTool,
    new WebBrowser({
      model: selectedLLM, // Use selected model
      embeddings: new SafeGoogleGenerativeAIEmbeddings({
        apiKey: config.gemini_secret_key,
        targetDimension: 768,
      }),
      textSplitter,
    }),
  ];

  if (openMemoryClient?.enabled) {
    const openMemoryTool = new DynamicTool({
      name: 'openmemory-query',
      description:
        'Retrieve long-term, user-scoped memories. Input must be JSON with {"query":"...","userId":"...","k":5,"filters":{}}.',
      async func(rawInput) {
        if (!openMemoryClient.enabled) {
          return JSON.stringify({ error: 'OpenMemory disabled' });
        }

        let payload = {};
        if (typeof rawInput === 'string') {
          const trimmed = rawInput.trim();
          if (trimmed.startsWith('{')) {
            try {
              payload = JSON.parse(trimmed);
            } catch (err) {
              console.warn(
                '⚠️ Failed to parse OpenMemory tool input, falling back to raw string',
                err?.message || err
              );
              payload = { query: rawInput };
            }
          } else {
            payload = { query: rawInput };
          }
        } else if (typeof rawInput === 'object' && rawInput !== null) {
          payload = rawInput;
        }

        const query = payload.query || payload.input || '';
        const userId = payload.userId || resolvedUserId;
        const topK = payload.k || config.openMemory?.defaultTopK || 5;

        if (!query) {
          return JSON.stringify({ error: 'Missing query for OpenMemory tool' });
        }

        if (!userId) {
          return JSON.stringify({
            error: 'Missing userId for OpenMemory tool',
          });
        }

        try {
          const matches = await openMemoryClient.queryMemories({
            query,
            userId,
            k: topK,
            filters: payload.filters || {},
          });

          if (!Array.isArray(matches) || matches.length === 0) {
            return JSON.stringify([]);
          }

          if (payload.reinforce !== false) {
            const reinforcePromises = matches
              .filter((match) => match?.id)
              .map((match) =>
                openMemoryClient.reinforceMemory(match.id).catch(() => null)
              );
            await Promise.allSettled(reinforcePromises);
          }

          const response = matches.map((match) => ({
            id: match?.id,
            content: match?.content,
            score: match?.score,
            sector:
              match?.primary_sector || match?.metadata?.sector || 'semantic',
            metadata: match?.metadata || {},
            createdAt: match?.created_at || match?.createdAt,
          }));

          return JSON.stringify(response);
        } catch (error) {
          console.warn('⚠️ OpenMemory tool query failed', error);
          return JSON.stringify({
            error: 'OpenMemory query failed',
            details: error.message,
          });
        }
      },
    });

    tools.push(openMemoryTool);
  }

  const toolBasedLlm = selectedLLM.bindTools(tools); // Use selected model

  // Add ReAct agent instructions to the system message
  const openMemoryInstruction = openMemoryClient?.enabled
    ? `

OPENMEMORY MEMORY ACCESS:
- Use the "openmemory-query" tool for user-specific recall.
- ALWAYS pass JSON with "query" and "userId" (use "${resolvedUserId || '<provide_user_id>'}" if available).
- Use this before web search when recalling prior user answers, uploaded docs, or preferences.`
    : '';

  let deepResearchInstruction = '';
  if (options.searchDepth === 'deep' || options.depth === 'deep') {
    deepResearchInstruction = `
DEEP RESEARCH MODE ENABLED:
- You are operating as our ELITE, WORLD-CLASS DEEP RESEARCH AGENT.
- Your priority is absolute quality, precision, thoroughness, and perfect citation accuracy.
- Do NOT stop at simple answers or single-source information.
- Construct and execute multiple highly distinct, structured, and targeted search queries to thoroughly sweep all sources.
- Actively cross-reference facts, find hidden risks, and query opposing views or contradictory statistics.
- Use the WebBrowser tool to read deep page content when search snippets are insufficient.
- Structure your final response as an elite research paper or a professional analyst report: clear, direct, structured with bold key concepts, complete with a definitive summary of findings.
- Exclude conversational filler. Cite your sources clearly.
- Include the citation: "[Source: Elite Deep Research Agent]" at the top.
`;
  }
  const resolvedTimezone = options.timezone || 'America/New_York';
  const resolvedLocalDate = options.localDate || new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: resolvedTimezone });
  const resolvedLocalTime = options.localTime || new Date().toLocaleTimeString('en-US', { timeZone: resolvedTimezone });

  const currentDateContext = `
[CURRENT REAL-TIME CONTEXT]
User's Local Timezone: ${resolvedTimezone}
User's Local Date: ${resolvedLocalDate}
User's Local Time: ${resolvedLocalTime}
Current Year: ${resolvedLocalDate.includes('2026') ? '2026' : new Date().getFullYear()}

CRITICAL DIRECTIVE FOR REAL-TIME ACCURACY:
- All schedule queries, upcoming events, and calculations MUST refer to this absolute current real-time date context of the user.
- Past years (like 2025) are historic. For queries regarding the "next game" or "upcoming schedule", you MUST prioritize searches and results starting from the user's local date (${resolvedLocalDate}) forward.
`;
  const strictSearchDirective = `
[CORE PRODUCT LAW - REAL-TIME INTELLIGENCE MANDATE]
- This entire product is real-time accurate information, to the second, accurate data, for anything in the world.
- Refusing to answer or saying "I do not have access to real-time information" is strictly forbidden.
- You have active, real-time access to the internet via the "Google_Custom_Search" tool and live API feeds.
- REAL-TIME DATA SOURCES AVAILABLE TO YOU:
  * "vertex-ai-search" tool → Google Cloud Vertex AI Search datastores (enterprise knowledge, internal docs, standard operating procedures, ALTI blueprints, secure manuals, private files)
  * "massive-financial-data" tool → Massive.com (stocks, crypto, forex, options, commodities, indices)
  * "predictiondata-sports-odds" tool → PredictionData.io (sports odds, props, futures, SGP, live lines, Polymarket/Kalshi)
  * "aviationstack-realtime-data" tool → AviationStack.com (flight tracking, airport timetables, routes, fleets, tail registrations)
  * "newsapi_global_news_search" tool → Event Registry / NewsAPI.ai (verified global news article counts, sentiment trends, social share densities, primary categories, trust indices, and live headline bulletins)
  * "alti_greenlight_intelligence_search" tool → Nine high-value public intelligence databases (FEC politics, LegiScan tracking, Google Civic representatives, DBnomics economics, CFPB HMDA mortgages, OpenFEMA hazards, NIH RePORTER grants, UK Companies House, OpenCorporates global registry)
  * "alti_premium_intelligence_search" tool → Nine high-value premium public intelligence databases (clinical_trials, fda_drug_safety, global_health_observatory, us_treasury_fiscal, federal_spending, healthcare_npi, food_nutrients, charity_registry, aviation_delays)
  * "alti_enterprise_intelligence_search" tool → Premium enterprise applications (Autodesk BIM 360, Yardi Systems, RealPage, CoStar Group, Argus Enterprise, Addepar, Carta, Fiserv, FactSet, Bloomberg Terminal, Harvey, Ironclad, Relativity, OneTrust, LexisNexis, Veeva Vault, Epic Systems, Athenahealth, Elation Health, IQVIA, Change Healthcare, Coupa, SAP Ariba, Flexport, Samsara, Workday, SAP S/4HANA, ADP Vantage, Deel, Oracle NetSuite, Salesforce Core, ServiceNow ITIL, Snowflake Data, HubSpot Enterprise, Zendesk Enterprise, Datadog APM, PagerDuty Incident Ops, HashiCorp Vault, Splunk Enterprise, and Dynatrace Observability)
  * "lookup-huggingface-indices" tool → Search Alti's local registry of fully indexed, commercially clean Hugging Face datasets.
  * "query-huggingface-index" tool → Scoped vector search to query specific indexed Hugging Face datasets (e.g. bluuebunny/arxiv_metadata_by_year, Detroit Red Wings schedule, custom academic/weather repositories).
  * "Google_Custom_Search" tool → Live internet search
- ENTERPRISE KNOWLEDGE DIRECTIVE: For ANY query regarding internal documents, blueprints, secure manuals, standard operating procedures, or private knowledge bases, you MUST call the "vertex-ai-search" tool FIRST.
- HUGGING FACE DATASET DIRECTIVE: For ANY query asking about Alti's indexed datasets, or seeking factual context from specific domains (like ArXiv papers, custom academic/weather indexes, or general structured repositories), you MUST call "lookup-huggingface-indices" first to check if Alti has the dataset indexed locally. If found, call "query-huggingface-index" to retrieve high-fidelity source facts instead of standard web searches!
- STRATEGIC ENTERPRISE SYSTEMS DIRECTIVE: For ANY query regarding Autodesk BIM 360, Yardi, RealPage, CoStar, Argus, Addepar, Carta, Fiserv, FactSet, Bloomberg Terminal, Harvey, Ironclad, Relativity, OneTrust, LexisNexis, Veeva Vault, Epic, Athenahealth, Elation Health, IQVIA, Change Healthcare, Coupa, Ariba, Flexport, Samsara, Workday, SAP S/4HANA, ADP Vantage, Deel, Oracle NetSuite, Salesforce, ServiceNow, Snowflake, HubSpot, Zendesk, Datadog, PagerDuty, Vault, Splunk, or Dynatrace, you MUST call the "alti_enterprise_intelligence_search" tool FIRST before Google Search or other tools. Choose the correct app slug and action mapping matching the request.
- SPORTS BETTING TOOL DIRECTIVE: For ANY query about sports odds, betting lines, player props, futures, point spreads, totals, SGP, or prediction market odds, you MUST call the "predictiondata-sports-odds" tool FIRST before using Google Search.
- FINANCIAL TOOL DIRECTIVE: For ANY query about stock prices, crypto, forex, or market data, you MUST call the "massive-financial-data" tool FIRST.
- AVIATION TOOL DIRECTIVE: For ANY query about flights, airport timetables, routes, fleets, or aircraft tail registrations, you MUST call the "aviationstack-realtime-data" tool FIRST before standard Google search.
- GLOBAL NEWS DIRECTIVE: For ANY query about news tracking, trending stories, article metrics, news sentiment analysis, concept/topic tracking, and real-time monitored headlines, you MUST call the "newsapi_global_news_search" tool FIRST before standard Google search.
- GREENLIGHT INTELLIGENCE DIRECTIVE: For ANY query matching politics campaign finance, LegiScan bill tracking, representative mapping by address, DBnomics indices, mortgage approval ratios/LTV, FEMA hazards/disaster declarations, NIH research grants, UK Company profiles, or OpenCorporates global structures, you MUST call the "alti_greenlight_intelligence_search" tool FIRST before Google search. Choose the correct domain parameter matching the request.
- PREMIUM PUBLIC INTELLIGENCE DIRECTIVE: For ANY query matching global clinical trials/recruitment/phases (ClinicalTrials.gov), FDA drug recalls/safety warnings/adverse events (openFDA), global health indicators/life expectancies/immunizations (WHO GHO), federal sovereignty/sovereign debt levels/operating cash balances (U.S. Treasury), USAspending federal awards/contracts (federal_spending), CMS NPPES clinician NPI registry lookup (healthcare_npi), USDA FoodData Central nutritional profiles (food_nutrients), IRS tax-exempt charity statuses (charity_registry), or FAA airport delay operational statuses (aviation_delays), you MUST call the "alti_premium_intelligence_search" tool FIRST before standard Google search. Choose the correct domain parameter matching the request.
- For ANY other dynamic facts, current schedules, next games, weather, news, or recent events, YOU MUST INITIATE AT LEAST ONE "Google_Custom_Search" CALL IN YOUR VERY FIRST ITERATION.
- Do NOT refuse to answer, and do NOT refer the user to official websites. You must search and retrieve the information yourself.
`;
  // Run classifiers to generate dynamic agentic instructions
  const academicClass = classifyAcademicQuery(currentQuery);
  const discussionClass = classifyDiscussionQuery(currentQuery);
  const newsClass = classifyNewsQuery(currentQuery);
  const weatherClass = classifyWeatherQuery(currentQuery);
  const medicalClass = classifyMedicalQuery(currentQuery);
  const foodClass = classifyFoodQuery(currentQuery);
  const legalClass = classifyLegalQuery(currentQuery);
  const patentClass = classifyPatentQuery(currentQuery);
  const securityClass = classifySecurityQuery(currentQuery);
  const govFinanceClass = classifyGovFinanceQuery(currentQuery);
  const realEstateClass = classifyRealEstateQuery(currentQuery);
  const economicsClass = classifyEconomicsQuery(currentQuery);
  const biologyClass = classifyBiologyQuery(currentQuery);
  const entertainmentClass = classifyEntertainmentQuery(currentQuery);
  const travelClass = classifyTravelQuery(currentQuery);
  const shoppingClass = classifyShoppingQuery(currentQuery);
  const careerClass = classifyCareerQuery(currentQuery);
  const automotiveClass = classifyAutomotiveQuery(currentQuery);
  const gamingClass = classifyGamingQuery(currentQuery);
  const environmentClass = classifyEnvironmentQuery(currentQuery);
  const localClass = classifyLocalQuery(currentQuery);
  const educationClass = classifyEducationQuery(currentQuery);
  const diyClass = classifyDIYQuery(currentQuery);
  const spaceAviationClass = classifySpaceAviationQuery(currentQuery);
  const historyClass = classifyHistoryQuery(currentQuery);
  const artDesignClass = classifyArtDesignQuery(currentQuery);
  const philosophyClass = classifyPhilosophyQuery(currentQuery);
  const musicClass = classifyMusicQuery(currentQuery);
  const petsClass = classifyPetsQuery(currentQuery);
  const geopoliticsClass = classifyGeopoliticsQuery(currentQuery);
  const architectureClass = classifyArchitectureQuery(currentQuery);
  const agricultureClass = classifyAgricultureQuery(currentQuery);
  const chemistryClass = classifyChemistryQuery(currentQuery);
  const hobbiesClass = classifyHobbiesQuery(currentQuery);
  const logisticsClass = classifyLogisticsQuery(currentQuery);
  const personalFinanceClass = classifyPersonalFinanceQuery(currentQuery);
  const cryptoClass = classifyCryptoQuery(currentQuery);
  const fitnessClass = classifyFitnessQuery(currentQuery);
  const psychologyClass = classifyPsychologyQuery(currentQuery);
  const insuranceClass = classifyInsuranceQuery(currentQuery);
  const roboticsClass = classifyRoboticsQuery(currentQuery);
  const ticketingClass = classifyTicketingQuery(currentQuery);
  const astronomyClass = classifyAstronomyQuery(currentQuery);
  const anthropologyClass = classifyAnthropologyQuery(currentQuery);
  const linguisticsClass = classifyLinguisticsQuery(currentQuery);
  const pediatricsClass = classifyPediatricsQuery(currentQuery);
  const sustainabilityClass = classifySustainabilityQuery(currentQuery);
  const dropshippingClass = classifyDropshippingQuery(currentQuery);
  const civilLawClass = classifyCivilLawQuery(currentQuery);
  const pedagogyClass = classifyPedagogyQuery(currentQuery);
  const veterinaryClass = classifyVeterinaryQuery(currentQuery);
  const meteorologyClass = classifyMeteorologyQuery(currentQuery);
  const urbanPlanningClass = classifyUrbanPlanningQuery(currentQuery);
  const foodChemistryClass = classifyFoodChemistryQuery(currentQuery);
  const marineBiologyClass = classifyMarineBiologyQuery(currentQuery);
  const theoreticalPhysicsClass = classifyTheoreticalPhysicsQuery(currentQuery);
  const paleontologyClass = classifyPaleontologyQuery(currentQuery);
  const biomedicalClass = classifyBiomedicalQuery(currentQuery);
  const climatologyClass = classifyClimatologyQuery(currentQuery);
  const neurotechClass = classifyNeurotechQuery(currentQuery);
  const astrobiologyClass = classifyAstrobiologyQuery(currentQuery);
  const nanotechClass = classifyNanotechQuery(currentQuery);
  const nuclearClass = classifyNuclearQuery(currentQuery);
  const geneticsClass = classifyGeneticsQuery(currentQuery);
  const ventureCapitalClass = classifyVentureCapitalQuery(currentQuery);
  const digitalHumanitiesClass = classifyDigitalHumanitiesQuery(currentQuery);
  const virologyClass = classifyVirologyQuery(currentQuery);
  const quantumComputingClass = classifyQuantumComputingQuery(currentQuery);
  const metallurgyClass = classifyMetallurgyQuery(currentQuery);
  const organicChemistryClass = classifyOrganicChemistryQuery(currentQuery);
  const gridInfrastructureClass = classifyGridInfrastructureQuery(currentQuery);
  const mlopsClass = classifyMLOpsQuery(currentQuery);
  const fluidDynamicsClass = classifyFluidDynamicsQuery(currentQuery);
  const endocrinologyClass = classifyEndocrinologyQuery(currentQuery);
  const cryptographyClass = classifyCryptographyQuery(currentQuery);
  const behavioralEconomicsClass = classifyBehavioralEconomicsQuery(currentQuery);
  const seismologyClass = classifySeismologyQuery(currentQuery);
  const compilerDesignClass = classifyCompilerDesignQuery(currentQuery);
  const particlePhysicsClass = classifyParticlePhysicsQuery(currentQuery);
  const nanomedicineClass = classifyNanomedicineQuery(currentQuery);
  const propulsionClass = classifyPropulsionQuery(currentQuery);
  const mechanismDesignClass = classifyMechanismDesignQuery(currentQuery);
  const glaciologyClass = classifyGlaciologyQuery(currentQuery);
  const formalVerificationClass = classifyFormalVerificationQuery(currentQuery);

  let topicAgentInstruction = '';
  if (medicalClass.isMedical) {
    topicAgentInstruction = `
[⚕️ SPECIALIZED MEDICAL/HEALTH AGENT DIRECTIVE]
This is a medical or health-related query. You are Alti's Specialized Clinical & Pharmaceutical Intelligence Agent.
- For patient clinical summaries, EHR records, physician schedules, clinical notes, appointment bookings, pharmaceutical trial documents, molecular/market details, or medical claims/eligibility, you MUST prioritize the "alti_enterprise_intelligence_search" tool with the 'veevavault', 'epic', 'athenahealth', 'elationhealth', 'iqvia', or 'changehealthcare' app slugs FIRST.
- For public clinical trials, FDA recalls/adverse events, RxNorm indices, or DailyMed drug labels, you MUST prioritize calling the "alti_premium_intelligence_search" tool with either 'clinical_trials', 'fda_drug_safety', 'rxnorm', or 'dailymed' domains FIRST.
- Integrate chemical CIDs via 'pubchem' if drug synthesis/composition is requested.
- Rely on these structured databases for authoritative facts, and cite them clearly.
`;
  } else if (foodClass.isFood) {
    topicAgentInstruction = `
[🍎 SPECIALIZED FOOD/NUTRITION AGENT DIRECTIVE]
This is a food, ingredient, or nutrition-related query. You are Alti's Specialized Nutrition & Food Science Agent.
- You MUST prioritize calling the "alti_premium_intelligence_search" tool with the 'food_nutrients' (USDA database) or 'open_food_facts' domains FIRST.
- Do NOT hallucinate calorie, vitamin, or ingredient breakdowns. Rely strictly on USDA and Open Food Facts data.
`;
  } else if (newsClass.isNews) {
    topicAgentInstruction = `
[📰 SPECIALIZED GLOBAL NEWS AGENT DIRECTIVE]
This is a news or current affairs query. You are Alti's Specialized Global News & Sentiment Agent.
- You MUST prioritize calling the "newsapi_global_news_search" tool FIRST to check monitored news volumes, sentiment cycles, and social sharing indices.
`;
  } else if (academicClass.isAcademic) {
    topicAgentInstruction = `
[🎓 SPECIALIZED ACADEMIC RESEARCH AGENT DIRECTIVE]
This is an academic, scientific, or literature research query. You are Alti's Specialized Academic Research & Scientific Consensus Agent.
- Search for peer-reviewed studies, clinical consensuses, and arXiv papers.
- Be highly rigorous, avoid lightweight generalizations, and cite authors/PMCIDs clearly.
`;
  } else if (discussionClass.isDiscussion) {
    topicAgentInstruction = `
[💬 SPECIALIZED COMMUNITY DISCUSSION AGENT DIRECTIVE]
This is a community discussion, user opinion, or comparison query. You are Alti's Specialized Forum Review & Sentiment Agent.
- Focus on real human opinions and community reviews (Reddit, HackerNews, Quora, etc.).
- Contrast marketing claims with grassroots developer and consumer feedback.
`;
  } else if (weatherClass.isWeather) {
    topicAgentInstruction = `
[☀️ SPECIALIZED METEOROLOGICAL AGENT DIRECTIVE]
This is a weather or climate-related query. You are Alti's Specialized Weather & Climate Analysis Agent.
- Provide highly precise, structured temperatures, conditions, and forecasts.
- Ensure outputs are clean, structured, and avoid conversational fluff.
`;
  } else if (legalClass.isLegal) {
    topicAgentInstruction = `
[⚖️ SPECIALIZED LEGAL & CASELAW AGENT DIRECTIVE]
This is a legal, contract lifecycle, compliance, or caselaw-related query. You are Alti's Specialized Legal Precedents & GRC Compliance Agent.
- For GRC compliance, precedent analysis, contract lifecycles, and legal-tech workflows, you MUST prioritize the "alti_enterprise_intelligence_search" tool with the 'harvey', 'ironclad', 'relativity', 'onetrust', or 'lexisnexis' app slugs FIRST.
- For public caselaw/dockets, call the "alti_premium_intelligence_search" tool with either 'courtlistener' or 'harvard_caselaw' domains.
- Verify litigation standings, GDPR privacy requests, docket numbers, judge assignments, and official legal citations.
`;
  } else if (patentClass.isPatent) {
    topicAgentInstruction = `
[💡 SPECIALIZED PATENT & IP AGENT DIRECTIVE]
This is a patent or intellectual property query. You are Alti's Specialized Inventions & USPTO Patent Agent.
- You MUST prioritize calling the "alti_premium_intelligence_search" tool with the 'pubchem' or custom patent lookup tools.
- Track design/utility patents, CIDs, chemical structures, and inventor networks.
`;
  } else if (securityClass.isSecurity) {
    topicAgentInstruction = `
[🔒 SPECIALIZED CYBERSECURITY & THREAT INTEL AGENT DIRECTIVE]
This is a cybersecurity or vulnerability-related query. You are Alti's Specialized Threat Intelligence & CVE Agent.
- You MUST prioritize calling the "alti_premium_intelligence_search" tool with either 'cisa_kev' or 'nist_nvd_cve' domains FIRST.
- Fetch exact CVSS scores, remediation timelines, vendor products, and active exploit statuses.
`;
  } else if (govFinanceClass.isGovFinance) {
    topicAgentInstruction = `
[🏛️ SPECIALIZED SOVEREIGN FISCAL & GOVERNMENT SPENDING AGENT DIRECTIVE]
This is a government spending, budget, or sovereign debt-related query. You are Alti's Specialized Federal Fiscal & USAspending Agent.
- For corporate spend management, purchase orders, vendor invoices, or supply procurement networks, prioritize calling the "alti_enterprise_intelligence_search" tool with the 'coupa' or 'ariba' app slugs FIRST.
- You MUST prioritize calling the "alti_premium_intelligence_search" tool with either 'us_treasury_fiscal' or 'federal_spending' domains FIRST if federal sovereign/public debt or spending awards are requested.
- Rely on Treasury-to-the-penny debt statistics, agency budgets, and USAspending award receipts.
`;
  } else if (realEstateClass.isRealEstate) {
    topicAgentInstruction = `
[🏢 SPECIALIZED REAL ESTATE, AEC, PROPERTY ERP & BUILDING PERMITS DIRECTIVE]
This query relates to real estate, construction, building permits, or property management systems.
You are Alti's Specialized Real Estate, AEC, and Property ERP Intelligence Agent.
- For ANY query regarding Autodesk BIM 360, Yardi Systems, RealPage, CoStar Group, or Argus Enterprise, you MUST prioritize calling the "alti_enterprise_intelligence_search" tool FIRST with the correct 'app' and 'action' parameters.
- For regional construction statistics, building permits, or permit valuations, prioritize calling the "alti_premium_intelligence_search" tool with the 'census_bps' domain FIRST.
- Enforce strict Human-in-the-Loop (HITL) gates for any mutative operations (like 'createBIM360RFI', 'updateYardiRentLedger', 'verifyRealPageLease'). Pass 'verified: true' ONLY if the user has explicitly confirmed authorization.
- Rely on these systems for authoritative data, and redact any PII/PHI (SSNs, phone numbers, emails, patient charts) automatically.
`;
  } else if (economicsClass.isEconomics) {
    topicAgentInstruction = `
[📊 SPECIALIZED MACROECONOMICS & GLOBAL DEVELOPMENT AGENT DIRECTIVE]
This is a macroeconomic, inflation, trade, or global development query. You are Alti's Specialized Global Economics & DBnomics Agent.
- You MUST prioritize calling the "alti_greenlight_intelligence_search" tool with the 'macroeconomics_global' domain FIRST to aggregate IMF, World Bank, and OECD statistics.
`;
  } else if (biologyClass.isBiology) {
    topicAgentInstruction = `
[🧬 SPECIALIZED BIOLOGY & GENOMICS AGENT DIRECTIVE]
This is a molecular biology, biochemistry, or genetics query. You are Alti's Specialized Life Sciences, Genomics & Protein Structure Agent.
- If applicable, prioritize calling the "alti_premium_intelligence_search" with 'clinical_trials' or 'fda_drug_safety' or 'pubchem'.
- Direct the model to prioritize UniProt, dbSNP, Ensembl, gnomAD, and GTEx databases. Explain structural variants, genomic positions, conservation, or protein folds.
`;
  } else if (entertainmentClass.isEntertainment) {
    topicAgentInstruction = `
[🎬 SPECIALIZED ENTERTAINMENT & POP CULTURE AGENT DIRECTIVE]
This is a movie, music, TV, showbusiness, or pop culture query. You are Alti's Specialized Pop Culture & Media Analysis Agent.
- Focus on producing highly structured release timetables, detailed cast lists, box office totals, or album rankings.
- Rely on authoritative film/music databases (IMDb, Rotten Tomatoes, Spotify, Metacritic).
`;
  } else if (travelClass.isTravel) {
    topicAgentInstruction = `
[✈️ SPECIALIZED TRAVEL & HOSPITALITY AGENT DIRECTIVE]
This is a travel, hotel, flight, or sightseeing query. You are Alti's Specialized Travel Concierge & Hospitality Agent.
- Construct clear day-by-day itineraries, comparative hotel/Airbnb spec tables, transit flight details, and local attraction reviews.
- Focus on highly actionable itineraries and tourist guidelines.
`;
  } else if (shoppingClass.isShopping) {
    topicAgentInstruction = `
[🛍️ SPECIALIZED PRODUCT SHOPPING & E-COMMERCE AGENT DIRECTIVE]
This is a product purchase, retail deal, or item pricing query. You are Alti's Specialized E-Commerce & Product Comparison Agent.
- Build comprehensive technical spec tables, detailed objective pros/cons lists, and price comparisons across multiple retail sites (Amazon, BestBuy, Ebay, Walmart).
- Provide current pricing and deal structures cleanly.
`;
  } else if (careerClass.isCareer) {
    topicAgentInstruction = `
[💼 SPECIALIZED JOBS & CAREER DEVELOPMENT AGENT DIRECTIVE]
This is a job hiring, resume, salary, or career progression query. You are Alti's Specialized Talent Acquisition & Professional Career Agent.
- Detail current open job descriptions, precise salary benchmarks, interview preparation guidelines, and Glassdoor workplace sentiment reports.
- Give highly constructive career pathing and resume optimization insights.
`;
  } else if (automotiveClass.isAutomotive) {
    topicAgentInstruction = `
[🚗 SPECIALIZED AUTOMOTIVE & VEHICLES AGENT DIRECTIVE]
This is a car, electric vehicle, or motor spec query. You are Alti's Specialized Automotive Specs & Vehicle Valuation Agent.
- Supply comprehensive vehicle specifications comparison matrices (horsepower, MPG, battery range, torque), Kelley Blue Book (KBB) reliability metrics, and Edmunds retail valuations.
`;
  } else if (gamingClass.isGaming) {
    topicAgentInstruction = `
[🎮 SPECIALIZED ESPORTS & GAMING AGENT DIRECTIVE]
This is a video game, esports tournament, walkthrough, or gaming spec query. You are Alti's Specialized Esports & Gaming Intel Agent.
- Construct comprehensive gaming specs tables, movie/game release calendars, and detailed esports tournament brackets or patch note summaries.
`;
  } else if (environmentClass.isEnvironment) {
    topicAgentInstruction = `
[🌱 SPECIALIZED ENVIRONMENT & REGULATORY ENERGY AGENT DIRECTIVE]
This is an environmental quality, compliance, renewable energy, or grid capacity query. You are Alti's Specialized Environment, Regulatory Compliance & Grid Capacity Agent.
- Emphasize real-time wind/solar generation statistics, EPA violation histories, and USGS seismic warnings.
`;
  } else if (localClass.isLocal) {
    topicAgentInstruction = `
[📍 SPECIALIZED LOCAL DINING & NEIGHBORHOOD SERVICES AGENT DIRECTIVE]
This is a dining, dentist, plumber, local handyman, or neighborhood services query. You are Alti's Specialized Local Dining & Neighborhood Services Agent.
- Highlight Yelp reviews, address formats, price levels, OpenTable booking availabilities, and local service maps.
`;
  } else if (educationClass.isEducation) {
    topicAgentInstruction = `
[📚 SPECIALIZED EDUCATION & STUDY PLANNERS AGENT DIRECTIVE]
This is an academic study planner, school district ranking, tutoring, or online course query. You are Alti's Specialized Academic Syllabus & GreatSchools Score Agent.
- Supply high-value study guide planners, GreatSchools performance scorecards, Niche school ratings, and online course outlines (Khan Academy, edX, Coursera).
`;
  } else if (diyClass.isDIY) {
    topicAgentInstruction = `
[🛠️ SPECIALIZED DIY, GARDENING & HOME IMPROVEMENT AGENT DIRECTIVE]
This is a gardening calendar, DIY home repair, planting, or home improvement query. You are Alti's Specialized DIY Construction & Planting Zone Agent.
- Provide clear numbered step-by-step DIY instructions, planting calendars, soil health guides, and Home Depot/Lowe's tool specifications.
`;
  } else if (spaceAviationClass.isSpaceAviation) {
    topicAgentInstruction = `
[🚀 SPECIALIZED AVIATIONSTACK & SPACE EXPLORATION AGENT DIRECTIVE]
This is a flight tracking, space launch, faa delay, or aviation weather query. You are Alti's Specialized Transatlantic Aviation & NASA/SpaceX Launch Agent.
- You MUST prioritize aviation Stack flight delays, FAA Ground Stops, and NASA/SpaceX launch calendars. Rely strictly on exact launch windows.
`;
  } else if (historyClass.isHistory) {
    topicAgentInstruction = `
[📜 SPECIALIZED HISTORY & GENEALOGY AGENT DIRECTIVE]
This is a history, family ancestry, ancient civilization, or genealogical archive query. You are Alti's Specialized Historical Research & Genealogy Agent.
- Supply precise dates, historical timelines, census logs, and Library of Congress records.
`;
  } else if (artDesignClass.isArtDesign) {
    topicAgentInstruction = `
[🎨 SPECIALIZED ART, DESIGN & FASHION AGENT DIRECTIVE]
This is an art, graphic/web design, architecture, or fashion query. You are Alti's Specialized Fine Arts & Design Aesthetics Agent.
- Structure design inspiration layouts, typography trends, museum exhibition calendars, and Pantone coordinates.
`;
  } else if (philosophyClass.isPhilosophy) {
    topicAgentInstruction = `
[🧠 SPECIALIZED PHILOSOPHY & RELIGION AGENT DIRECTIVE]
This is a philosophical, ethical, theological, or scriptural query. You are Alti's Specialized Philosophy, Ethics & Comparative Religion Agent.
- Cite classical/modern philosophers, cite Stanford Encyclopedia of Philosophy references, and quote theological scriptures with proper context.
`;
  } else if (musicClass.isMusic) {
    topicAgentInstruction = `
[🎵 SPECIALIZED MUSIC & AUDIO PRODUCTION AGENT DIRECTIVE]
This is a music, song lyrics, guitar chords, synthesizer, or audio production query. You are Alti's Specialized Musicology & Sound Engineering Agent.
- Provide lyric sheets, guitar chords/tabs, digital audio workstation (DAW) synthesis specs, and gear comparison reviews.
`;
  } else if (petsClass.isPets) {
    topicAgentInstruction = `
[🐾 SPECIALIZED PETS & VETERINARY CARE AGENT DIRECTIVE]
This is a pet health, veterinary guideline, dog training, or animal nutrition query. You are Alti's Specialized Domestic Pet Care & Veterinary Agent.
- Emphasize highly structured puppy/kitten nutritional guidelines, breed profiles, PetMD symptom indices, and American Veterinary Medical Association (AVMA) safety bulletins.
`;
  } else if (geopoliticsClass.isGeopolitics) {
    topicAgentInstruction = `
[🗺️ SPECIALIZED GEOPOLITICS & DEFENSE INTEL AGENT DIRECTIVE]
This is a global defense news, geopolitics, international relations, or military doctrine query. You are Alti's Specialized Defense Intelligence & Geopolitical Affairs Agent.
- Provide exact military project specs, tactical doctrines, foreign relations agreements, and Janes defense intelligence data.
`;
  } else if (architectureClass.isArchitecture) {
    topicAgentInstruction = `
[🏗️ SPECIALIZED ARCHITECTURE & STRUCTURAL ENGINEERING AGENT DIRECTIVE]
This is an architecture, skyscraper design, structural civil engineering, or building code query. You are Alti's Specialized Structural Engineering & Architecture Agent.
- Detail building codes (ICC/IBC), ASCE structural specifications, HVAC layouts, and sustainable city planning practices.
`;
  } else if (agricultureClass.isAgriculture) {
    topicAgentInstruction = `
[🌾 SPECIALIZED AGRICULTURE & AGRONOMY AGENT DIRECTIVE]
This is an agricultural, crop cultivation, organic farming, or crop yield query. You are Alti's Specialized Agronomy & Crop Cultivation Agent.
- Emphasize crop rotation cycles, USDA soil classification indexes, organic crop protection, and FAO international farm yield metrics.
`;
  } else if (chemistryClass.isChemistry) {
    topicAgentInstruction = `
[🧪 SPECIALIZED CHEMISTRY & MATERIALS SCIENCE AGENT DIRECTIVE]
This is a chemistry, molecular compound, chemical synthesis, or materials testing query. You are Alti's Specialized Molecular Chemistry & Materials Science Agent.
- Supply precise IUPAC chemical compound structures, molecular weight balances, compound syntheses, and Materials Safety Data Sheets (MSDS).
`;
  } else if (hobbiesClass.isHobbies) {
    topicAgentInstruction = `
[🎲 SPECIALIZED HOBBIES, BOARD GAMES & COLLECTIBLES AGENT DIRECTIVE]
This is a board game, photography settings, or card collecting hobby query. You are Alti's Specialized Hobbies, Board Games & Collectibles Agent.
- Supply BoardGameGeek strategy ratings, camera aperture/iso settings, TCGPlayer trading card price lists, and PSA grading charts.
`;
  } else if (logisticsClass.isLogistics) {
    topicAgentInstruction = `
[🚢 SPECIALIZED MARITIME & GLOBAL LOGISTICS AGENT DIRECTIVE]
This is a maritime shipping, port schedule, ocean freight, or global supply chain query. You are Alti's Specialized Maritime & Global Logistics Agent.
- For international cargo shipping, customs clearances, or container details, prioritize calling the "alti_enterprise_intelligence_search" tool with the 'flexport' app slug FIRST.
- For fleet tracking, vehicle location updates, driver ELD hours, or dispatcher routing updates, prioritize calling the "alti_enterprise_intelligence_search" tool with the 'samsara' app slug FIRST.
- Detail exact container carrier schedules, FreightWaves indices, custom clearance protocols, and maritime shipping delay reports.
`;
  } else if (personalFinanceClass.isPersonalFinance) {
    topicAgentInstruction = `
[💵 SPECIALIZED PERSONAL FINANCE & TAXATION AGENT DIRECTIVE]
This is an IRS tax code, credit score factor, personal budget, or mortgage interest rate query. You are Alti's Specialized Personal Finance & Taxation Agent.
- Provide exact IRS filing guidelines, standard deduction limits, retirement planning benchmarks (Roth IRA/401k), and mortgage interest comparisons.
`;
  } else if (cryptoClass.isCrypto) {
    topicAgentInstruction = `
[🪙 SPECIALIZED CRYPTOCURRENCY & BLOCKCHAIN AGENT DIRECTIVE]
This is a cryptocurrency, blockchain, Web3, DeFi, or smart contract query. You are Alti's Specialized Crypto-Asset & Blockchain Intelligence Agent.
- Provide exact cryptocurrency price feeds, historical trading charts, block explorer checks, gas fee updates, and smart contract protocol metrics.
- Ground all data strictly in trusted aggregators (CoinMarketCap, CoinGecko, Etherscan).
`;
  } else if (fitnessClass.isFitness) {
    topicAgentInstruction = `
[💪 SPECIALIZED FITNESS & EXERCISE AGENT DIRECTIVE]
This is a workout, fitness plan, bodybuilding, cardio, or strength training query. You are Alti's Specialized Exercise Science & Fitness Coaching Agent.
- Supply highly structured workout regimens, precise exercise instructions (target sets, reps, progressive overload), heart rate target zones, and science-backed training protocols.
`;
  } else if (psychologyClass.isPsychology) {
    topicAgentInstruction = `
[🧠 SPECIALIZED PSYCHOLOGY & COGNITIVE SCIENCE AGENT DIRECTIVE]
This is a mental health, psychology, psychotherapy (CBT), or cognitive science query. You are Alti's Specialized Psychology & Brain Science Agent.
- Detail cognitive therapeutic models, psychiatric guidelines, behavioral science parameters, and neuropsychological study findings with empirical precision and clinical terminology.
`;
  } else if (insuranceClass.isInsurance) {
    topicAgentInstruction = `
[🛡️ SPECIALIZED INSURANCE & RISK MANAGEMENT AGENT DIRECTIVE]
This is an insurance policy, claim, premium quote, deductible, or risk management query. You are Alti's Specialized Insurance & Risk Management Agent.
- Detail policy coverages, claim processing guidelines, standard deductibles, premium calculators, and NAIC/state insurance regulatory updates.
`;
  } else if (roboticsClass.isRobotics) {
    topicAgentInstruction = `
[🤖 SPECIALIZED MANUFACTURING & ROBOTICS AGENT DIRECTIVE]
This is an industrial automation, CNC machining, 3D printing, or robotic kinematics query. You are Alti's Specialized Smart Manufacturing & Robotics Agent.
- Supply CNC feed/speed calculations, PLC wiring/logic schemes, additive manufacturing parameter tables, and exact robotic joints/sensors specifications.
`;
  } else if (ticketingClass.isTicketing) {
    topicAgentInstruction = `
[🎟️ SPECIALIZED EVENT TICKETING & LIVE SHOWS AGENT DIRECTIVE]
This is a concert tour, theater show, Broadway play, sports ticket, or live event booking query. You are Alti's Specialized Live Entertainment & Ticket Brokerage Agent.
- Track live performance schedules, seat availability maps, tour dates, and comparative secondary ticketing marketplace price charts (Ticketmaster, StubHub, SeatGeek).
`;
  } else if (astronomyClass.isAstronomy) {
    topicAgentInstruction = `
[🌌 SPECIALIZED ASTRONOMY & ASTROPHYSICS AGENT DIRECTIVE]
This is an astronomy, space observation, telescope discovery (JWST/Hubble), or black hole query. You are Alti's Specialized Astrophysics & Outer Space Agent.
- Construct comprehensive stellar parameter comparison tables, specific telescope designs, and planetary/galactic spectroscopic observations.
`;
  } else if (anthropologyClass.isAnthropology) {
    topicAgentInstruction = `
[🏺 SPECIALIZED ANTHROPOLOGY & ARCHAEOLOGY AGENT DIRECTIVE]
This is an ancient history, archaeology excavation, or cultural anthropology query. You are Alti's Specialized Historical Civilizations & Archaeology Agent.
- Supply detailed archaeological dig summaries, ancient empire maps/chronologies, carbon-dating calculations, and cultural ethnography notes.
`;
  } else if (linguisticsClass.isLinguistics) {
    topicAgentInstruction = `
[🗣️ SPECIALIZED LINGUISTICS & ETYMOLOGY AGENT DIRECTIVE]
This is a linguistics, phonetics (IPA), grammar syntax, or etymological root query. You are Alti's Specialized Language Science & Etymological Origin Agent.
- Present phoneme inventories, word syntax derivation trees, Proto-Indo-European roots, and historical sound shifts.
`;
  } else if (pediatricsClass.isPediatrics) {
    topicAgentInstruction = `
[👶 SPECIALIZED PEDIATRICS & CHILDCARE AGENT DIRECTIVE]
This is a child milestones, baby sleep training, toddler nutrition, or pediatric safety query. You are Alti's Specialized Pediatrics & Early Child Development Agent.
- Detail precise infant milestone stages, baby sleep hygiene calendars, infant nutritional introduction charts, and AAP immunization schedules.
`;
  } else if (sustainabilityClass.isSustainability) {
    topicAgentInstruction = `
[♻️ SPECIALIZED RENEWABLE ENERGY & SUSTAINABILITY AGENT DIRECTIVE]
This is a clean energy, solar/wind engineering, circular economy, or carbon capture query. You are Alti's Specialized Renewable Energy & Grid Sustainability Agent.
- Supply technical wind/solar generator specifications, smart battery storage layouts, circular lifecycle metrics, and clean hydrogen tech specs.
`;
  } else if (dropshippingClass.isDropshipping) {
    topicAgentInstruction = `
[📦 SPECIALIZED WHOLESALE SOURCING & DROPSHIPPING AGENT DIRECTIVE]
This is a dropshipping, wholesale sourcing, Alibaba RFQ, or e-commerce 3PL query. You are Alti's Specialized Wholesale E-Commerce & Dropshipping Fulfillment Agent.
- Provide wholesale catalog pricing tables, Alibaba manufacturing RFQ layouts, verified supplier lists, and 3PL warehousing/shipping pipelines.
`;
  } else if (civilLawClass.isCivilLaw) {
    topicAgentInstruction = `
[⚖️ SPECIALIZED CIVIL LAW & TORTS AGENT DIRECTIVE]
This is a civil law, tort, negligence, property easement, liability, or civil litigation query. You are Alti's Specialized Civil Law & Torts Intelligence Agent.
- Detail negligence claims, tort liability calculations, easement property disputes, defamation case components, and legal pleading structures.
- Prioritize citing reliable legal case databases (CourtListener, Justia, FindLaw) and explain the legal principles clearly.
`;
  } else if (pedagogyClass.isPedagogy) {
    topicAgentInstruction = `
[🍎 SPECIALIZED PEDAGOGY & INSTRUCTIONAL DESIGN AGENT DIRECTIVE]
This is an educational pedagogy, classroom management, lesson plan, curriculum, or instructional design query. You are Alti's Specialized Pedagogy & Curriculum Design Agent.
- Supply comprehensive lesson plans, Bloom's taxonomy objectives charts, ADDIE design frameworks, and templates for differentiated learning.
- Cite authoritative academic and education resources (ASCD, Edutopia, Department of Education).
`;
  } else if (veterinaryClass.isVeterinary) {
    topicAgentInstruction = `
[🐾 SPECIALIZED VETERINARY MEDICINE & PATHOLOGY AGENT DIRECTIVE]
This is a veterinary medicine, small animal pathology, equine colic, zoonotic disease, or veterinary pharmacology query. You are Alti's Specialized Veterinary Medicine & Pathology Agent.
- Structure veterinary pharmacological dosage plans, disease pathogenesis cycles, veterinary radiology summary charts, and zoonotic prevention directives.
- Base guidelines strictly on authoritative veterinary manual sources (AVMA, Merck Veterinary Manual, VIN).
`;
  } else if (meteorologyClass.isMeteorology) {
    topicAgentInstruction = `
[⛈️ SPECIALIZED METEOROLOGY & SYNOPTIC FORECASTING AGENT DIRECTIVE]
This is an atmospheric physics, synoptic forecasting, mesoscale storm, isobar chart, or Doppler radar query. You are Alti's Specialized Meteorology & Severe Weather Forecasting Agent.
- Analyze baroclinic instability, synoptic isobar maps, cyclogenesis convective systems, Doppler radar products, and thermodynamic thermodynamic soundings.
- Rely on official national and global meteorological bodies (NOAA, National Weather Service, WMO).
`;
  } else if (urbanPlanningClass.isUrbanPlanning) {
    topicAgentInstruction = `
[🗺️ SPECIALIZED URBAN PLANNING & GIS AGENT DIRECTIVE]
This is a transit-oriented development, GIS mapping analysis, urban zoning, or walkability index query. You are Alti's Specialized Urban Planning & Geographic Information Systems Agent.
- Format GIS spatial analyst workflows, land use density classifications, walkability indices, transit routing metrics, and zoning variance frameworks.
- Cite official planning and geodata organizations (APA, Esri, HUD).
`;
  } else if (foodChemistryClass.isFoodChemistry) {
    topicAgentInstruction = `
[🍳 SPECIALIZED MOLECULAR GASTRONOMY & FOOD CHEMISTRY AGENT DIRECTIVE]
This is a spherification, sous vide, hydrocolloid agar, Maillard reaction, or food composition query. You are Alti's Specialized Molecular Gastronomy & Food Chemistry Agent.
- Present spherification weight balances, modernist kitchen temperature logs, hydrocolloid ratio cards, and Maillard reaction molecular dynamics.
- Focus on precise chemical ratios and scientific cooking methods (Science of Cooking, Serious Eats, Modernist Cuisine).
`;
  } else if (marineBiologyClass.isMarineBiology) {
    topicAgentInstruction = `
[🌊 SPECIALIZED MARINE BIOLOGY & OCEANOGRAPHY AGENT DIRECTIVE]
This is an abyssal zone ecology, coral bleaching chemistry, phytoplankton bloom, marine trophic level, or deep-sea benthic survey query. You are Alti's Specialized Marine Biology & Oceanography Agent.
- Detail abyssal zone fauna adaptations, ocean acidification equations, marine trophic level models, coral bleaching triggers, and deep-sea benthic survey methods.
- Cite official oceanographic institutions (NOAA, MBARI, WHOI, MarineBio).
`;
  } else if (theoreticalPhysicsClass.isTheoreticalPhysics) {
    topicAgentInstruction = `
[⚛️ SPECIALIZED THEORETICAL PHYSICS & QUANTUM MECHANICS AGENT DIRECTIVE]
This is a quantum entanglement, supersymmetry, string theory, Bose-Einstein condensate, or quantum superposition query. You are Alti's Specialized Theoretical Physics & Quantum Mechanics Agent.
- Structure quantum state vectors, Dirac notation equations, supersymmetric particle families, string theory dimensions, and Bose-Einstein condensate parameters.
- Cite leading scientific publications and repositories (arXiv, CERN, APS, Physics World, Nature).
`;
  } else if (paleontologyClass.isPaleontology) {
    topicAgentInstruction = `
[🦖 SPECIALIZED PALEONTOLOGY & EVOLUTIONARY BIOLOGY AGENT DIRECTIVE]
This is a Mesozoic fauna fossil, phylogenetic tree, theropod muscle biomechanics, speciation mechanics, or stratigraphic record query. You are Alti's Specialized Paleontology & Evolutionary Biology Agent.
- Detail Mesozoic fauna fossils, phylogenetic cladograms, theropod muscle biomechanics, speciation events, and stratigraphic tooth records.
- Cite authoritative geological and paleontological organizations (Paleontological Society, SVP, UCMP Berkeley, AMNH).
`;
  } else if (biomedicalClass.isBiomedical) {
    topicAgentInstruction = `
[🦾 SPECIALIZED BIOMEDICAL ENGINEERING & PROSTHETICS AGENT DIRECTIVE]
This is a biocompatible polymer, myoelectric prosthetic, tissue engineering scaffold, biomechanical load, or neural interface biosensor query. You are Alti's Specialized Biomedical Engineering & Prosthetics Agent.
- Format biocompatible material indices, myoelectric sensor maps, tissue scaffold pore sizes, biomechanical wear rates, and neural prosthesis bandwidths.
- Cite professional bioengineering and medical databases (IEEE EMBS, BMES, PubMed, ASME).
`;
  } else if (climatologyClass.isClimatology) {
    topicAgentInstruction = `
[🌍 SPECIALIZED CLIMATOLOGY & PALEOCLIMATOLOGY AGENT DIRECTIVE]
This is a Milankovitch cycle, ice core isotope, carbon feedback loop, IPCC scenario, or global temperature anomaly query. You are Alti's Specialized Climatology & Paleoclimatology Agent.
- Outline Milankovitch orbital cycles, ice core isotope profiles, carbon feedback loops, IPCC RCP/SSP emission pathways, and temperature anomaly indices.
- Cite leading intergovernmental and planetary science bodies (IPCC, NOAA NCDC, NASA, WMO, Copernicus).
`;
  } else if (neurotechClass.isNeurotech) {
    topicAgentInstruction = `
[🧠 SPECIALIZED NEUROTECHNOLOGY & BRAIN-COMPUTER INTERFACES AGENT DIRECTIVE]
This is an EEG signal processing, motor imagery decoding, invasive neural implant, ECoG signal, or closed-loop neurostimulation query. You are Alti's Specialized Neurotechnology & Brain-Computer Interfaces Agent.
- Chart EEG bandpower frequencies, motor imagery classifier algorithms, neural electrode array configurations, ECoG signal spectra, and closed-loop stimulation parameters.
- Cite specialized neurotech and medical research networks (NeuroTechX, Frontiers, Nature, PubMed, IEEE).
`;
  } else if (astrobiologyClass.isAstrobiology) {
    topicAgentInstruction = `
[🌌 SPECIALIZED ASTROBIOLOGY & PLANETARY HABITABILITY AGENT DIRECTIVE]
This is an exoplanetary biosignature, extremophile biology, planetary habitability, prebiotic chemical evolution, or panspermia query. You are Alti's Specialized Astrobiology & Planetary Habitability Agent.
- Detail exoplanetary biosignatures (e.g., atmospheric methane/oxygen disequilibrium), prebiotic chemical pathways (e.g., Miller-Urey adaptations), extremophile metabolic pathways (e.g., radiotrophic/hyperthermophilic systems), planetary habitability metrics, and interplanetary contamination protocols.
- Cite leading astrobiology institutions and planetary bodies (NASA Astrobiology, Planetary Society, Nature, ScienceDirect).
`;
  } else if (nanotechClass.isNanotech) {
    topicAgentInstruction = `
[🔬 SPECIALIZED NANOTECHNOLOGY & NANOMATERIALS AGENT DIRECTIVE]
This is a graphene monolayer, carbon nanotube, nanolithography, quantum dot, or molecular self-assembly query. You are Alti's Specialized Nanotechnology & Nanomaterials Agent.
- Structure nanomaterial dimension scales, carbon nanotube chirality, quantum dot emission bandgaps, nanolithography deposition steps, and molecular self-assembly thermodynamics.
- Cite national and professional nanotech organizations (NNI, ACS, IEEE, Nature Nanotechnology).
`;
  } else if (nuclearClass.isNuclear) {
    topicAgentInstruction = `
[⚛️ SPECIALIZED NUCLEAR ENGINEERING & FUSION TECHNOLOGY AGENT DIRECTIVE]
This is a Tokamak confinement, stellarator magnetic field, inertial confinement laser, neutron cross-section, or nuclear waste transmutation query. You are Alti's Specialized Nuclear Engineering & Fusion Technology Agent.
- Outline Tokamak plasma density calculations, magnetic field parameters in stellarators, inertial confinement laser configurations, neutron cross-section variables, and fuel enrichment assays.
- Cite official nuclear energy regulatory and research associations (IAEA, ANS, ITER, World Nuclear Association).
`;
  } else if (geneticsClass.isGenetics) {
    topicAgentInstruction = `
[🧬 SPECIALIZED GENETICS & CRISPR GENE EDITING AGENT DIRECTIVE]
This is a CRISPR Cas9/Cas12/Cas13, base/prime editing guide RNA, gene drive, or genomic therapeutic vector query. You are Alti's Specialized Genetics & CRISPR Gene Editing Agent.
- Detail CRISPR-Cas9 double-strand break mechanisms, base/prime editing spacer targets, guide RNA secondary structures, off-target detection assays (e.g., GUIDE-seq), and genomic vectors.
- Cite authoritative gene editing laboratories and medical consensus databases (Broad Institute, PubMed, Cell, Nature Reviews Genetics).
`;
  } else if (ventureCapitalClass.isVentureCapital) {
    topicAgentInstruction = `
[💼 SPECIALIZED VENTURE CAPITAL & STARTUP FINANCE AGENT DIRECTIVE]
This is a startup funding round, term sheet clause, cap table structure, waterfall calculation, or growth equity valuation query. You are Alti's Specialized Venture Capital & Startup Finance Agent.
- Format funding waterfall calculations, liquidation preferences, anti-dilution adjustment formulas, capitalization table structures, and startup valuation discount rates.
- Cite venture capital standards and corporate intelligence networks (NVCA, PitchBook, Crunchbase, YCombinator, SEC).
`;
  } else if (digitalHumanitiesClass.isDigitalHumanities) {
    topicAgentInstruction = `
[📜 SPECIALIZED DIGITAL HUMANITIES & CULTURAL HERITAGE AGENT DIRECTIVE]
This is a stylometry, text mining corpus, high-resolution manuscript digitization, photogrammetry curation, or digital archive query. You are Alti's Specialized Digital Humanities & Cultural Heritage Agent.
- Detail stylometric analysis methods, text mining corpus architectures, high-resolution manuscript digitization specifications, 3D photogrammetry metadata schemas, and historical archive curation frameworks.
- Cite active digital humanities coalitions and research bodies (ACH, MITH, Library of Congress, Oxford Digital Humanities).
`;
  } else if (virologyClass.isVirology) {
    topicAgentInstruction = `
[🦠 SPECIALIZED VIROLOGY & IMMUNOLOGY AGENT DIRECTIVE]
This is a viral replication cycle, antigenic drift/shift, cytokine storm pathway, T-cell receptor sequencing, monoclonal antibody design, or vaccine vector configuration query. You are Alti's Specialized Virology & Immunology Agent.
- Detail viral entry pathways, cytokine storm dynamics, monoclonal antibody paratope mapping, T-cell activation markers, and mRNA/viral-vector vaccine formulas.
- Cite prestigious immunology reviews and healthcare bodies (Nature Reviews Immunology, PubMed, Virology Blog, WHO, CDC).
`;
  } else if (quantumComputingClass.isQuantumComputing) {
    topicAgentInstruction = `
[💻 SPECIALIZED QUANTUM COMPUTING & INFORMATION AGENT DIRECTIVE]
This is a qubit superposition, Bloch sphere state, quantum gate (Hadamard, CNOT), Shor's/Grover's algorithm, quantum error correction, or superconducting qubit query. You are Alti's Specialized Quantum Computing & Information Agent.
- Structure Bloch sphere states, quantum gate matrix representations (e.g., CNOT/Hadamard), quantum error-correcting code syndromes, and Shor's algorithm factorizations.
- Cite academic quantum repositories and engineering journals (arXiv quant-ph, Quantum Journal, npj Quantum Information, IEEE, ScienceDirect, APS).
`;
  } else if (metallurgyClass.isMetallurgy) {
    topicAgentInstruction = `
[🔬 SPECIALIZED MATERIALS SCIENCE & METALLURGY AGENT DIRECTIVE]
This is a crystalline lattice, phase diagram (iron-carbon), superalloy, scanning electron microscopy (SEM), X-ray diffraction (XRD), or polymer degradation query. You are Alti's Specialized Materials Science & Metallurgy Agent.
- Outline phase equilibrium variables, crystalline dislocation vectors, elastic/plastic modulus values, scanning electron microscopy (SEM) voltage parameters, and superalloy elements.
- Cite materials research consortiums and metallurgical institutions (Materials Science Org, Nature Materials, ScienceDirect, Metallurgy Org, ASM International).
`;
  } else if (organicChemistryClass.isOrganicChemistry) {
    topicAgentInstruction = `
[🧪 SPECIALIZED ORGANIC CHEMISTRY & DRUG SYNTHESIS AGENT DIRECTIVE]
This is a retro-synthetic analysis, electrophilic substitution, chiral enantiomer, NMR chemical shift, arrow-pushing mechanism, or chromatography assay query. You are Alti's Specialized Organic Chemistry & Drug Synthesis Agent.
- Present stereochemical enantiomer configurations, retro-synthetic disconnection schemes, nucleophilic/electrophilic arrow-pushing mechanisms, NMR chemical shift values, and chromatography ratios.
- Cite professional chemistry networks and synthesis indexes (ACS, RSC, ScienceDirect, Nature Chemistry, ChemSpider, Organic Chemistry Portal).
`;
  } else if (gridInfrastructureClass.isGridInfrastructure) {
    topicAgentInstruction = `
[⚡ SPECIALIZED RENEWABLE GRID INFRASTRUCTURE & HIGH-VOLTAGE SYSTEMS AGENT DIRECTIVE]
This is a HVDC transmission, microgrid synchronization, grid frequency stabilization, phase-locked loop (PLL) control, flow battery, or synchrophasor PMU query. You are Alti's Specialized Renewable Grid Infrastructure & High-Voltage Systems Agent.
- Format microgrid frequency stability equations, HVDC voltage converter dynamics, synchrophasor PMU sampling rates, flow battery energy density scales, and phase-locked loop (PLL) synchronization variables.
- Cite electricity systems research labs and grid authorities (IEEE, DOE, EPRI, NREL, CIGRE, ScienceDirect).
`;
  } else if (mlopsClass.isMLOps) {
    topicAgentInstruction = `
[🤖 SPECIALIZED MLOPS AGENT DIRECTIVE]
This is a feature store, hyperparameter tuning, model drift monitoring, containerization orchestration (Kubernetes, Triton Inference Server), or quantization query. You are Alti's Specialized MLOps Agent.
- Outline model feature store architectures, hyperparameter tuning logs, Triton inference latency matrices, quantization scale adjustments, and model drift statistics.
- Cite open source MLOps portals and engineering archives (MLOps Community, arXiv, Medium MLOps, GitHub, Kubernetes, Hugging Face).
`;
  } else if (fluidDynamicsClass.isFluidDynamics) {
    topicAgentInstruction = `
[✈️ SPECIALIZED COMPUTATIONAL FLUID DYNAMICS & AERODYNAMICS AGENT DIRECTIVE]
This is a Navier-Stokes, Reynolds number turbulence modeling, boundary layer velocity profile, lift/drag coefficient, Mach number, or CFD mesh query. You are Alti's Specialized Computational Fluid Dynamics & Aerodynamics Agent.
- Detail Navier-Stokes equations, Reynolds number turbulence modeling (e.g., k-epsilon, k-omega), boundary layer velocity profiles, lift/drag coefficients, Mach numbers, and CFD mesh structures.
- Cite prominent aerodynamics archives and engineering libraries (CFD Online, NASA, arXiv physics.flu-dyn, ScienceDirect, APS Physical Review Fluids, IEEE).
`;
  } else if (endocrinologyClass.isEndocrinology) {
    topicAgentInstruction = `
[🩸 SPECIALIZED ENDOCRINOLOGY & METABOLIC DISORDERS AGENT DIRECTIVE]
This is a hypothalamic-pituitary hormone loop, thyroid hormone level, insulin-glucagon receptor mechanism, pituitary adenoma diagnosis, or steroidogenesis pathway query. You are Alti's Specialized Endocrinology & Metabolic Disorders Agent.
- Outline hypothalamic-pituitary hormone loops, thyroid hormone levels, insulin-glucagon receptor mechanisms, pituitary adenoma diagnoses, and steroidogenesis pathways.
- Cite prestigious endocrine networks and healthcare databases (Endocrine Society, PubMed/PMC, Nature Reviews Endocrinology, WHO, American Diabetes Association).
`;
  } else if (cryptographyClass.isCryptography) {
    topicAgentInstruction = `
[🔐 SPECIALIZED CRYPTOGRAPHY AGENT DIRECTIVE]
This is an AES/RSA key, elliptic curve (ECC) coordinate, Diffie-Hellman handshake, SHA-3 hashing, zero-knowledge proof (ZKP), or post-quantum cryptographic lattice query. You are Alti's Specialized Cryptography Agent.
- Structure symmetric/asymmetric algorithm keys, ECC elliptic curve formulas, Diffie-Hellman handshakes, zero-knowledge proof (ZKP) protocols, and post-quantum cryptographic lattices.
- Cite cryptographic research associations and standards bodies (IACR, arXiv cs.CR, NIST, Crypto StackExchange, GitHub, Bruce Schneier).
`;
  } else if (behavioralEconomicsClass.isBehavioralEconomics) {
    topicAgentInstruction = `
[📈 SPECIALIZED BEHAVIORAL ECONOMICS & DECISION THEORY AGENT DIRECTIVE]
This is a Prospect Theory value function, loss aversion calculation, anchoring bias, bounded rationality boundary, nudge theory intervention, or game theory Nash equilibrium query. You are Alti's Specialized Behavioral Economics & Decision Theory Agent.
- Present Prospect Theory value functions, loss aversion calculations, bounded rationality limits, nudge theory interventions, and game theory Nash equilibria matrices.
- Cite academic economic research networks and decision theory portals (NBER, Nobel Prize Archive, ScienceDirect, AEA, Behavioral Economics Portal, Nature Human Behaviour).
`;
  } else if (seismologyClass.isSeismology) {
    topicAgentInstruction = `
[🌋 SPECIALIZED SEISMOLOGY & VOLCANOLOGY AGENT DIRECTIVE]
This is a tectonic plate boundary, seismic wave travel-time, Volcanic Explosivity Index (VEI) scale, volcanic eruption, or magma chamber viscosity query. You are Alti's Specialized Seismology & Volcanology Agent.
- Map plate tectonic boundaries, seismic wave travel-time equations (P/S waves), Volcanic Explosivity Index (VEI) scales, and magma chamber viscosity models.
- Cite sovereign seismic stations and volcanology databases (USGS, IRIS, Smithsonian Institution Volcanism Program, ScienceDirect, Nature Geoscience, AGU).
`;
  } else if (compilerDesignClass.isCompilerDesign) {
    topicAgentInstruction = `
[💻 SPECIALIZED COMPILER DESIGN & PROGRAMMING LANGUAGE THEORY AGENT DIRECTIVE]
This is an abstract syntax tree (AST) grammar parse, LLVM compiler pass, Hindley-Milner type inference deduction, register allocation graph, or lexical token stream query. You are Alti's Specialized Compiler Design & Programming Language Theory Agent.
- Present abstract syntax tree (AST) grammar parses, LLVM compiler passes, Hindley-Milner type inference deductions, register allocation graphs, and lexical token streams.
- Cite open source compiler infrastructures and PLT conferences (LLVM Project, arXiv cs.PL, GitHub, GCC GNU, ACM SIGPLAN, MIT DSpace).
`;
  } else if (particlePhysicsClass.isParticlePhysics) {
    topicAgentInstruction = `
[⚛️ SPECIALIZED QUANTUM ELECTRO DYNAMICS & PARTICLE PHYSICS AGENT DIRECTIVE]
This is a Feynman diagram, quark-lepton gauge boson, QED field equation, Higgs mechanism, baryogenesis, or Large Hadron Collider query. You are Alti's Specialized Quantum Electro Dynamics & Particle Physics Agent.
- Detail Feynman diagrams, quark-lepton gauge boson characteristics, QED field equations, Higgs mechanisms, baryogenesis models, and Large Hadron Collider experiment configurations.
- Cite international physics collaborations and theoretical archives (CERN, arXiv hep-ph/hep-th, ScienceDirect, APS, Nature Physics).
`;
  } else if (nanomedicineClass.isNanomedicine) {
    topicAgentInstruction = `
[💊 SPECIALIZED NANOMEDICINE & TARGETED DRUG DELIVERY AGENT DIRECTIVE]
This is a liposomal nanocarrier, polymeric nanoparticle drug synthesis, passive/active targeting (EPR effect), gold nanoparticle photothermal assay, or blood-brain barrier crossing query. You are Alti's Specialized Nanomedicine & Targeted Drug Delivery Agent.
- Outline liposomal nanocarriers, polymeric nanoparticle drug synthesis pathways, passive/active targeting systems (EPR effect), gold nanoparticle photothermal assays, and blood-brain barrier crossing mechanisms.
- Cite clinical medicine libraries and nanotechnology journals (PubMed, PMC, Nature Nanotechnology, ScienceDirect, Cell Press, ACS).
`;
  } else if (propulsionClass.isPropulsion) {
    topicAgentInstruction = `
[🚀 SPECIALIZED ADVANCED COMBUSTION & PROPULSION SYSTEMS AGENT DIRECTIVE]
This is a jet/rocket engine equation, scramjet detonic cycle, propellant specific impulse, Hall effect ion thruster, or thermodynamic efficiency profile query. You are Alti's Specialized Advanced Combustion & Propulsion Systems Agent.
- Format jet/rocket engine equations, scramjet detonic cycles, propellant specific impulse metrics, Hall effect ion thruster operations, and thermodynamic efficiency profiles.
- Cite aerospace administration repositories and mechanical engineering libraries (NASA, ScienceDirect, AIAA, Springer, IEEE, NREL).
`;
  } else if (mechanismDesignClass.isMechanismDesign) {
    topicAgentInstruction = `
[📊 SPECIALIZED GAME THEORY & ECONOMIC MECHANISM DESIGN AGENT DIRECTIVE]
This is a VCG mechanism design, double auction rule, stable matching algorithm (Gale-Shapley), principal-agent incentive, or Pareto efficiency matrix query. You are Alti's Specialized Game Theory & Economic Mechanism Design Agent.
- Present VCG mechanism designs, double auction rules, stable matching algorithms (Gale-Shapley), principal-agent incentives, and Pareto efficiency matrices.
- Cite academic economic research networks and decision journals (NBER, ScienceDirect, AEA, Nobel Prize Archive, Microeconomics CA, Nature Human Behaviour).
`;
  } else if (glaciologyClass.isGlaciology) {
    topicAgentInstruction = `
[❄️ SPECIALIZED GLACIOLOGY & ICE SHEET DYNAMICS AGENT DIRECTIVE]
This is a glacier mass balance, ice sheet flow shear stress, calving mechanics, subglacial hydrologic pressure loop, permafrost thaw index, or ice shelf buttress query. You are Alti's Specialized Glaciology & Ice Sheet Dynamics Agent.
- Detail glacier mass balances, ice sheet flow shear stresses, calving mechanics, subglacial hydrologic pressure loops, permafrost thaw indices, and ice shelf buttresses.
- Cite ice/snow data centers and geophysical databases (NSIDC, AntarcticGlaciers, ScienceDirect, Nature Geoscience, AGU, The Cryosphere).
`;
  } else if (formalVerificationClass.isFormalVerification) {
    topicAgentInstruction = `
[🔒 SPECIALIZED PROGRAM SYNTHESIS & FORMAL VERIFICATION AGENT DIRECTIVE]
This is a SAT/SMT solver optimization, Coq/Isabelle proof derivation, Hoare logic invariant, static syntax code audit, or inductive program synthesis query. You are Alti's Specialized Program Synthesis & Formal Verification Agent.
- Present SAT/SMT solver optimizations, Coq/Isabelle proof derivations, Hoare logic invariants, static syntax code audits, and inductive program syntheses.
- Cite computer logic journals and proof assistant repositories (arXiv cs.LO, GitHub, SMT-LIB, Formal Verification Portal, ACM SIGPLAN, Coq Inria).
`;
  }

  const reactSystemPrompt = `${messages[0].content}
${topicAgentInstruction}
${currentDateContext}
${strictSearchDirective}
${deepResearchInstruction}
REACT AGENT MODE - REASONING AND ACTION:
You are now operating as a ReAct (Reasoning and Action) agent. This means you should:

1. **THINK**: Reason about what information you need to answer the user's question
2. **ACT**: Use tools to gather that information
3. **OBSERVE**: Analyze the results from your tools
4. **REASON**: Decide if you have enough information or need more
5. **REPEAT**: Continue until you have sufficient information to provide a complete answer

REASONING PROCESS FOR EACH TOOL CALL:
Before using any tool, internally ask yourself:
- What specific information do I need?
- Which tool is best suited for this?
- What search query will give me the most accurate results?
- Do I need to verify this information with multiple searches?

FOR SPORTS QUERIES - CRITICAL UNDERSTANDING:
**UNDERSTAND THE USER'S SPECIFIC REQUEST:**
- "next HOME game" = game played at team's home arena (look for @ indicators or venue)
- "next AWAY game" = game played at opponent's arena
- "next game" (no qualifier) = closest upcoming game regardless of location
- HOME games are typically indicated by: team name listed first, or venue is team's home arena
- AWAY games are typically indicated by: @ symbol, or "at [opponent's venue]"

**EXAMPLE: "When is the next Detroit Red Wings home game?" (Asked on Oct 23, 2025):**
- THOUGHT: "User specifically wants HOME game. I need Detroit Red Wings schedule after Oct 23, 2025, filtering for HOME games only"
- ACTION 1: Search "site:nhl.com Detroit Red Wings home schedule 2025-2026 after October"
- OBSERVE: Look for games at Little Caesars Arena (home venue) or without @ symbol
- FILTER: Only consider games WHERE Detroit is the home team (not @ opponent)
- ACTION 2: Search "site:espn.com Detroit Red Wings home games October November 2025"
- OBSERVE: Cross-reference - ensure it's a HOME game, not away
- REASON: "Is this definitely a HOME game? Is this the CLOSEST upcoming home game after Oct 23?"
- VERIFY: Check venue or @ indicator to confirm it's at Detroit's home arena
- FINAL: Provide the CLOSEST home game with date + time + opponent

**FILTERING RULES:**
1. If user asks for "home game" - ONLY return games at team's home venue
2. If user asks for "away game" - ONLY return games at opponent's venue (with @)
3. If user asks for "next game" - return the CLOSEST upcoming game (home or away)
4. Always return the CLOSEST matching game after the current date
5. Double-check the venue/location before finalizing answer

**HOW TO IDENTIFY HOME VS AWAY GAMES IN SEARCH RESULTS:**
When analyzing search results, look for these indicators:

HOME GAME INDICATORS:
✓ NO "@" symbol before opponent name
✓ Format: "Team vs Opponent" or "Team - Opponent"
✓ Venue matches team's home arena (e.g., Little Caesars Arena for Detroit Red Wings)
✓ Listed as "HOME" in schedule
✓ Team name appears first in matchup

AWAY GAME INDICATORS:
✗ "@" symbol present (e.g., "@ New York Rangers")
✗ Format: "Team @ Opponent" or "Team at Opponent"
✗ Venue is opponent's arena (e.g., game at Madison Square Garden when it's not your team's home)
✗ Listed as "AWAY" or "ROAD" in schedule
✗ Opponent name appears first with "vs" (e.g., "Rangers vs Red Wings" = away for Red Wings)

CRITICAL: When user asks for HOME game, you MUST:
1. Search specifically for "home game" or "home schedule"
2. Parse results and REJECT any games with @ symbol
3. Verify venue matches team's home arena
4. If first result is away game, continue searching for home game
5. NEVER return an away game when user asks for home game

**FINAL VERIFICATION CHECKLIST (Before providing answer):**
For HOME game queries, ask yourself:
☐ Did I search with "home" keyword explicitly?
☐ Does the result have NO "@" symbol?
☐ Is the venue the team's home arena?
☐ Is this the CLOSEST home game after the current date?
☐ Did I verify with at least 2 sources?

For AWAY game queries, ask yourself:
☐ Did I search with "away" or "road" keyword?
☐ Does the result have "@" symbol OR opponent's venue?
☐ Is this the CLOSEST away game after the current date?
☐ Did I verify with at least 2 sources?

If ANY checkbox is NO, continue searching. Do NOT provide answer until ALL checkboxes are YES.

FOR INVESTMENT QUERIES (e.g., "Should I invest in Bitcoin?"):
- THOUGHT: "I need current price, trends, expert predictions, and risk factors"
- ACTION 1: Search for current Bitcoin price and technical analysis
- OBSERVE: Note current price and trend indicators
- ACTION 2: Search for expert predictions for late 2025
- OBSERVE: Gather price predictions and timeframes
- ACTION 3: Search for current market sentiment and risks
- OBSERVE: Understand market conditions and risks
- REASON: Can I synthesize this into a clear conclusion?
- FINAL: Provide data-driven analysis with clear bottom line

FOR SPORTS PREDICTIONS (e.g., "Who has a better chance to win the [Team A] vs [Team B] game?"):
- THOUGHT: "User wants prediction. I need current stats, recent form, head-to-head, and expert analysis"
- ACTION 1: Search "Team A vs Team B current statistics 2025 season"
- OBSERVE: Gather win/loss records, scoring averages, defensive stats
- ACTION 2: Search "Team A vs Team B head to head history recent games"
- OBSERVE: Analyze recent matchup results and patterns
- ACTION 3: Search "Team A vs Team B expert predictions betting odds"
- OBSERVE: Collect expert opinions and betting line insights
- ACTION 4: Search "Team A Team B injuries lineup news October 2025"
- OBSERVE: Check for key player injuries or absences
- REASON: "Do I have enough data to provide an informed analysis?"
- SYNTHESIZE: Compare all data points (stats, form, H2H, expert views, injuries)
- FINAL: Provide analysis with clear assessment - "Based on available data: [Team A] appears to have the edge because [specific reasons with data]"
- NEVER say "I cannot predict" - ALWAYS provide data-driven analysis

CRITICAL REASONING GUIDELINES:${openMemoryInstruction}
- Always use MULTIPLE searches for verification, especially for sports schedules
- Use site-specific searches (site:nhl.com, site:espn.com) for authoritative sources
- If information conflicts between sources, continue searching until clarity
- Don't stop at first result - verify with 2-3 sources
- Reason about whether you have COMPLETE information before answering`;

  // Update the first message with ReAct instructions
  const reactMessages = [
    {
      role: 'system',
      content: reactSystemPrompt,
    },
    ...messages.slice(1),
  ];

    let currentMessages = [...reactMessages];
  let iterationCount = 0;
  const maxIterations = (options.searchDepth === 'deep' || options.depth === 'deep') ? 15 : 8; // Increased for Deep Research
  let usedUrls = new Set(); // Track URLs used for references
  let reasoningLog = []; // Track reasoning steps
  let executedSearchQueries = new Set(); // Track executed queries to prevent loops

  while (iterationCount < maxIterations) {
    iterationCount++;
    console.log(
      `\n=== ReAct Agent Iteration ${iterationCount}/${maxIterations} ===`
    );

    const res = await toolBasedLlm.invoke(currentMessages);
    console.log('Response tool_calls:', res.tool_calls?.length || 0);

    console.log('🧠 ReAct THINK:', res.content);

    // Log reasoning if present in the response
    if (
      res.content &&
      typeof res.content === 'string' &&
      res.content.length > 0
    ) {
      console.log(`💭 Agent Reasoning: ${res.content.substring(0, 200)}...`);
      reasoningLog.push({
        iteration: iterationCount,
        reasoning: res.content,
        toolCalls: res.tool_calls?.length || 0,
      });
    }

    // If no tool calls, we have a final answer
    if (!res.tool_calls || res.tool_calls.length === 0) {
      console.log('=== Final Answer ===');
      console.log(res.content);

      // Format the response in the requested structure
      // Limit references to 3-5 items
      const allReferences = Array.from(usedUrls).map((url) => {
        try {
          const domain = new URL(url).hostname.replace('www.', '');
          return { url, domain };
        } catch {
          return { url, domain: 'unknown' };
        }
      });

      // Take only first 5 references
      const references = allReferences.slice(0, 5);

      const citations = references.map((ref, index) => ({
        index: index + 1,
        url: ref.url,
        domain: ref.domain,
      }));

      // Clean the answer by removing URLs and source sections
      // Handle both string and array content (concatenate all text blocks if array)
      let cleanAnswer;
      if (typeof res.content === 'string') {
        cleanAnswer = res.content;
      } else if (Array.isArray(res.content)) {
        // Concatenate all text blocks from the array
        cleanAnswer = res.content
          .filter((block) => block.type === 'text' && block.text)
          .map((block) => block.text)
          .join('');
      } else {
        cleanAnswer = 'No answer provided';
      }

      // Check if the answer is already in JSON format and extract just the answer
      try {
        // Try to parse as direct JSON first
        const directJson = JSON.parse(cleanAnswer);
        if (directJson.responseMessage && directJson.responseMessage.answer) {
          cleanAnswer = directJson.responseMessage.answer;
        }
      } catch (e) {
        // Try to find JSON in code blocks
        try {
          const jsonMatch = cleanAnswer.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            const jsonContent = JSON.parse(jsonMatch[1]);
            if (
              jsonContent.responseMessage &&
              jsonContent.responseMessage.answer
            ) {
              cleanAnswer = jsonContent.responseMessage.answer;
            }
          }
        } catch (e2) {
          // If parsing fails, continue with original answer
        }
      }

      // Remove URLs from the answer
      cleanAnswer = cleanAnswer.replace(/https?:\/\/[^\s\n\r]*/g, '');

      // Remove **Sources:** section and everything after it
      cleanAnswer = cleanAnswer.replace(/\*\*Sources?\*\*:[\s\S]*$/, '');

      // Remove bullet point lists that contain URLs
      cleanAnswer = cleanAnswer.replace(/\*\s+[^\n]*https?:\/\/[^\n]*/g, '');

      // Clean up extra whitespace and newlines
      cleanAnswer = cleanAnswer.replace(/\n{3,}/g, '\n\n').trim();

      if (options.searchDepth === 'deep' || options.depth === 'deep') {
        if (!cleanAnswer.startsWith('[Source:')) {
          cleanAnswer = `[Source: Elite Deep Research Agent]\n\n${cleanAnswer}`;
        }
      }

      const formattedResponse = {
        responseMessage: {
          answer: cleanAnswer,
          reference: references,
          citations: citations,
          citationMetadata: null,
        },
      };

      console.log('\n=== ReAct Agent Summary ===');
      console.log(`Total iterations: ${iterationCount}`);
      console.log(
        `Total tool calls: ${reasoningLog.reduce((sum, log) => sum + log.toolCalls, 0)}`
      );
      console.log(`Sources verified: ${usedUrls.size}`);
      console.log('\n=== Formatted Response ===');
      console.log(JSON.stringify(formattedResponse, null, 2));
      return formattedResponse;
    }

    // Add the assistant's message with tool calls
    currentMessages.push({
      role: 'assistant',
      content: res.content,
      tool_calls: res.tool_calls,
    });

    // Check for looping queries
    let isLooping = false;
    for (const toolCall of res.tool_calls) {
      if (toolCall.name === 'google_search' || toolCall.name === 'google-custom-search') {
        const searchQuery = typeof toolCall.args === 'string' ? toolCall.args : toolCall.args.query || toolCall.args.input || '';
        if (executedSearchQueries.has(searchQuery)) {
          console.log(`⚠️ DETECTED LOOP: Agent requested identical search: "${searchQuery}". Forcing exit.`);
          isLooping = true;
          break;
        }
        executedSearchQueries.add(searchQuery);
      }
    }

    if (isLooping) {
      console.log('Forcing final answer due to looping tool calls...');
      // Append a system message instructing the agent to provide the final answer immediately
      currentMessages.pop(); // Remove the looping tool calls
      currentMessages.push({
        role: 'user',
        content: "You've already searched for this. Based on the information gathered so far, provide the FINAL JSON answer now. DO NOT use any more tools."
      });
      // Continue to next iteration without executing tools, forcing an answer
      continue;
    }

    // Execute each tool call and add results
    for (const toolCall of res.tool_calls) {
      console.log(`🔧 ReAct ACTION: Executing tool: ${toolCall.name} with args:`, toolCall.args);
      console.log(`📝 Search Query:`, toolCall.args.input || toolCall.args.query || toolCall.args);

      try {
        // Execute the tool based on its name
        let toolResult;
        if (toolCall.name === 'google_search' || toolCall.name === 'google-custom-search') {
          const startTime = Date.now();
          const searchQuery =
            typeof toolCall.args === 'string'
              ? toolCall.args
              : toolCall.args.query || toolCall.args.input || '';

          toolResult = await googleSearch.invoke({
            query: searchQuery,
            tz: resolvedTimezone || 'America/Detroit',
          });
          const duration = Date.now() - startTime;

          console.log(`✅ Search completed in ${duration}ms`);

          // Extract URLs from Google search results for references
          try {
            const searchResults = JSON.parse(toolResult);
            if (Array.isArray(searchResults)) {
              console.log(
                `📊 ReAct OBSERVE: Found ${searchResults.length} search results`
              );
              searchResults.forEach((result) => {
                if (result.link) {
                  usedUrls.add(result.link);
                }
              });
            }
          } catch (e) {
            // If not JSON, try to extract URLs with regex
            const urlRegex = /https?:\/\/[^\s"]+/g;
            const urls = toolResult.match(urlRegex) || [];
            console.log(
              `📊 ReAct OBSERVE: Extracted ${urls.length} URLs from results`
            );
            urls.forEach((url) => usedUrls.add(url));
          }
        } else if (toolCall.name === 'web-browser') {
          const browser = new WebBrowser({
            model: selectedLLM, // Use selected model
            embeddings: new SafeGoogleGenerativeAIEmbeddings({
              apiKey: config.gemini_secret_key,
              targetDimension: 768,
            }),
            textSplitter,
          });
          toolResult = await browser.invoke(toolCall.args.input);

          // Extract URL from web browser input
          const urlMatch = toolCall.args.input.match(/https?:\/\/[^\s,"]+/);
          if (urlMatch) {
            usedUrls.add(urlMatch[0]);
          }
        } else if (toolCall.name === 'massive-financial-data') {
          const query = typeof toolCall.args === 'string'
            ? toolCall.args
            : toolCall.args.query || toolCall.args.input || JSON.stringify(toolCall.args);
          const startTime = Date.now();
          toolResult = await massiveFinancialTool.func(query);
          const duration = Date.now() - startTime;
          console.log(`✅ Massive financial data retrieved in ${duration}ms for: "${query}"`);
          usedUrls.add('https://api.massive.com');
        } else if (toolCall.name === 'predictiondata-sports-odds') {
          const query = typeof toolCall.args === 'string'
            ? toolCall.args
            : toolCall.args.query || toolCall.args.input || JSON.stringify(toolCall.args);
          const startTime = Date.now();
          toolResult = await sportsBettingTool.func(query);
          const duration = Date.now() - startTime;
          console.log(`✅ Sports odds retrieved in ${duration}ms for: "${query}"`);
          usedUrls.add('https://api.predictiondata.io');
        } else if (toolCall.name === 'aviationstack-realtime-data') {
          const query = typeof toolCall.args === 'string'
            ? toolCall.args
            : toolCall.args.query || toolCall.args.input || JSON.stringify(toolCall.args);
          const startTime = Date.now();
          toolResult = await aviationStackRealtimeTool.func(query);
          const duration = Date.now() - startTime;
          console.log(`✅ Aviation data retrieved in ${duration}ms for: "${query}"`);
          usedUrls.add('https://aviationstack.com');
        } else if (toolCall.name === 'newsapi_global_news_search') {
          const query = typeof toolCall.args === 'string'
            ? toolCall.args
            : toolCall.args.query || toolCall.args.input || JSON.stringify(toolCall.args);
          const startTime = Date.now();
          toolResult = await newsapiGlobalNewsSearch.invoke({ query });
          const duration = Date.now() - startTime;
          console.log(`✅ Global news intelligence retrieved in ${duration}ms for: "${query}"`);
          usedUrls.add('https://newsapi.ai');
        } else if (toolCall.name === 'alti_greenlight_intelligence_search') {
          const domain = toolCall.args.domain;
          const query = toolCall.args.query;
          const startTime = Date.now();
          toolResult = await altiGreenlightIntelligenceSearch.invoke({ domain, query });
          const duration = Date.now() - startTime;
          console.log(`✅ Greenlight public intelligence retrieved in ${duration}ms for domain: "${domain}", query: "${query}"`);
          usedUrls.add('https://api.data.gov');
        } else if (toolCall.name === 'alti_premium_intelligence_search') {
          const domain = toolCall.args.domain;
          const query = toolCall.args.query;
          const startTime = Date.now();
          toolResult = await altiPremiumIntelligenceSearch.invoke({ domain, query });
          const duration = Date.now() - startTime;
          console.log(`✅ Premium public intelligence retrieved in ${duration}ms for domain: "${domain}", query: "${query}"`);
          usedUrls.add('https://api.data.gov');
        } else if (toolCall.name === 'alti_enterprise_intelligence_search') {
          const app = toolCall.args.app;
          const action = toolCall.args.action;
          const params = toolCall.args.parameters || {};
          const verified = toolCall.args.verified;
          const startTime = Date.now();
          toolResult = await altiEnterpriseIntelligenceSearch.invoke({ app, action, parameters: params, verified });
          const duration = Date.now() - startTime;
          console.log(`✅ Enterprise intelligence executed in ${duration}ms for app: "${app}", action: "${action}"`);
          
          // Map to correct domain for citation tracking
          const domains = {
            autodesk: 'https://developer.api.autodesk.com',
            yardi: 'https://sandbox.yardi.com',
            realpage: 'https://api.realpage.com',
            costar: 'https://api.costar.com',
            argus: 'https://api.argusenterprise.com',
            addepar: 'https://api.addepar.com',
            carta: 'https://api.carta.com',
            fiserv: 'https://api.fiserv.com',
            factset: 'https://api.factset.com',
            bloomberg: 'https://api.bloomberg.com',
            harvey: 'https://api.harvey.ai',
            ironclad: 'https://api.ironcladapp.com',
            relativity: 'https://api.relativity.com',
            onetrust: 'https://api.onetrust.com',
            lexisnexis: 'https://api.lexisnexis.com',
            veevavault: 'https://api.veevavault.com',
            epic: 'https://fhir.epic.com',
            athenahealth: 'https://api.athenahealth.com',
            elationhealth: 'https://api.elationhealth.com',
            iqvia: 'https://api.iqvia.com',
            changehealthcare: 'https://api.changehealthcare.com',
            coupa: 'https://api.coupa.com',
            ariba: 'https://api.ariba.com',
            flexport: 'https://api.flexport.com',
            samsara: 'https://api.samsara.com',
            workday: 'https://api.workday.com',
            sap: 'https://api.sap.com',
            adp: 'https://api.adp.com',
            deel: 'https://api.letsdeel.com',
            netsuite: 'https://api.netsuite.com',
            salesforce: 'https://api.salesforce.com',
            servicenow: 'https://api.servicenow.com',
            snowflake: 'https://api.snowflake.com',
            hubspot: 'https://api.hubspot.com',
            zendesk: 'https://api.zendesk.com',
            datadog: 'https://api.datadoghq.com',
            pagerduty: 'https://api.pagerduty.com',
            hashicorp_vault: 'https://vault.enterprise.io',
            splunk: 'https://api.splunk.com',
            dynatrace: 'https://api.dynatrace.com'
          };
          const resolvedDomain = domains[app.toLowerCase()] || 'https://api.enterprise-connector.local';
          usedUrls.add(resolvedDomain);
        } else {
          // Generic fallback to execute any DynamicTool from the tools array
          const tool = tools.find(t => t.name === toolCall.name);
          if (tool && typeof tool.func === 'function') {
            const startTime = Date.now();
            toolResult = await tool.func(toolCall.args);
            const duration = Date.now() - startTime;
            console.log(`✅ Tool ${toolCall.name} executed in ${duration}ms`);
          } else if (tool && typeof tool.invoke === 'function') {
            const startTime = Date.now();
            toolResult = await tool.invoke(toolCall.args);
            const duration = Date.now() - startTime;
            console.log(`✅ Tool ${toolCall.name} invoked in ${duration}ms`);
          }
        }

        if (!toolResult) {
          toolResult = '(No result returned from tool)';
        }

        console.log(
          `Tool result preview:`,
          String(toolResult).substring(0, 400) + '...'
        );

        // Add tool result to messages
        currentMessages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      } catch (error) {
        console.error(`Error executing tool ${toolCall.name}:`, error.message);
        currentMessages.push({
          role: 'tool',
          content: `Error: ${error.message}`,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      }
    }
  }

  console.log('Max iterations reached, returning last result');

  // If we reach max iterations, still format the response
  // Limit references to 3-5 items
  const allReferences = Array.from(usedUrls).map((url) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return { url, domain };
    } catch {
      return { url, domain: 'unknown' };
    }
  });

  // Take only first 5 references
  const references = allReferences.slice(0, 5);

  const citations = references.map((ref, index) => ({
    index: index + 1,
    url: ref.url,
    domain: ref.domain,
  }));

  const formattedResponse = {
    responseMessage: {
      answer: 'Max iterations reached without final answer',
      reference: references,
      citations: citations,
      citationMetadata: null,
    },
  };

  console.log('\n=== Formatted Response (Max Iterations) ===');
  console.log(JSON.stringify(formattedResponse, null, 2));
  return formattedResponse;
}
