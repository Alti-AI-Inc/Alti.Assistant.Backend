import { SWARM_REGISTRY } from './swarm.registry.js';

/**
 * Synapse Routing Orchestrator
 * Performs fast, multi-tier intent matching and dynamic execution chain assembly.
 */
export class SynapseRouter {
  /**
   * Identifies and ranks micro-agents that best match the query context.
   * @param {string} query - Raw user query
   * @returns {Array<Object>} Sorted list of recruited micro-agent profiles
   */
  static routeQuery(query) {
    // HARD LAW: This platform is a clean, direct chatbot and search engine like ChatGPT/Perplexity.
    // It is strictly forbidden from recruiting technical/code agents, and must NEVER generate code output.
    if (!query || typeof query !== 'string') {
      return [SWARM_REGISTRY.general_chat_assistant];
    }

    const lowerQuery = query.toLowerCase();
    
    // Check for translation, summarization, brainstorming, real-time search, data processing, or intelligence intents
    const isTranslation = ['translate', 'spanish', 'french', 'german', 'chinese', 'japanese', 'language', 'traduccion'].some(kw => lowerQuery.includes(kw));
    const isSummary = ['summarize', 'summary', 'tldr', 'executive summary', 'brief', 'shorten', 'outline'].some(kw => lowerQuery.includes(kw));
    const isBrainstorm = ['brainstorm', 'ideas', 'suggest', 'suggestions', 'innovate'].some(kw => lowerQuery.includes(kw));
    
    // Granular specialized Search checks
    const isLiveIntel = ['breaking news', 'latest events today', 'live update', 'global news feed', 'current world event', 'ongoing situation', 'news alert', 'crisis update', 'press conference summary'].some(kw => lowerQuery.includes(kw));
    const isAcademicMeta = ['meta analysis', 'literature review', 'clinical trials database', 'scientific study synthesis', 'pubmed meta analysis', 'cochrane library'].some(kw => lowerQuery.includes(kw));
    const isAcademicSearch = ['doi', 'academic paper', 'arxiv', 'pubmed', 'biorxiv', 'medrxiv', 'scholarly', 'citation'].some(kw => lowerQuery.includes(kw));
    const isRealtimeSearch = ['search', 'lookup', 'latest news', 'current price', 'weather', 'sports schedule', 'game score', 'who won', 'what is the current status of', 'happenings', 'real-time', 'realtime'].some(kw => lowerQuery.includes(kw));
    
    // Granular specialized Domain Research checks
    const isPatentIntel = ['patent search', 'prior art', 'patent claims', 'uspto', 'patent application', 'wipo search', 'epo filing', 'infringement risk', 'patent classification'].some(kw => lowerQuery.includes(kw));
    const isFinancialSec = ['sec filing search', '10-k', '10-q', 'corporate disclosure audit', 'earnings call transcript', 'sec edgar', 'balance sheet audit', 'risk factor warnings'].some(kw => lowerQuery.includes(kw));
    const isLegalRegulatory = ['case law search', 'court docket review', 'federal registry update', 'statutory code', 'cfr lookup', 'supreme court holding', 'legal brief compilation', 'compliance mandate'].some(kw => lowerQuery.includes(kw));

    // Granular specialized Data checks
    const isSchemaMapping = ['ddl', 'schema design', 'entity relationship', 'table schema', 'database model', 'sql schema', 'database partition', 'erd diagram'].some(kw => lowerQuery.includes(kw));
    const isPayloadTransform = ['clean data', 'sanitize payload', 'flatten json', 'parse csv', 'null handling', 'type coercion', 'normalize datetime', 'data scrubber', 'bad json'].some(kw => lowerQuery.includes(kw));
    const isDataProcessing = ['process', 'json', 'csv', 'xml', 'database', 'format', 'convert', 'nested data', 'dataset', 'parser'].some(kw => lowerQuery.includes(kw));
    
    // Granular specialized Intelligence checks
    const isArchitecturalReasoning = ['multi region', 'latency budget', 'fault tolerance', 'high availability', 'scaling blueprint', 'datacenter topology', 'disaster recovery', 'vpc design'].some(kw => lowerQuery.includes(kw));
    const isMathLogicProof = ['logic proof', 'formal logic', 'symbolic proof', 'theorem proving', 'time complexity proof', 'big o induction', 'combinatorics', 'discrete math', 'propositional logic', 'boolean algebra'].some(kw => lowerQuery.includes(kw));
    const isIntelligence = ['think', 'reason', 'logic', 'proof', 'strategy', 'plan', 'critique', 'cognitive', 'deep reasoning', 'analysis'].some(kw => lowerQuery.includes(kw));

    // ═══════════════════════════════════════════════════════════════════════════
    // MASSIVE.COM FINANCIAL INTELLIGENCE ROUTING — 20 SPECIALIST AGENTS
    // Priority order: most-specific intent first, broadest last.
    // ═══════════════════════════════════════════════════════════════════════════

    // ── Tier 1: Hyper-specific derivatives & events ────────────────────────────
    const isRiskArb = ['merger', 'acquisition', 'merger arbitrage', 'deal spread', 'takeover', 'buyout',
      'special situation', 'spinoff', 'activist investor', 'tender offer', 'ma deal',
      'acquisition premium', 'deal closing', 'corporate action', 'catalyst trade'].some(kw => lowerQuery.includes(kw));
    if (isRiskArb && SWARM_REGISTRY.massive_risk_arbitrageur) {
      return [SWARM_REGISTRY.massive_risk_arbitrageur];
    }

    const isShortSqueeze = ['short squeeze', 'short interest', 'days to cover', 'short ratio', 'high short interest',
      'short float', 'heavily shorted', 'most shorted', 'squeeze candidate', 'short covering',
      'gamma squeeze', 'meme stock'].some(kw => lowerQuery.includes(kw));
    if (isShortSqueeze && SWARM_REGISTRY.massive_short_squeeze_scanner) {
      return [SWARM_REGISTRY.massive_short_squeeze_scanner];
    }

    const isIPO = ['ipo', 'initial public offering', 'ipo calendar', 'upcoming ipo', 'ipo listing',
      'new stock listing', 'lock up expiry', 'ipo valuation', 'ipo pop', 'spac', 'direct listing',
      'ipo investing', 'ipo date', 'ipo price'].some(kw => lowerQuery.includes(kw));
    if (isIPO && SWARM_REGISTRY.massive_ipo_analyst) {
      return [SWARM_REGISTRY.massive_ipo_analyst];
    }

    const isOptions = ['option', 'call option', 'put option', 'options chain', 'options strategy',
      'implied volatility', 'delta', 'gamma', 'theta', 'vega', 'iron condor', 'covered call',
      'straddle', 'strangle', 'options expir', 'options flow', 'open interest'].some(kw => lowerQuery.includes(kw));
    if (isOptions && SWARM_REGISTRY.massive_options_strategist) {
      return [SWARM_REGISTRY.massive_options_strategist];
    }

    // ── Tier 2: Fundamental & valuation specialists ────────────────────────────
    const isFundamentals = ['income statement', 'balance sheet', 'cash flow', 'free cash flow',
      'gross profit', 'operating margin', 'net income margin', 'financial statements',
      'revenue breakdown', 'quarterly financials', 'annual report financials'].some(kw => lowerQuery.includes(kw));
    if (isFundamentals && SWARM_REGISTRY.massive_fundamentals_audit) {
      return [SWARM_REGISTRY.massive_fundamentals_audit];
    }

    const isValueInvesting = ['intrinsic value', 'margin of safety', 'buffett', 'graham', 'undervalued',
      'value investing', 'value stock', 'economic moat', 'book value', 'price to book',
      'owner earnings', 'value opportunity'].some(kw => lowerQuery.includes(kw));
    if (isValueInvesting && SWARM_REGISTRY.massive_value_investor) {
      return [SWARM_REGISTRY.massive_value_investor];
    }

    const isGrowthInvesting = ['growth stock', 'hypergrowth', 'rule of 40', 'saas stock', 'net retention',
      'total addressable market', 'garp', 'revenue acceleration', 'growth investing',
      'high growth company', 'revenue growth rate'].some(kw => lowerQuery.includes(kw));
    if (isGrowthInvesting && SWARM_REGISTRY.massive_growth_investor) {
      return [SWARM_REGISTRY.massive_growth_investor];
    }

    const isEarnings = ['earnings report', 'earnings results', 'eps beat', 'revenue beat', 'earnings miss',
      'quarterly results', 'guidance raised', 'guidance cut', 'earnings season', 'earnings call',
      'earnings surprise', 'profit results', 'quarterly earnings', 'annual earnings'].some(kw => lowerQuery.includes(kw));
    if (isEarnings && SWARM_REGISTRY.massive_earnings_specialist) {
      return [SWARM_REGISTRY.massive_earnings_specialist];
    }

    const isDividend = ['dividend yield', 'dividend payment', 'ex dividend', 'payout ratio',
      'drip', 'passive income investing', 'dividend growth', 'dividend aristocrat', 'dividend king',
      'dividend safety', 'annual dividend', 'quarterly dividend', 'dividend income'].some(kw => lowerQuery.includes(kw));
    if (isDividend && SWARM_REGISTRY.massive_dividend_income_planner) {
      return [SWARM_REGISTRY.massive_dividend_income_planner];
    }

    // ── Tier 3: Technical & momentum specialists ───────────────────────────────
    const isTechnical = ['rsi', 'macd', 'ema', 'sma', 'moving average', 'golden cross', 'death cross',
      'overbought', 'oversold', 'support resistance', 'technical analysis', 'chart pattern',
      'bollinger', 'fibonacci', 'trend analysis', 'price action', 'technical indicator'].some(kw => lowerQuery.includes(kw));
    if (isTechnical && SWARM_REGISTRY.massive_technical_chartist) {
      return [SWARM_REGISTRY.massive_technical_chartist];
    }

    const isMomentum = ['momentum stock', 'momentum trading', 'relative strength', 'trend following',
      '52 week high', 'momentum strategy', 'rs rank', 'market leaders', 'price momentum',
      'breakout stock', 'leading stocks', 'momentum factor'].some(kw => lowerQuery.includes(kw));
    if (isMomentum && SWARM_REGISTRY.massive_momentum_trader) {
      return [SWARM_REGISTRY.massive_momentum_trader];
    }

    // ── Tier 4: Market-wide and macro specialists ──────────────────────────────
    const isMacro = ['inflation', 'cpi report', 'federal reserve', 'fed policy', 'treasury yields',
      'yield curve', 'recession', 'interest rates', 'labor market', 'unemployment rate',
      'gdp growth', 'macro outlook', 'fed meeting', 'rate hike', 'rate cut', 'monetary policy'].some(kw => lowerQuery.includes(kw));
    if (isMacro && SWARM_REGISTRY.massive_macro_economist) {
      return [SWARM_REGISTRY.massive_macro_economist];
    }

    const isSectorRotation = ['sector rotation', 'sector performance', 'best sector', 'sector etf',
      'xlk', 'xlf', 'xlv', 'xle', 'xly', 'xli', 'xlp', 'sector analysis', 'sector outlook',
      'cyclical stocks', 'defensive stocks', 'sector investing', 'business cycle'].some(kw => lowerQuery.includes(kw));
    if (isSectorRotation && SWARM_REGISTRY.massive_sector_rotation_advisor) {
      return [SWARM_REGISTRY.massive_sector_rotation_advisor];
    }

    const isMarketSentiment = ['market overview', 'market sentiment', 'vix', 'fear greed',
      'market breadth', 'stock market today', 'market health', 'risk on risk off',
      'bull market', 'bear market', 'market conditions', 'market dashboard',
      'what is the market doing', 'market outlook today', 'overall market'].some(kw => lowerQuery.includes(kw));
    if (isMarketSentiment && SWARM_REGISTRY.massive_market_sentinel) {
      return [SWARM_REGISTRY.massive_market_sentinel];
    }

    // ── Tier 5: Asset-class specialists ───────────────────────────────────────
    const isCrypto = ['bitcoin', 'ethereum', 'btc', 'eth', 'solana', 'crypto', 'cryptocurrency',
      'altcoin', 'defi', 'nft', 'binance', 'coinbase', 'blockchain', 'crypto market',
      'web3', 'dogecoin', 'xrp', 'cardano', 'avalanche', 'polygon'].some(kw => lowerQuery.includes(kw));
    if (isCrypto && SWARM_REGISTRY.massive_crypto_analyst) {
      return [SWARM_REGISTRY.massive_crypto_analyst];
    }

    const isForex = ['forex', 'currency pair', 'exchange rate', 'eurusd', 'gbpusd', 'usdjpy',
      'usdchf', 'audusd', 'usdcad', 'fx market', 'currency forecast', 'central bank',
      'dollar strength', 'dollar weakness', 'carry trade', 'currency conversion',
      'convert usd', 'convert eur', 'how much is', 'in usd', 'in euros'].some(kw => lowerQuery.includes(kw));
    if (isForex && SWARM_REGISTRY.massive_forex_trader) {
      return [SWARM_REGISTRY.massive_forex_trader];
    }

    const isCommodity = ['gold price', 'oil price', 'crude oil', 'silver price', 'natural gas price',
      'commodity', 'commodity market', 'gld', 'uso', 'slv', 'ung', 'wheat price', 'corn price',
      'commodity outlook', 'hard assets', 'inflation hedge', 'gold analysis'].some(kw => lowerQuery.includes(kw));
    if (isCommodity && SWARM_REGISTRY.massive_commodity_analyst) {
      return [SWARM_REGISTRY.massive_commodity_analyst];
    }

    const isETF = ['etf analysis', 'etf review', 'expense ratio', 'index fund comparison',
      'vanguard etf', 'ishares etf', 'spy analysis', 'qqq analysis', 'etf comparison',
      'passive investing', 'factor etf', 'etf holdings', 'best etf', 'etf vs'].some(kw => lowerQuery.includes(kw));
    if (isETF && SWARM_REGISTRY.massive_etf_analyst) {
      return [SWARM_REGISTRY.massive_etf_analyst];
    }

    // ── Tier 6: Portfolio & broad equity routing ───────────────────────────────
    const isPortfolio = ['my portfolio', 'portfolio analysis', 'portfolio risk', 'asset allocation',
      'diversification', 'rebalance', 'holdings analysis', 'portfolio performance',
      'sector allocation', 'compare stocks', 'multiple stocks'].some(kw => lowerQuery.includes(kw));
    if (isPortfolio && SWARM_REGISTRY.massive_portfolio_advisor) {
      return [SWARM_REGISTRY.massive_portfolio_advisor];
    }

    // Broad equity/stock analysis — the most common financial query type
    const isEquity = ['stock', 'ticker', 'share price', 'market cap', 'pe ratio', 'equity',
      'nasdaq', 'nyse', 'should i buy', 'is it a good investment', 'stock analysis',
      'googl', 'aapl', 'nvda', 'msft', 'tsla', 'amzn', 'meta', 'revenue', 'dividend',
      'stock outlook', 'buy or sell', 'stock review', 'financial analysis'].some(kw => lowerQuery.includes(kw));
    if (isEquity && SWARM_REGISTRY.massive_equity_analyst) {
      return [SWARM_REGISTRY.massive_equity_analyst];
    }

    // ════════════════════════════════════════════════════════════════════════════
    // END MASSIVE.COM ROUTING — fall through to general agents below
    // ════════════════════════════════════════════════════════════════════════════

    if (isTranslation) {
      return [SWARM_REGISTRY.translator];
    }
    if (isSummary) {
      return [SWARM_REGISTRY.summarizer];
    }
    if (isBrainstorm) {
      return [SWARM_REGISTRY.brainstormer];
    }
    
    // Route search and live intelligence specialists (highest precision first)
    if (isLiveIntel) {
      return [SWARM_REGISTRY.live_intel_aggregator];
    }
    if (isAcademicMeta) {
      return [SWARM_REGISTRY.academic_meta_analyst];
    }
    if (isAcademicSearch) {
      return [SWARM_REGISTRY.academic_search_agent];
    }
    
    // Route specialized domain research specialists
    if (isPatentIntel) {
      return [SWARM_REGISTRY.patent_intel_researcher];
    }
    if (isFinancialSec) {
      return [SWARM_REGISTRY.financial_sec_auditor];
    }
    if (isLegalRegulatory) {
      return [SWARM_REGISTRY.legal_regulatory_researcher];
    }
    
    if (isRealtimeSearch) {
      return [SWARM_REGISTRY.realtime_search_agent];
    }
    
    // Route data specialists
    if (isSchemaMapping) {
      return [SWARM_REGISTRY.schema_mapper_agent];
    }
    if (isPayloadTransform) {
      return [SWARM_REGISTRY.payload_transformer_agent];
    }
    if (isDataProcessing) {
      return [SWARM_REGISTRY.data_processor_agent];
    }
    
    // Route cognitive specialists
    if (isArchitecturalReasoning) {
      return [SWARM_REGISTRY.architectural_reasoning_agent];
    }
    if (isMathLogicProof) {
      return [SWARM_REGISTRY.math_logic_prover_agent];
    }
    if (isIntelligence) {
      return [SWARM_REGISTRY.intelligence_agent];
    }

    // Default to the Core Conversational Assistant (never coder or systems architect agents)
    console.log('📡 Synapse Router: Routing to Core Assistant to guarantee a clean conversational answer.');
    return [SWARM_REGISTRY.general_chat_assistant];
  }

