import { SWARM_REGISTRY } from './swarm.registry.js';

/**
 * Synapse Routing Orchestrator — 32-Agent Financial Intelligence Edition
 * Performs fast, multi-tier intent matching and dynamic execution chain assembly.
 *
 * Financial Agent Tiers:
 *  Tier 1 (Hyper-specific): M&A arb, short squeeze, IPO, options flow, options, insider flow
 *  Tier 2 (Fundamentals):   Balance sheet, value, growth, earnings, dividends
 *  Tier 3 (Technical):      DeFi, TA chartist, momentum
 *  Tier 4 (Market-wide):    Fixed income, economic calendar, macro, sector rotation, market sentiment
 *  Tier 5 (Asset-class):    REIT, global markets, crypto, DeFi, forex, commodities, ETF, alternatives
 *  Tier 6 (Personal):       Quant screener, tax strategy, retirement, behavioral, portfolio, broad equity
 */
export class SynapseRouter {
  static routeQuery(query) {
    if (!query || typeof query !== 'string') {
      return [SWARM_REGISTRY.general_chat_assistant];
    }

    const q = query.toLowerCase();

    // ─────────────────────────────────────────────────────────────────────────
    // NON-FINANCIAL INTENT FLAGS
    // ─────────────────────────────────────────────────────────────────────────
    const isTranslation       = ['translate', 'spanish', 'french', 'german', 'chinese', 'japanese', 'language', 'traduccion'].some(k => q.includes(k));
    const isSummary           = ['summarize', 'summary', 'tldr', 'executive summary', 'brief', 'shorten', 'outline'].some(k => q.includes(k));
    const isBrainstorm        = ['brainstorm', 'ideas', 'suggest', 'suggestions', 'innovate'].some(k => q.includes(k));
    const isLiveIntel         = ['breaking news', 'latest events today', 'live update', 'global news feed', 'current world event', 'ongoing situation', 'news alert', 'crisis update'].some(k => q.includes(k));
    const isAcademicMeta      = ['meta analysis', 'literature review', 'clinical trials database', 'pubmed meta analysis', 'cochrane library'].some(k => q.includes(k));
    const isAcademicSearch    = ['doi', 'academic paper', 'arxiv', 'pubmed', 'biorxiv', 'medrxiv', 'scholarly', 'citation'].some(k => q.includes(k));
    const isRealtimeSearch    = ['search', 'lookup', 'latest news', 'weather', 'sports schedule', 'game score', 'who won', 'happenings', 'real-time', 'realtime'].some(k => q.includes(k));
    const isPatentIntel       = ['patent search', 'prior art', 'patent claims', 'uspto', 'patent application', 'wipo search', 'epo filing', 'infringement risk'].some(k => q.includes(k));
    const isFinancialSec      = ['sec filing search', '10-k', '10-q', 'corporate disclosure audit', 'sec edgar', 'risk factor warnings'].some(k => q.includes(k));
    const isLegalRegulatory   = ['case law search', 'court docket review', 'statutory code', 'cfr lookup', 'supreme court holding', 'compliance mandate'].some(k => q.includes(k));
    const isSchemaMapping     = ['ddl', 'schema design', 'entity relationship', 'table schema', 'database model', 'sql schema', 'erd diagram'].some(k => q.includes(k));
    const isPayloadTransform  = ['clean data', 'sanitize payload', 'flatten json', 'parse csv', 'csv record', 'null handling', 'type coercion', 'normalize datetime', 'data scrubber', 'bad json', 'clean the bad json'].some(k => q.includes(k));
    const isDataProcessing    = ['process', 'json', 'csv', 'xml', 'format', 'convert', 'nested data', 'dataset', 'parser'].some(k => q.includes(k));
    const isArchitectural     = ['multi region', 'latency budget', 'fault tolerance', 'high availability', 'scaling blueprint', 'datacenter topology', 'disaster recovery', 'vpc design'].some(k => q.includes(k));
    const isMathLogic         = ['logic proof', 'formal logic', 'symbolic proof', 'theorem proving', 'big o induction', 'combinatorics', 'discrete math', 'propositional logic'].some(k => q.includes(k));
    const isIntelligence      = ['think', 'reason', 'proof', 'strategy', 'plan', 'critique', 'cognitive', 'deep reasoning'].some(k => q.includes(k));

    const isFinancialSearch   = ['stock price', 'annual revenue', 'stock ticker', 'trading volume', 'financial stats', 'ticker lookup', 'share price'].some(k => q.includes(k));

    // ─────────────────────────────────────────────────────────────────────────
    // 1. HIGH-SPECIFICITY DOMAIN SPECIALIST ROUTING (Pre-empts general financial routing)
    // ─────────────────────────────────────────────────────────────────────────
    if (isAcademicMeta && SWARM_REGISTRY.academic_meta_analyst) {
      return [SWARM_REGISTRY.academic_meta_analyst];
    }
    if (isPatentIntel && SWARM_REGISTRY.patent_intel_researcher) {
      return [SWARM_REGISTRY.patent_intel_researcher];
    }
    if (isFinancialSec && SWARM_REGISTRY.financial_sec_auditor) {
      return [SWARM_REGISTRY.financial_sec_auditor];
    }
    if (isLegalRegulatory && SWARM_REGISTRY.legal_regulatory_researcher) {
      return [SWARM_REGISTRY.legal_regulatory_researcher];
    }
    if (isSchemaMapping && SWARM_REGISTRY.schema_mapper_agent) {
      return [SWARM_REGISTRY.schema_mapper_agent];
    }
    if (isPayloadTransform && SWARM_REGISTRY.payload_transformer_agent) {
      return [SWARM_REGISTRY.payload_transformer_agent];
    }
    if (isMathLogic && SWARM_REGISTRY.math_logic_prover_agent) {
      return [SWARM_REGISTRY.math_logic_prover_agent];
    }
    if (isArchitectural && SWARM_REGISTRY.architectural_reasoning_agent) {
      return [SWARM_REGISTRY.architectural_reasoning_agent];
    }
    if (isIntelligence && SWARM_REGISTRY.intelligence_agent) {
      return [SWARM_REGISTRY.intelligence_agent];
    }
    if (isLiveIntel && SWARM_REGISTRY.live_intel_aggregator) {
      return [SWARM_REGISTRY.live_intel_aggregator];
    }
    if (isAcademicSearch && SWARM_REGISTRY.academic_search_agent) {
      return [SWARM_REGISTRY.academic_search_agent];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MASSIVE.COM FINANCIAL INTELLIGENCE ROUTING — 32 SPECIALIST AGENTS
    // Priority: most-specific query intent first, most general last.
    // ═════════════════════════════════════════════════════════════════════════

    // ── Tier 1: Hyper-specific derivatives, events & flow ─────────────────────
    if (['merger', 'acquisition', 'merger arbitrage', 'deal spread', 'takeover', 'buyout',
      'special situation', 'spinoff', 'activist investor', 'tender offer', 'ma deal',
      'acquisition premium', 'deal closing', 'corporate action', 'catalyst trade'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_risk_arbitrageur) {
      return [SWARM_REGISTRY.massive_risk_arbitrageur];
    }

    if (['short squeeze', 'short interest', 'days to cover', 'short ratio', 'high short interest',
      'short float', 'heavily shorted', 'most shorted', 'squeeze candidate', 'short covering',
      'gamma squeeze', 'meme stock'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_short_squeeze_scanner) {
      return [SWARM_REGISTRY.massive_short_squeeze_scanner];
    }

    if (['ipo', 'initial public offering', 'ipo calendar', 'upcoming ipo', 'ipo listing',
      'new stock listing', 'lock up expiry', 'ipo valuation', 'ipo pop', 'spac', 'direct listing',
      'ipo investing', 'ipo date', 'ipo price'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_ipo_analyst) {
      return [SWARM_REGISTRY.massive_ipo_analyst];
    }

    // Options FLOW (dark pool, unusual) — must come BEFORE generic options
    if (['options flow', 'unusual options', 'dark pool', 'call sweep', 'put sweep',
      'options alert', 'unusual activity', 'smart money options', 'institutional options',
      'whale options', 'large options trade', 'put call ratio'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_options_flow_alert) {
      return [SWARM_REGISTRY.massive_options_flow_alert];
    }

    if (['call option', 'put option', 'options chain', 'options strategy',
      'implied volatility', 'iron condor', 'covered call', 'straddle', 'strangle',
      'options expir', 'open interest', 'delta hedging', 'options greeks'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_options_strategist) {
      return [SWARM_REGISTRY.massive_options_strategist];
    }

    // Insider flow — very specific, high signal
    if (['insider buying', 'insider selling', 'form 4', '13f filing',
      'institutional ownership', 'insider activity', 'ceo buying', 'insider purchase',
      'insider transaction', 'smart money buying', 'insider ownership'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_insider_flow_tracker) {
      return [SWARM_REGISTRY.massive_insider_flow_tracker];
    }

    // ── Tier 2: Fundamental & valuation specialists ────────────────────────────
    if (['income statement', 'balance sheet', 'cash flow', 'free cash flow',
      'gross profit', 'operating margin', 'net income margin', 'financial statements',
      'revenue breakdown', 'quarterly financials', 'annual report financials'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_fundamentals_audit) {
      return [SWARM_REGISTRY.massive_fundamentals_audit];
    }

    if (['intrinsic value', 'margin of safety', 'buffett', 'graham', 'undervalued stock',
      'value investing', 'value stock', 'economic moat', 'book value', 'price to book',
      'owner earnings', 'value opportunity'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_value_investor) {
      return [SWARM_REGISTRY.massive_value_investor];
    }

    if (['growth stock', 'hypergrowth', 'rule of 40', 'saas stock', 'net retention',
      'total addressable market', 'garp', 'revenue acceleration', 'growth investing',
      'high growth company', 'revenue growth rate'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_growth_investor) {
      return [SWARM_REGISTRY.massive_growth_investor];
    }

    if (['earnings report', 'earnings results', 'eps beat', 'revenue beat', 'earnings miss',
      'quarterly results', 'guidance raised', 'guidance cut', 'earnings season', 'earnings call',
      'earnings surprise', 'profit results', 'quarterly earnings', 'annual earnings'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_earnings_specialist) {
      return [SWARM_REGISTRY.massive_earnings_specialist];
    }

    if (['dividend yield', 'dividend payment', 'ex dividend', 'payout ratio',
      'drip', 'passive income investing', 'dividend growth', 'dividend aristocrat', 'dividend king',
      'dividend safety', 'annual dividend', 'quarterly dividend', 'dividend income'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_dividend_income_planner) {
      return [SWARM_REGISTRY.massive_dividend_income_planner];
    }

    // ── Tier 3: Technical, momentum & DeFi specialists ────────────────────────
    // DeFi before generic crypto (more specific)
    if (['defi', 'tvl', 'yield farming', 'liquidity pool', 'uniswap', 'aave', 'compound',
      'lido', 'staking yield', 'protocol revenue', 'impermanent loss', 'defi protocol',
      'smart contract yield', 'tokenomics', 'defi investing', 'web3 protocol'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_crypto_defi_researcher) {
      return [SWARM_REGISTRY.massive_crypto_defi_researcher];
    }

    if (['rsi', 'macd', 'ema ', 'sma ', 'moving average', 'golden cross', 'death cross',
      'overbought', 'oversold', 'support resistance', 'technical analysis', 'chart pattern',
      'bollinger', 'fibonacci', 'trend analysis', 'price action', 'technical indicator'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_technical_chartist) {
      return [SWARM_REGISTRY.massive_technical_chartist];
    }

    if (['momentum stock', 'momentum trading', 'relative strength', 'trend following',
      '52 week high', 'momentum strategy', 'rs rank', 'market leaders', 'price momentum',
      'breakout stock', 'leading stocks', 'momentum factor'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_momentum_trader) {
      return [SWARM_REGISTRY.massive_momentum_trader];
    }

    // ── Tier 4: Market-wide, macro, fixed income & calendar ───────────────────
    // Fixed income — before macro (yield curve queries could match both, FI is more specific)
    if (['bond yield', 'treasury yield', 'bond market', 'fixed income',
      'credit spread', 'bond price', 'duration risk', 'bond investing', 'treasury bond',
      'corporate bond', 'high yield bond', 'tips inflation', 'bond allocation',
      'inverted yield curve', '10 year yield', '2 year yield', 'bond etf'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_fixed_income_desk) {
      return [SWARM_REGISTRY.massive_fixed_income_desk];
    }

    if (['economic calendar', 'fomc meeting date', 'cpi release date', 'jobs report date',
      'non-farm payrolls', 'earnings calendar', 'upcoming earnings date', 'options expiration date',
      'ex-dividend date', 'gdp report', 'ism report', 'retail sales report',
      'when is earnings', 'next fed meeting', 'economic data release'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_economic_calendar_agent) {
      return [SWARM_REGISTRY.massive_economic_calendar_agent];
    }

    if (['inflation', 'cpi report', 'federal reserve', 'fed policy', 'treasury yields',
      'yield curve', 'recession', 'interest rates', 'labor market', 'unemployment rate',
      'gdp growth', 'macro outlook', 'fed meeting', 'rate hike', 'rate cut', 'monetary policy'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_macro_economist) {
      return [SWARM_REGISTRY.massive_macro_economist];
    }

    if (['sector rotation', 'sector performance', 'best sector', 'sector etf',
      'xlk', 'xlf', 'xlv', 'xle', 'xly', 'xli', 'xlp', 'sector analysis', 'sector outlook',
      'cyclical stocks', 'defensive stocks', 'sector investing', 'business cycle phase'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_sector_rotation_advisor) {
      return [SWARM_REGISTRY.massive_sector_rotation_advisor];
    }

    if (['market overview', 'market sentiment', 'vix index', 'fear greed',
      'market breadth', 'stock market today', 'market health', 'risk on risk off',
      'bull market conditions', 'bear market conditions', 'market conditions',
      'what is the market doing', 'market outlook today', 'overall market'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_market_sentinel) {
      return [SWARM_REGISTRY.massive_market_sentinel];
    }

    // ── Tier 5: Asset-class, REIT, global, alternatives ───────────────────────
    // REIT — more specific than broad equity
    if (['reit', 'real estate investment trust', 'ffo ', 'affo', 'nav discount', 'cap rate',
      'realty income stock', 'prologis stock', 'xlre', 'reit dividend',
      'reit analysis', 'reit sector', 'mortgage reit', 'office reit', 'industrial reit',
      'residential reit', 'data center reit', 'reit investing'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_reit_analyst) {
      return [SWARM_REGISTRY.massive_reit_analyst];
    }

    if (['global markets', 'international stocks', 'european stocks', 'asian stocks',
      'emerging markets', 'nikkei', 'dax index', 'ftse', 'hang seng', 'china stocks', 'india stocks',
      'international etf', 'efa etf', 'eem etf', 'global investing', 'foreign stocks',
      'ex-us stocks', 'developed markets'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_global_markets_desk) {
      return [SWARM_REGISTRY.massive_global_markets_desk];
    }

    // DeFi-specific crypto — before generic crypto
    if (['bitcoin', 'ethereum', 'btc price', 'eth price', 'solana', 'crypto',
      'cryptocurrency', 'altcoin', 'nft', 'binance', 'coinbase', 'blockchain',
      'crypto market', 'dogecoin', 'xrp', 'cardano', 'avalanche', 'polygon'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_crypto_analyst) {
      return [SWARM_REGISTRY.massive_crypto_analyst];
    }

    if (['forex', 'currency pair', 'exchange rate', 'eurusd', 'gbpusd', 'usdjpy',
      'usdchf', 'audusd', 'usdcad', 'fx market', 'currency forecast',
      'dollar strength', 'dollar weakness', 'carry trade', 'currency conversion',
      'convert usd', 'convert eur'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_forex_trader) {
      return [SWARM_REGISTRY.massive_forex_trader];
    }

    if (['gold price', 'oil price', 'crude oil', 'silver price', 'natural gas price',
      'commodity market', 'gld etf', 'uso etf', 'slv etf', 'ung etf', 'wheat price', 'corn price',
      'commodity outlook', 'hard assets', 'inflation hedge commodity', 'gold analysis'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_commodity_analyst) {
      return [SWARM_REGISTRY.massive_commodity_analyst];
    }

    if (['etf analysis', 'etf review', 'expense ratio', 'index fund comparison',
      'vanguard etf', 'ishares etf', 'spy etf', 'qqq etf', 'etf comparison',
      'passive investing', 'factor etf', 'etf holdings', 'best etf', 'etf vs etf'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_etf_analyst) {
      return [SWARM_REGISTRY.massive_etf_analyst];
    }

    if (['alternative investments', 'hedge fund investing', 'private equity fund',
      'real assets', 'managed futures', 'private credit', 'direct lending', 'bdc fund',
      'infrastructure investing', 'alternative portfolio', 'endowment model',
      'venture capital fund', 'alternatives allocation', 'private market investing'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_alternatives_advisor) {
      return [SWARM_REGISTRY.massive_alternatives_advisor];
    }

    // ── Tier 6: Personal finance, portfolio, screener & behavioral ────────────
    if (['stock screener', 'quant screen', 'factor investing screen', 'best stocks list',
      'stock ranking', 'value stocks screen', 'growth stocks screen', 'multi factor screen',
      'stock filter', 'find stocks to buy', 'top stocks', 'stock ideas',
      'best value stocks', 'best growth stocks', 'systematic stock selection'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_quant_screener) {
      return [SWARM_REGISTRY.massive_quant_screener];
    }

    if (['tax loss harvesting', 'capital gains tax', 'wash sale rule', 'tax efficient investing',
      'roth conversion', 'account location strategy', 'investment taxes', 'tax optimization',
      'long term capital gains', 'short term capital gains', 'tax strategy investing',
      'donor advised fund', 'tax drag', 'tax alpha', 'municipal bonds tax'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_tax_strategy_advisor) {
      return [SWARM_REGISTRY.massive_tax_strategy_advisor];
    }

    if (['retirement planning', 'retirement portfolio', '4 percent rule', 'safe withdrawal rate',
      'roth ira', '401k', 'retirement savings', 'when can i retire', 'retirement income',
      'social security', 'rmd', 'required minimum distribution', 'nest egg',
      'financial independence', 'fire movement', 'early retirement'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_retirement_planner) {
      return [SWARM_REGISTRY.massive_retirement_planner];
    }

    if (['behavioral finance', 'investor psychology', 'cognitive bias', 'loss aversion',
      'overconfidence bias', 'confirmation bias', 'emotional trading', 'fomo investing',
      'panic selling', 'holding losers', 'trading psychology', 'investment mindset',
      'sunk cost fallacy', 'recency bias', 'herd mentality investor'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_behavioral_coach) {
      return [SWARM_REGISTRY.massive_behavioral_coach];
    }

    if (['my portfolio', 'portfolio analysis', 'portfolio risk', 'asset allocation',
      'diversification', 'rebalance portfolio', 'holdings analysis', 'portfolio performance',
      'sector allocation', 'compare stocks', 'multiple stocks analysis'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_portfolio_advisor) {
      return [SWARM_REGISTRY.massive_portfolio_advisor];
    }

    if (isFinancialSearch && SWARM_REGISTRY.financial_search_agent) {
      return [SWARM_REGISTRY.financial_search_agent];
    }

    // Broad equity / stock — most general financial catch-all
    if (['stock', 'ticker', 'share price', 'market cap', 'pe ratio', 'equity',
      'nasdaq', 'nyse', 'should i buy', 'is it a good investment', 'stock analysis',
      'googl', 'aapl', 'nvda', 'msft', 'tsla', 'amzn', 'meta', 'stock outlook',
      'buy or sell', 'stock review', 'financial analysis'].some(k => q.includes(k))
      && SWARM_REGISTRY.massive_equity_analyst) {
      return [SWARM_REGISTRY.massive_equity_analyst];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PREDICTIONDATA.IO SPORTS SWARM ROUTING — 8 SPORTS INTELLIGENCE AGENTS
    // ═════════════════════════════════════════════════════════════════════════

    if (['parlay', 'accumulator', 'multi bet', 'parlay builder', 'price parlay',
      'combined odds', 'parlay payout', 'parlay legs', 'teaser bet', 'round robin'].some(k => q.includes(k))
      && SWARM_REGISTRY.sports_parlay_architect) {
      return [SWARM_REGISTRY.sports_parlay_architect];
    }

    if (['arbitrage', 'arb betting', 'risk free profit', 'surebets', 'sure bets',
      'arbitrage scanner', 'risk-free bet', 'payout matrix', 'arbitrage calculator'].some(k => q.includes(k))
      && SWARM_REGISTRY.sports_arbitrage_scanner) {
      return [SWARM_REGISTRY.sports_arbitrage_scanner];
    }

    if (['sharp money', 'smart money', 'steam move', 'reverse line movement',
      'rlm', 'pinnacle line', 'sharp action', 'public consensus', 'sharp books'].some(k => q.includes(k))
      && SWARM_REGISTRY.sports_sharp_money_analyst) {
      return [SWARM_REGISTRY.sports_sharp_money_analyst];
    }

    if (['player props', 'passing yards', 'rebounds', 'strikeouts', 'touchdown scorer',
      'prop bet', 'yards props', 'points props', 'assists props', 'over under player'].some(k => q.includes(k))
      && SWARM_REGISTRY.sports_player_props_predictor) {
      return [SWARM_REGISTRY.sports_player_props_predictor];
    }

    if (['value bets', 'ev betting', 'positive expected value', 'kelly criterion',
      'vig-free odds', 'juice-free odds', 'betting edge', 'expected value calculator', 'quant bets'].some(k => q.includes(k))
      && SWARM_REGISTRY.sports_value_betting_quant) {
      return [SWARM_REGISTRY.sports_value_betting_quant];
    }

    if (['prizepicks', 'underdog', 'sleeper fantasy', 'dfs optimizer', 'dfs slip',
      'fantasy props', 'dfs projection', 'more or less', 'dfs value', 'prizepicks slip'].some(k => q.includes(k))
      && SWARM_REGISTRY.sports_dfs_expert) {
      return [SWARM_REGISTRY.sports_dfs_expert];
    }

    if (['live odds', 'in-play', 'live score', 'live bet', 'in game odds',
      'hedging live', 'live spread', 'live moneyline', 'live game update', 'middle bet'].some(k => q.includes(k))
      && SWARM_REGISTRY.sports_live_odds_orchestrator) {
      return [SWARM_REGISTRY.sports_live_odds_orchestrator];
    }

    if (['futures odds', 'super bowl odds', 'mvp odds', 'championship odds', 'outright winner',
      'win totals', 'regular season wins', 'cy young odds', 'rookie of the year', 'division winner'].some(k => q.includes(k))
      && SWARM_REGISTRY.sports_futures_speculator) {
      return [SWARM_REGISTRY.sports_futures_speculator];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // REALESTATEAPI.COM REAL ESTATE SWARM ROUTING
    // ═════════════════════════════════════════════════════════════════════════

    if (['valuation', 'avm', 'home value', 'house worth', 'estimated value', 'appraisal',
      'what is it worth', 'price estimate', 'property value', 'rent valuation', 'rental yield', 'cap rate'].some(k => q.includes(k))
      && SWARM_REGISTRY.realestate_property_quant) {
      return [SWARM_REGISTRY.realestate_property_quant];
    }

    if (['comps', 'comparable sales', 'sold homes near', 'recent sales', 'neighborhood sales',
      'comparables', 'sold near', 'mls', 'listings', 'for sale', 'active listings', 'active properties',
      'homes for sale', 'real estate listings', 'days on market', 'dom'].some(k => q.includes(k))
      && SWARM_REGISTRY.realestate_market_analyst) {
      return [SWARM_REGISTRY.realestate_market_analyst];
    }

    if (['skip trace', 'owner contact', 'owner phone', 'owner email', 'lookup owner',
      'who owns', 'property owner', 'skip trace phone', 'owner address', 'contact owner'].some(k => q.includes(k))
      && SWARM_REGISTRY.realestate_skip_tracer) {
      return [SWARM_REGISTRY.realestate_skip_tracer];
    }


    // ═════════════════════════════════════════════════════════════════════════
    // EXPERT DOMAIN INTELLIGENCE ROUTING — 12 PROFESSIONAL SPECIALIST AGENTS
    // ═════════════════════════════════════════════════════════════════════════

    // Startup / Entrepreneurship
    if (['startup pitch', 'pitch deck', 'investor pitch', 'seed round', 'series a funding',
      'yc application', 'y combinator', 'venture capital pitch', 'startup advice', 'angel investor',
      'pitch feedback', 'startup funding', 'pre-seed', 'founder advice', 'term sheet'].some(k => q.includes(k))
      && SWARM_REGISTRY.startup_founder_coach) {
      return [SWARM_REGISTRY.startup_founder_coach];
    }

    // Product Management
    if (['prd', 'product requirements document', 'user story', 'product roadmap', 'feature prioritization',
      'okr framework', 'product manager', 'product strategy', 'rice framework', 'moscow prioritization',
      'north star metric', 'product spec', 'sprint planning', 'agile product', 'product backlog'].some(k => q.includes(k))
      && SWARM_REGISTRY.product_manager_advisor) {
      return [SWARM_REGISTRY.product_manager_advisor];
    }

    // Marketing & Growth
    if (['growth marketing', 'growth hacking', 'marketing strategy', 'customer acquisition cost',
      'cac ltv', 'viral growth', 'go to market strategy', 'gtm strategy', 'marketing channels',
      'performance marketing', 'paid ads strategy', 'growth metrics', 'conversion rate optimization',
      'marketing funnel', 'pirate metrics', 'growth experiment'].some(k => q.includes(k))
      && SWARM_REGISTRY.marketing_growth_strategist) {
      return [SWARM_REGISTRY.marketing_growth_strategist];
    }

    // Negotiation
    if (['how to negotiate', 'negotiation strategy', 'batna', 'negotiation tactics', 'negotiation script',
      'negotiate price', 'tactical empathy', 'anchoring strategy', 'negotiation preparation',
      'principled negotiation', 'counter offer strategy', 'negotiation tips'].some(k => q.includes(k))
      && SWARM_REGISTRY.negotiation_strategist) {
      return [SWARM_REGISTRY.negotiation_strategist];
    }

    // Business Planning
    if (['business plan', 'executive summary business', 'business plan template', 'financial projections plan',
      'market analysis business', 'competitive analysis plan', 'operations plan', 'business proposal',
      'franchise plan', 'business plan for investors', 'swot analysis business'].some(k => q.includes(k))
      && SWARM_REGISTRY.business_plan_architect) {
      return [SWARM_REGISTRY.business_plan_architect];
    }

    // Clinical / Medical Research (strict disclaimer — NOT diagnosis)
    if (['clinical research', 'medical study', 'drug mechanism', 'clinical trial result',
      'randomized controlled trial', 'medical literature', 'drug interaction research',
      'pharmacology', 'mechanism of action', 'side effects research', 'evidence based medicine',
      'treatment research', 'medical evidence', 'pharmaceutical research', 'fda approval research'].some(k => q.includes(k))
      && SWARM_REGISTRY.clinical_research_advisor) {
      return [SWARM_REGISTRY.clinical_research_advisor];
    }

    // ESG / Sustainability
    if (['esg rating', 'esg score', 'sustainability report', 'carbon footprint company', 'net zero commitment',
      'climate risk investment', 'greenwashing', 'esg investing', 'green investing',
      'scope 1 2 3 emissions', 'tcfd', 'sustainable investing', 'impact investing esg',
      'esg fund', 'clean energy investing esg'].some(k => q.includes(k))
      && SWARM_REGISTRY.environmental_esg_analyst) {
      return [SWARM_REGISTRY.environmental_esg_analyst];
    }

    // Cybersecurity
    if (['cve', 'vulnerability', 'cybersecurity threat', 'security breach analysis', 'ransomware analysis',
      'mitre attack', 'security posture', 'threat intelligence', 'zero day vulnerability',
      'security risk assessment', 'data breach analysis', 'cyber attack analysis', 'cvss score',
      'attack vector', 'incident response plan', 'zero trust security'].some(k => q.includes(k))
      && SWARM_REGISTRY.cybersecurity_threat_analyst) {
      return [SWARM_REGISTRY.cybersecurity_threat_analyst];
    }

    // Data Privacy & Compliance
    if (['gdpr', 'ccpa', 'hipaa compliance', 'soc2', 'data privacy', 'privacy compliance',
      'data protection', 'privacy policy compliance', 'data breach notification', 'dpo',
      'data subject rights', 'privacy law', 'privacy by design', 'data governance compliance',
      'privacy impact assessment', 'iso 27001', 'pci dss'].some(k => q.includes(k))
      && SWARM_REGISTRY.data_privacy_compliance) {
      return [SWARM_REGISTRY.data_privacy_compliance];
    }

    // Science Tutoring (physics, chemistry, biology)
    if (['physics problem', 'chemistry problem', 'biology question', 'science help',
      'physics equation', 'chemistry equation', 'molecular biology explain', 'quantum mechanics explain',
      'thermodynamics problem', 'organic chemistry', 'genetics problem', 'newton law',
      'periodic table', 'cell biology', 'dna rna explain', 'science explain', 'stem problem'].some(k => q.includes(k))
      && SWARM_REGISTRY.science_tutor_agent) {
      return [SWARM_REGISTRY.science_tutor_agent];
    }

    // Creative Writing
    if (['screenplay', 'script writing', 'story structure', 'creative writing help', 'novel writing',
      'character development', 'plot outline', 'story feedback', 'dialogue writing',
      'three act structure', 'short story help', 'write a story', 'fiction writing',
      'narrative structure', 'scene writing', 'character arc', 'story idea', 'writing critique',
      'writing coach', 'book outline', 'story plot'].some(k => q.includes(k))
      && SWARM_REGISTRY.creative_writing_director) {
      return [SWARM_REGISTRY.creative_writing_director];
    }

    // Career Strategy
    if (['career advice', 'resume help', 'job search strategy', 'salary negotiation career', 'linkedin profile',
      'interview preparation', 'career pivot', 'job interview tips', 'career change advice',
      'promotion strategy', 'resume review', 'cover letter', 'job offer negotiation',
      'career development', 'career coach', 'linkedin optimization', 'personal brand career',
      'how to get promoted'].some(k => q.includes(k))
      && SWARM_REGISTRY.career_strategist_coach) {
      return [SWARM_REGISTRY.career_strategist_coach];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // LEGACY NON-FINANCIAL AGENT ROUTING
    // ═════════════════════════════════════════════════════════════════════════
    if (isTranslation)      return [SWARM_REGISTRY.translator];
    if (isSummary)          return [SWARM_REGISTRY.summarizer];
    if (isBrainstorm)       return [SWARM_REGISTRY.brainstormer];
    if (isLiveIntel)        return [SWARM_REGISTRY.live_intel_aggregator];
    if (isAcademicMeta)     return [SWARM_REGISTRY.academic_meta_analyst];
    if (isPatentIntel)      return [SWARM_REGISTRY.patent_intel_researcher];
    if (isFinancialSec)     return [SWARM_REGISTRY.financial_sec_auditor];
    if (isLegalRegulatory)  return [SWARM_REGISTRY.legal_regulatory_researcher];
    if (isAcademicSearch)   return [SWARM_REGISTRY.academic_search_agent];
    if (isRealtimeSearch)   return [SWARM_REGISTRY.realtime_search_agent];
    if (isSchemaMapping)    return [SWARM_REGISTRY.schema_mapper_agent];
    if (isPayloadTransform) return [SWARM_REGISTRY.payload_transformer_agent];
    if (isDataProcessing)   return [SWARM_REGISTRY.data_processor_agent];
    if (isArchitectural)    return [SWARM_REGISTRY.architectural_reasoning_agent];
    if (isMathLogic)        return [SWARM_REGISTRY.math_logic_prover_agent];
    if (isIntelligence)     return [SWARM_REGISTRY.intelligence_agent];

    console.log('📡 SynapseRouter: defaulting to Core Assistant');
    return [SWARM_REGISTRY.general_chat_assistant];
  }

  static buildExecutionPipeline(query) {
    const recruitedAgents = this.routeQuery(query);
    const additionalAgents = [];
    const q = query.toLowerCase();

    const hasSummary = ['summarize', 'summary', 'tldr', 'executive summary', 'brief', 'shorten'].some(k => q.includes(k));
    const hasTranslation = ['translate', 'spanish', 'french', 'german', 'chinese', 'japanese', 'language'].some(k => q.includes(k));

    if (hasSummary && !recruitedAgents.some(a => a.id === 'summarizer')) {
      additionalAgents.push(SWARM_REGISTRY.summarizer);
    }
    if (hasTranslation && !recruitedAgents.some(a => a.id === 'translator')) {
      additionalAgents.push(SWARM_REGISTRY.translator);
    }

    return {
      query,
      chain: [...recruitedAgents, ...additionalAgents],
      timestamp: Date.now()
    };
  }
}