  /**
   * Analyzes the query to build a collaborative multi-agent execution pipeline.
   * @param {string} query - Raw user query
   * @returns {Object} Structured execution pipeline
   */
  static buildExecutionPipeline(query) {
    const recruitedAgents = this.routeQuery(query);
    
    // Check if the query asks for secondary tasks like translation
    const additionalAgents = [];
    const lowerQuery = query.toLowerCase();
    
    const translationKeywords = ['translate', 'spanish', 'french', 'german', 'chinese', 'japanese', 'language', 'traduccion'];
    const hasTranslationRequest = translationKeywords.some(kw => lowerQuery.includes(kw));

    const summaryKeywords = ['summarize', 'summary', 'tldr', 'executive summary', 'brief', 'shorten'];
    const hasSummaryRequest = summaryKeywords.some(kw => lowerQuery.includes(kw));

    if (hasSummaryRequest && !recruitedAgents.some(a => a.id === 'summarizer')) {
      additionalAgents.push(SWARM_REGISTRY.summarizer);
    }
    if (hasTranslationRequest && !recruitedAgents.some(a => a.id === 'translator')) {
      additionalAgents.push(SWARM_REGISTRY.translator);
    }

    const fullPipelineChain = [...recruitedAgents, ...additionalAgents];
    
    return {
      query,
      chain: fullPipelineChain,
      timestamp: Date.now()
    };
  }
}
