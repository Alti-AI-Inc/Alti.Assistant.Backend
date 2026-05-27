/**
 * Query Classification Service
 * Determines if a query is code-related, writing-related, OR financial
 * Financial queries are priority-routed to Massive.com real-time data
 */
import { detectFinancialIntent } from '../../../helpers/massiveTickerDB.js';
import { detectSportsIntent } from '../../../helpers/sportsIntentDB.js';
import { detectAviationIntent } from '../../../helpers/aviationstackIntentDB.js';

/**
 * Code-related keywords and patterns
 */
const PROGRAMMING_LANGUAGES = [
  'javascript',
  'python',
  'java',
  'c++',
  'cpp',
  'typescript',
  'go',
  'golang',
  'rust',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'c#',
  'csharp',
  'scala',
  'perl',
  'bash',
  'shell',
  'sql',
  'html',
  'css',
  'react',
  'vue',
  'angular',
  'node',
  'nodejs',
  'express',
  'django',
  'flask',
  'spring',
  'laravel',
  '.net',
  'dotnet',
];

const CODE_KEYWORDS = [
  'function',
  'class',
  'method',
  'variable',
  'loop',
  'algorithm',
  'code',
  'script',
  'debug',
  'error',
  'bug',
  'implement',
  'refactor',
  'syntax',
  'compile',
  'runtime',
  'exception',
  'async',
  'await',
  'promise',
  'callback',
  'closure',
  'recursion',
  'iteration',
  'scope',
  'inheritance',
  'polymorphism',
  'interface',
  'abstract',
  'static',
  'const',
  'let',
  'var',
  'import',
  'export',
  'require',
];

const TECHNICAL_TERMS = [
  'api',
  'rest',
  'graphql',
  'endpoint',
  'database',
  'sql',
  'nosql',
  'mongodb',
  'postgresql',
  'mysql',
  'redis',
  'framework',
  'library',
  'package',
  'module',
  'npm',
  'yarn',
  'pip',
  'git',
  'github',
  'docker',
  'kubernetes',
  'deploy',
  'deployment',
  'container',
  'microservice',
  'serverless',
  'lambda',
  'aws',
  'azure',
  'gcp',
  'cloud',
  'devops',
  'ci/cd',
  'jenkins',
  'webpack',
  'babel',
  'eslint',
  'prettier',
  'testing',
  'jest',
  'mocha',
  'pytest',
  'junit',
];

const DEVELOPMENT_ACTIONS = [
  'write code',
  'write script',
  'write a script',
  'create function',
  'create script',
  'implement',
  'build',
  'develop',
  'program',
  'make a script',
  'generate code',
  'fix bug',
  'debug',
  'troubleshoot',
  'optimize',
  'refactor',
  'review code',
  'how to code',
  'coding',
  'programming',
  'software development',
  'app development',
  'show me code',
  'give me code',
  'provide code',
  'code for',
  'script for',
];

const DATA_STRUCTURES = [
  'array',
  'list',
  'linked list',
  'stack',
  'queue',
  'tree',
  'binary tree',
  'graph',
  'hash map',
  'hash table',
  'set',
  'dictionary',
  'heap',
  'trie',
];

const DESIGN_PATTERNS = [
  'singleton',
  'factory',
  'observer',
  'strategy',
  'decorator',
  'adapter',
  'facade',
  'proxy',
  'mvc',
  'mvvm',
  'redux',
  'flux',
  'repository pattern',
];

const SOFTWARE_CONCEPTS = [
  'authentication',
  'authorization',
  'jwt',
  'oauth',
  'encryption',
  'hashing',
  'security',
  'vulnerability',
  'xss',
  'csrf',
  'injection',
  'middleware',
  'routing',
  'controller',
  'model',
  'view',
  'component',
  'props',
  'state',
  'hooks',
  'lifecycle',
  'render',
  'dom',
  'virtual dom',
  'webpack',
  'bundler',
];

/**
 * Check if query contains code-related keywords
 * @param {string} query - The user query
 * @returns {Object} - Match counts for each category
 */
function analyzeKeywordMatches(query) {
  const lowerQuery = query.toLowerCase();

  const matches = {
    languages: 0,
    codeKeywords: 0,
    technicalTerms: 0,
    dataStructures: 0,
    designPatterns: 0,
    softwareConcepts: 0,
    developmentActions: 0,
  };

  // Check programming languages
  PROGRAMMING_LANGUAGES.forEach((lang) => {
    if (lowerQuery.includes(lang)) matches.languages++;
  });

  // Check code keywords
  CODE_KEYWORDS.forEach((keyword) => {
    if (lowerQuery.includes(keyword)) matches.codeKeywords++;
  });

  // Check technical terms
  TECHNICAL_TERMS.forEach((term) => {
    if (lowerQuery.includes(term)) matches.technicalTerms++;
  });

  // Check data structures
  DATA_STRUCTURES.forEach((ds) => {
    if (lowerQuery.includes(ds)) matches.dataStructures++;
  });

  // Check design patterns
  DESIGN_PATTERNS.forEach((pattern) => {
    if (lowerQuery.includes(pattern)) matches.designPatterns++;
  });

  // Check software concepts
  SOFTWARE_CONCEPTS.forEach((concept) => {
    if (lowerQuery.includes(concept)) matches.softwareConcepts++;
  });

  // Check development actions
  DEVELOPMENT_ACTIONS.forEach((action) => {
    if (lowerQuery.includes(action)) matches.developmentActions++;
  });

  return matches;
}

/**
 * Check for code patterns in the query
 * @param {string} query - The user query
 * @returns {number} - Pattern match score
 */
function checkCodePatterns(query) {
  let score = 0;
  const lowerQuery = query.toLowerCase();

  // Check for code request patterns
  if (
    /write\s+(a\s+)?.*?\s+(script|code|function|class|program)/.test(lowerQuery)
  )
    score += 3;
  if (
    /create\s+(a\s+)?.*?\s+(script|code|function|class|program)/.test(
      lowerQuery
    )
  )
    score += 3;
  if (
    /generate\s+(a\s+)?.*?\s+(script|code|function|class|program)/.test(
      lowerQuery
    )
  )
    score += 3;
  if (
    /make\s+(a\s+)?.*?\s+(script|code|function|class|program)/.test(lowerQuery)
  )
    score += 3;
  if (
    /(show|give|provide)\s+me\s+(a\s+)?(script|code|example)/.test(lowerQuery)
  )
    score += 3;

  // Check for code snippets (curly braces, semicolons, etc.)
  if (query.includes('{') && query.includes('}')) score += 2;
  if (query.includes('()') || query.includes('function(')) score += 2;
  if (query.includes('=>')) score += 2;
  if (
    query.includes('const ') ||
    query.includes('let ') ||
    query.includes('var ')
  )
    score += 2;
  if (
    query.includes('import ') ||
    query.includes('from ') ||
    query.includes('require(')
  )
    score += 1;
  if (query.includes('class ') || query.includes('extends ')) score += 2;
  if (query.includes('async ') || query.includes('await ')) score += 1;

  // Check for common code syntax patterns
  if (/\w+\(\)/.test(query)) score += 1; // function calls like foo()
  if (/\w+\.\w+/.test(query)) score += 1; // object.property or module.method
  if (/console\.log|print\(|System\.out/.test(query)) score += 2;

  return score;
}

/**
 * Calculate confidence score for code-related query
 * @param {Object} matches - Keyword match counts
 * @param {number} patternScore - Code pattern score
 * @param {string} query - Original query
 * @returns {number} - Confidence score between 0 and 1
 */
function calculateConfidence(matches, patternScore, query) {
  let score = 0;
  let maxScore = 100;

  // Weight different categories
  score += matches.languages * 8;
  score += matches.codeKeywords * 6;
  score += matches.technicalTerms * 4;
  score += matches.dataStructures * 7;
  score += matches.designPatterns * 7;
  score += matches.softwareConcepts * 5;
  score += matches.developmentActions * 6;
  score += patternScore * 5;

  // Bonus for multiple indicators
  const totalMatches = Object.values(matches).reduce((a, b) => a + b, 0);
  if (totalMatches >= 3) score += 10;
  if (totalMatches >= 5) score += 10;

  // Check for question patterns common in coding queries
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes('how to') || lowerQuery.includes('how do i')) {
    if (totalMatches > 0) score += 5; // Boost if it's a "how to" with code keywords
  }

  // Negative indicators (reduce score for non-code queries)
  const nonCodeKeywords = [
    'weather',
    'game',
    'score',
    'team',
    'player',
    'movie',
    'song',
    'recipe',
    'restaurant',
    'hotel',
  ];
  nonCodeKeywords.forEach((keyword) => {
    if (lowerQuery.includes(keyword)) score -= 10;
  });

  // Normalize to 0-1 range
  const confidence = Math.max(0, Math.min(1, score / maxScore));
  return confidence;
}

/**
 * Main classification function - Fast, rule-based approach
 * @param {string} query - The user query to classify
 * @param {Array} history - Optional conversation history for context
 * @returns {Object} - Classification result with isCodeRelated and confidence
 */
export function classifyQuery(query, history = []) {
  if (!query || typeof query !== 'string') {
    return {
      isCodeRelated: false,
      confidence: 0,
      reason: 'Invalid query',
      matches: {},
    };
  }

  // Analyze the query
  const matches = analyzeKeywordMatches(query);
  const patternScore = checkCodePatterns(query);
  const confidence = calculateConfidence(matches, patternScore, query);

  // Determine if it's code-related based on confidence threshold
  const isCodeRelated = confidence >= 0.5;

  console.log(`📊 Query Classification:`);
  console.log(
    `   Query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`
  );
  console.log(`   Code-related: ${isCodeRelated ? 'YES' : 'NO'}`);
  console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
  console.log(`   Matches:`, matches);
  console.log(`   Pattern score: ${patternScore}`);

  return {
    isCodeRelated,
    confidence,
    matches,
    patternScore,
    reason: isCodeRelated
      ? `High code-related confidence (${(confidence * 100).toFixed(1)}%)`
      : `Low code-related confidence (${(confidence * 100).toFixed(1)}%)`,
  };
}

/**
 * Fast classification for simple queries
 * @param {string} query - The user query
 * @returns {Object} - Quick classification result
 */
export function classifyQueryFast(query) {
  const lowerQuery = query.toLowerCase();

  // Quick checks for obvious code queries
  const hasLanguage = PROGRAMMING_LANGUAGES.some((lang) =>
    lowerQuery.includes(lang)
  );
  const hasCodeKeyword = CODE_KEYWORDS.slice(0, 10).some((kw) =>
    lowerQuery.includes(kw)
  );
  const hasCodePattern = /\{|\}|\(\)|=>|function|class|const |let |var /.test(
    query
  );

  if (hasLanguage || (hasCodeKeyword && hasCodePattern)) {
    return {
      isCodeRelated: true,
      confidence: 0.9,
      method: 'fast',
    };
  }

  // If no strong indicators, do full analysis
  return classifyQuery(query);
}

/**
 * Get code query confidence with detailed breakdown
 * @param {string} query - The user query
 * @returns {Object} - Detailed confidence analysis
 */
export function getCodeQueryConfidence(query) {
  const matches = analyzeKeywordMatches(query);
  const patternScore = checkCodePatterns(query);
  const confidence = calculateConfidence(matches, patternScore, query);

  const totalKeywordMatches = Object.values(matches).reduce((a, b) => a + b, 0);

  return {
    isCodeRelated: confidence >= 0.5,
    confidence,
    categories: matches,
    patternScore,
    totalMatches: totalKeywordMatches,
    breakdown: {
      keywordScore: totalKeywordMatches * 5,
      patternScore: patternScore * 5,
      bonusScore: totalKeywordMatches >= 3 ? 10 : 0,
    },
  };
}

/**
 * Check if query is asking for code example
 * @param {string} query - The user query
 * @returns {boolean}
 */
export function isAskingForCodeExample(query) {
  const lowerQuery = query.toLowerCase();
  const codeExamplePhrases = [
    'show me code',
    'give me code',
    'write code',
    'code example',
    'example code',
    'sample code',
    'demonstrate with code',
    'how to implement',
    'how do i code',
    'create a function',
    'write a function',
  ];

  return codeExamplePhrases.some((phrase) => lowerQuery.includes(phrase));
}

/**
 * Writing-related keywords and patterns
 */
const WRITING_KEYWORDS = [
  'write',
  'compose',
  'draft',
  'create',
  'generate',
  'craft',
  'author',
  'essay',
  'article',
  'blog',
  'post',
  'story',
  'letter',
  'email',
  'report',
  'document',
  'paper',
  'proposal',
  'summary',
  'review',
  'description',
  'caption',
  'headline',
  'title',
  'paragraph',
  'content',
  'copy',
  'text',
  'message',
  'script',
  'speech',
  'poem',
  'narrative',
  'biography',
  'resume',
  'cover letter',
];

const WRITING_ACTIONS = [
  'write me',
  'write a',
  'write an',
  'compose a',
  'compose an',
  'draft a',
  'draft an',
  'create a',
  'create an',
  'generate a',
  'generate an',
  'help me write',
  'i need to write',
  'can you write',
  'please write',
  'could you write',
  'would you write',
  'write about',
  'write on',
  'writing about',
];

const CONTENT_TYPES = [
  'essay',
  'article',
  'blog post',
  'story',
  'letter',
  'email',
  'report',
  'document',
  'paper',
  'proposal',
  'summary',
  'review',
  'description',
  'caption',
  'headline',
  'title',
  'paragraph',
  'content',
  'copy',
  'message',
  'script',
  'speech',
  'poem',
];

const WRITING_CONTEXTS = [
  'for social media',
  'for linkedin',
  'for twitter',
  'for facebook',
  'for instagram',
  'for blog',
  'for website',
  'for newsletter',
  'for presentation',
  'for meeting',
  'for client',
  'for boss',
  'professional',
  'formal',
  'informal',
  'casual',
  'creative',
  'persuasive',
  'informative',
  'descriptive',
  'narrative',
];

/**
 * Check if query is asking for writing/content creation (NOT code)
 * @param {string} query - The user query
 * @returns {Object} - Classification result with isWritingRequest and confidence
 */
export function classifyWritingRequest(query) {
  if (!query || typeof query !== 'string') {
    return {
      isWritingRequest: false,
      confidence: 0,
      reason: 'Invalid query',
    };
  }

  const lowerQuery = query.toLowerCase();
  let score = 0;
  const maxScore = 100;

  // Check for writing action phrases (strong indicators)
  let hasWritingAction = false;
  WRITING_ACTIONS.forEach((action) => {
    if (lowerQuery.includes(action)) {
      score += 15;
      hasWritingAction = true;
    }
  });

  // Check for content type mentions
  let contentTypeMatches = 0;
  CONTENT_TYPES.forEach((type) => {
    if (lowerQuery.includes(type)) {
      score += 10;
      contentTypeMatches++;
    }
  });

  // Check for writing keywords
  let writingKeywordMatches = 0;
  WRITING_KEYWORDS.forEach((keyword) => {
    if (lowerQuery.includes(keyword)) {
      score += 5;
      writingKeywordMatches++;
    }
  });

  // Check for writing context
  WRITING_CONTEXTS.forEach((context) => {
    if (lowerQuery.includes(context)) {
      score += 8;
    }
  });

  // IMPORTANT: Check for CODE-RELATED exclusions
  // If it's asking for code/script, it's NOT a writing request
  const codeExclusionKeywords = [
    'javascript',
    'python',
    'java',
    ' code ',
    'function',
    ' script',
    'program',
    ' api ',
    'database',
    'algorithm',
    'debug',
    'compile',
    'node',
    'react',
    'html',
    'css',
    'sql',
    'programming',
  ];

  let hasCodeKeyword = false;
  codeExclusionKeywords.forEach((keyword) => {
    if (lowerQuery.includes(keyword)) {
      hasCodeKeyword = true;
      score -= 30; // Heavy penalty for code keywords
    }
  });

  // Check for code patterns that should exclude writing
  // More specific patterns to avoid false positives with words like "app"
  if (
    /write\s+(a\s+|an\s+)?(script|code|function|program)\b/.test(lowerQuery)
  ) {
    hasCodeKeyword = true;
    score -= 40; // Even heavier penalty for explicit code writing requests
  }

  if (
    /(create|generate|build)\s+(a\s+|an\s+)?(script|code|function|program|api)\b/.test(
      lowerQuery
    )
  ) {
    hasCodeKeyword = true;
    score -= 40;
  }

  // Patterns that strongly suggest writing (not code)
  if (
    /(write|compose|draft)\s+(me\s+)?(a|an)\s+(?!script|code|function|program)/.test(
      lowerQuery
    )
  ) {
    score += 15;
  }

  // "Write me a [something]" where [something] is not code-related
  if (/write\s+me\s+(a|an)\s+\w+/.test(lowerQuery) && !hasCodeKeyword) {
    score += 10;
  }

  // Normalize confidence
  const confidence = Math.max(0, Math.min(1, score / maxScore));

  // Determine if it's a writing request
  // Requirements: High confidence AND has writing action AND no code keywords
  const isWritingRequest =
    confidence >= 0.4 && hasWritingAction && !hasCodeKeyword;

  console.log(`📝 Writing Classification:`);
  console.log(
    `   Query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`
  );
  console.log(`   Writing request: ${isWritingRequest ? 'YES' : 'NO'}`);
  console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
  console.log(`   Has writing action: ${hasWritingAction}`);
  console.log(`   Content types: ${contentTypeMatches}`);
  console.log(`   Writing keywords: ${writingKeywordMatches}`);
  console.log(`   Has code keyword: ${hasCodeKeyword}`);

  return {
    isWritingRequest,
    confidence,
    hasWritingAction,
    contentTypeMatches,
    writingKeywordMatches,
    hasCodeKeyword,
    reason: isWritingRequest
      ? `Writing request detected (${(confidence * 100).toFixed(1)}% confidence)`
      : hasCodeKeyword
        ? 'Code-related request (not writing)'
        : `Not a writing request (${(confidence * 100).toFixed(1)}% confidence)`,
  };
}

/**
 * Classify whether a query is a financial market data request.
 * Returns { isFinancial, confidence, intentType, symbol }
 */
export function classifyFinancialQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isFinancial: false, confidence: 0, intentType: null, symbol: null };
  }

  const intent = detectFinancialIntent(query);

  if (!intent) {
    return { isFinancial: false, confidence: 0, intentType: null, symbol: null };
  }

  // Confidence by intent type
  const confidenceMap = {
    stock: 0.95,
    crypto: 0.95,
    forex: 0.95,
    options: 0.97,
    etf: 0.93,
    macro: 0.90,
    market_status: 0.98,
    indices: 0.92,
    earnings: 0.88,
    news: 0.85,
    // New intent types
    compare: 0.97,
    watchlist: 0.97,
    ipo_calendar: 0.96,
    analyst: 0.94,
    stock_financials: 0.95,
    income_statement: 0.95,
    balance_sheet: 0.95,
    movers: 0.93,
    short_interest: 0.94,
    week52: 0.93,
    dividend: 0.92,
    technical: 0.94,
    sector: 0.91,
    commodity: 0.93,
    index: 0.92,
    market_overview: 0.96,
    market_news: 0.87,
    crypto_overview: 0.94,
    forex_overview: 0.94,
    stock_group: 0.93,
    crypto_technical: 0.94,
    // New intent types — batch 2
    float: 0.95,
    splits: 0.96,
    premarket: 0.97,
    portfolio: 0.98,
    // New intent types — batch 3
    chart: 0.94,
    dividend_calendar: 0.95,
    options_contract: 0.96,
    currency_convert: 0.98,
    // New intent types — batch 4
    market_sentiment: 0.97,
    yield_curve: 0.98,
  };

  const confidence = confidenceMap[intent.type] || 0.80;

  console.log(`💹 Financial Classification:`);
  console.log(`   Intent: ${intent.type} | Symbol: ${intent.symbol || 'N/A'}`);
  console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);

  return {
    isFinancial: true,
    confidence,
    intentType: intent.type,
    symbol: intent.symbol,
  };
}

/**
 * Classify whether a query is a sports betting / real-time odds request.
 * Returns { isSports, confidence, intentType, league }
 * Mirrors classifyFinancialQuery — routes to PredictionData.io RAG.
 */
export function classifySportsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isSports: false, confidence: 0, intentType: null, league: null };
  }

  const intent = detectSportsIntent(query);

  if (!intent) {
    return { isSports: false, confidence: 0, intentType: null, league: null };
  }

  // Confidence by intent type — sports betting data is highly specific
  const confidenceMap = {
    // Core betting intents
    live_odds:         0.98,
    odds:              0.95,
    player_prop:       0.96,
    game_prop:         0.93,
    futures:           0.94,
    schedule:          0.88,
    sgp:               0.97,
    prediction_market: 0.95,
    alt_lines:         0.95,
    period_odds:       0.94,
    // Analysis intents (Phase 6)
    value_bets:        0.98,
    line_movers:       0.97,
    sharp_picks:       0.97,
    best_available:    0.96,
    // Phase 7 intents
    arbitrage:         0.99,  // Very specific, near-certain when detected
    parlay_builder:    0.95,
    matchup:           0.91,
    multi_league:      0.93,
    dfs:               0.97,
    kelly:             0.99,
    clv:               0.98,
  };

  const confidence = confidenceMap[intent.type] || 0.85;

  console.log(`\uD83C\uDFC8 Sports Classification:`);
  console.log(`   Intent: ${intent.type} | League: ${intent.league || 'N/A'}`);
  console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);

  return {
    isSports: true,
    confidence,
    intentType: intent.type,
    league: intent.league,
    playerName: intent.extra?.playerName || null,
    rawExtra: intent.extra || {},
  };
}

/**
 * Classify whether a query is an aviation-related request (flight tracking, routes, airports, etc.)
 * Returns { isAviation, confidence, intentType, flightNumber, departure, arrival, airportCode, registrationNumber, carrier }
 */
export function classifyAviationQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isAviation: false, confidence: 0, intentType: null };
  }

  const intent = detectAviationIntent(query);

  if (!intent) {
    return { isAviation: false, confidence: 0, intentType: null };
  }

  const confidenceMap = {
    flight: 0.98,
    route: 0.96,
    airport: 0.95,
    airplane: 0.94,
    airline: 0.94,
    airport_query: 0.90,
    airline_query: 0.90,
    airplane_query: 0.90,
    general_aviation: 0.85,
    metar_taf: 0.97,
    faa_nas: 0.98,
    notam: 0.97,
    safety_incident: 0.96,
    fuel_planning: 0.98,
    oceanic_track: 0.98,
    noise_curfew: 0.98,
    etops_planner: 0.98,
    passenger_compensation: 0.98,
    volcanic_ash_model: 0.98,
    cargo_hazmat: 0.98,
    jet_stream_shear: 0.98,
  };

  const confidence = confidenceMap[intent.type] || 0.85;

  console.log(`✈️ Aviation Classification:`);
  console.log(`   Intent: ${intent.type} | Info: ${JSON.stringify(intent)}`);
  console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);

  return {
    isAviation: true,
    confidence,
    intentType: intent.type,
    flightNumber: intent.flightNumber || null,
    departure: intent.departure || null,
    arrival: intent.arrival || null,
    airportCode: intent.airportCode || null,
    registrationNumber: intent.registrationNumber || null,
    carrier: intent.carrier || null,
    boardType: intent.boardType || null,
    model: intent.model || null,
    durationHours: intent.durationHours || null,
    trackId: intent.trackId || null,
    departureCode: intent.departureCode || null,
    arrivalCode: intent.arrivalCode || null,
    etaTimeStr: intent.etaTimeStr || null,
    // Phase 8 parameters
    delayMinutes: intent.delayMinutes || null,
    reasonCode: intent.reasonCode || null,
    vaacStationId: intent.vaacStationId || null,
    routePoints: intent.routePoints || null,
    manifestItems: intent.manifestItems || null,
  };
}

/**
 * Classify whether a query is Academic or Research-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isAcademic and confidence
 */
export function classifyAcademicQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isAcademic: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const academicKeywords = [
    'arxiv', 'pubmed', 'ncbi', 'pmid', 'researchgate', 'ieee', 'nature journal',
    'scholar', 'science journal', 'scientific paper', 'research paper', 'clinical trial',
    'clinical consensus', 'meta-analysis', 'peer-reviewed', 'study shows', 'studies show',
    'proven by study', 'scientific evidence', 'empirical research', 'literature review',
    'academic paper', 'academic study', 'recent study', 'journal article', 'consensus on'
  ];

  const matchCount = academicKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isAcademic = matchCount > 0;
  const confidence = isAcademic ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isAcademic) {
    console.log(`🎓 Academic Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isAcademic, confidence };
}

/**
 * Classify whether a query is community Discussion or Review-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isDiscussion and confidence
 */
export function classifyDiscussionQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isDiscussion: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const discussionKeywords = [
    'reddit', 'hackernews', 'hacker news', 'ycombinator', 'quora', 'producthunt',
    'product hunt', 'community review', 'user reviews', 'what do people think',
    'people\'s opinion', 'discussion about', 'forum thread', 'anyone tried',
    'reddit comments', 'quora answer', 'customer review', 'experience with',
    'opinion on', 'reviews of', 'anyone use'
  ];

  const matchCount = discussionKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isDiscussion = matchCount > 0;
  const confidence = isDiscussion ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isDiscussion) {
    console.log(`💬 Discussion Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isDiscussion, confidence };
}

/**
 * Classify whether a query is News-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isNews and confidence
 */
export function classifyNewsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isNews: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const newsKeywords = [
    'news', 'current events', 'monitored articles', 'headlines', 'latest news',
    'news update', 'breaking news', 'recent developments', 'event registry',
    'newsapi', 'sentiment trend', 'press release', 'today\'s news', 'monitored news',
    'what happened today', 'news about'
  ];

  const matchCount = newsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isNews = matchCount > 0;
  const confidence = isNews ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isNews) {
    console.log(`📰 News Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isNews, confidence };
}

/**
 * Classify whether a query is Weather-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isWeather and confidence
 */
export function classifyWeatherQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isWeather: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const weatherKeywords = [
    'weather', 'temperature', 'forecast', 'rainfall', 'snowfall', 'humidity',
    'wind speed', 'barometric pressure', 'meteorological', 'weather.gov', 'noaa',
    'climate change', 'celsius', 'fahrenheit', 'is it raining', 'forecast for'
  ];

  const matchCount = weatherKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isWeather = matchCount > 0;
  const confidence = isWeather ? Math.min(0.95, 0.8 + matchCount * 0.1) : 0;

  if (isWeather) {
    console.log(`☀️ Weather Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isWeather, confidence };
}

/**
 * Classify whether a query is Medical/Health-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isMedical and confidence
 */
export function classifyMedicalQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isMedical: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const medicalKeywords = [
    'health', 'medicine', 'disease', 'symptom', 'drug', 'medication', 'fda',
    'adverse event', 'side effect', 'rxnorm', 'rxcui', 'clinical_trials', 'who gho',
    'healthcare', 'clinician', 'treatment for', 'diagnosis of', 'medical study',
    'nih reporter', 'pathogen', 'clinical trials', 'pharmaceutical'
  ];

  const matchCount = medicalKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isMedical = matchCount > 0;
  const confidence = isMedical ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isMedical) {
    console.log(`⚕️ Medical/Health Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isMedical, confidence };
}

/**
 * Classify whether a query is Food/Nutrition-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isFood and confidence
 */
export function classifyFoodQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isFood: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const foodKeywords = [
    'food', 'nutrition', 'calories', 'ingredients', 'nutrient', 'usda',
    'open food facts', 'recipe', 'diet', 'protein count', 'carb count', 'fat count',
    'barcode lookup', 'food facts', 'how many calories', 'nutritional value'
  ];

  const matchCount = foodKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isFood = matchCount > 0;
  const confidence = isFood ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isFood) {
    console.log(`🍎 Food/Nutrition Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isFood, confidence };
}

/**
 * Classify whether a query is Legal/Court Precedent-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isLegal and confidence
 */
export function classifyLegalQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isLegal: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const legalKeywords = [
    'lawsuit', 'supreme court', 'court case', 'legal precedent', 'docket', 'ruling on',
    'opinion by judge', 'attorney profile', 'plaintiff', 'defendant', 'litigation',
    'appeal court', 'district court', 'harvard caselaw', 'courtlistener', 'court opinion',
    'legal decision', 'judicial ruling', 'legal dispute'
  ];

  const matchCount = legalKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isLegal = matchCount > 0;
  const confidence = isLegal ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isLegal) {
    console.log(`⚖️ Legal Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isLegal, confidence };
}

/**
 * Classify whether a query is Patent/IP-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isPatent and confidence
 */
export function classifyPatentQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isPatent: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const patentKeywords = [
    'patent', 'inventor', 'uspto', 'patent number', 'utility patent', 'design patent',
    'patent application', 'patent claim', 'patentview', 'patentsview', 'patent search',
    'intellectual property', 'claims of patent'
  ];

  const matchCount = patentKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isPatent = matchCount > 0;
  const confidence = isPatent ? Math.min(0.95, 0.8 + matchCount * 0.1) : 0;

  if (isPatent) {
    console.log(`💡 Patent Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isPatent, confidence };
}

/**
 * Classify whether a query is Cybersecurity/Threat Intel-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isSecurity and confidence
 */
export function classifySecurityQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isSecurity: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const securityKeywords = [
    'vulnerability', 'cve-', 'cisa kev', 'nist nvd', 'cybersecurity advisory',
    'exploit in the wild', 'zero-day', 'security patch', 'cvss score', 'cross-site scripting',
    'buffer overflow', 'remote code execution', 'threat intelligence', 'cve lookup'
  ];

  const matchCount = securityKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isSecurity = matchCount > 0;
  const confidence = isSecurity ? Math.min(0.95, 0.8 + matchCount * 0.1) : 0;

  if (isSecurity) {
    console.log(`🔒 Cybersecurity Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isSecurity, confidence };
}

/**
 * Classify whether a query is Government Finance/Spending-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isGovFinance and confidence
 */
export function classifyGovFinanceQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isGovFinance: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const govFinanceKeywords = [
    'national debt', 'treasury securities', 'federal spending', 'government contract award',
    'usaspending', 'federal grants', 'agency budgets', 'government deficit', 'daily debt to the penny',
    'sam.gov', 'award recipient', 'debt limit history', 'treasury balance'
  ];

  const matchCount = govFinanceKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isGovFinance = matchCount > 0;
  const confidence = isGovFinance ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isGovFinance) {
    console.log(`🏛️ Gov Finance Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isGovFinance, confidence };
}

/**
 * Classify whether a query is Real Estate/Building Permit-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isRealEstate and confidence
 */
export function classifyRealEstateQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isRealEstate: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const realEstateKeywords = [
    'building permit', 'residential construction', 'housing permit', 'construction stats',
    'authorized units', 'permit valuations', 'census bps', 'housing starts', 'zillow price',
    'redfin trend', 'real estate trend', 'property value', 'home permit'
  ];

  const matchCount = realEstateKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isRealEstate = matchCount > 0;
  const confidence = isRealEstate ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isRealEstate) {
    console.log(`🏢 Real Estate Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isRealEstate, confidence };
}

/**
 * Classify whether a query is Macroeconomics/Development-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isEconomics and confidence
 */
export function classifyEconomicsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isEconomics: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const economicsKeywords = [
    'gdp growth', 'poverty rate', 'inflation rate index', 'unemployment statistics',
    'import export trade', 'dbnomics', 'world bank indicator', 'economic output',
    'cpi index', 'ppi index', 'balance of trade', 'trade deficit', 'consumer price index'
  ];

  const matchCount = economicsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isEconomics = matchCount > 0;
  const confidence = isEconomics ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isEconomics) {
    console.log(`📊 Macroeconomics Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isEconomics, confidence };
}

/**
 * Classify whether a query is Biology/Genomics-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isBiology and confidence
 */
export function classifyBiologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isBiology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const biologyKeywords = [
    'uniprot', 'ensembl', 'gnomad', 'clinvar', 'rsid', 'gene expression', 'alphafold',
    'amino acid', 'pdb', 'genomics', 'chromatin', 'histone', 'transcription factor',
    'protein sequence', 'biological process', 'molecular function', 'cellular component'
  ];

  const matchCount = biologyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isBiology = matchCount > 0;
  const confidence = isBiology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isBiology) {
    console.log(`🧬 Biology Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isBiology, confidence };
}

/**
 * Classify whether a query is Entertainment-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isEntertainment and confidence
 */
export function classifyEntertainmentQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isEntertainment: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const entertainmentKeywords = [
    'movie', 'tv show', 'cast', 'song', 'album', 'imdb', 'rotten tomatoes',
    'box office', 'billboard chart', 'netflix series', 'actor', 'actress',
    'concert tour', 'film review'
  ];

  const matchCount = entertainmentKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isEntertainment = matchCount > 0;
  const confidence = isEntertainment ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isEntertainment) {
    console.log(`🎬 Entertainment Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isEntertainment, confidence };
}

/**
 * Classify whether a query is Travel-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isTravel and confidence
 */
export function classifyTravelQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isTravel: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const travelKeywords = [
    'hotel', 'airbnb', 'flight ticket', 'booking.com', 'tripadvisor', 'itinerary',
    'travel guide', 'tourist sight', 'vacation rental', 'flight booking', 'sightseeing'
  ];

  const matchCount = travelKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isTravel = matchCount > 0;
  const confidence = isTravel ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isTravel) {
    console.log(`✈️ Travel Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isTravel, confidence };
}

/**
 * Classify whether a query is Shopping-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isShopping and confidence
 */
export function classifyShoppingQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isShopping: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const shoppingKeywords = [
    'buy', 'price of', 'discount code', 'amazon deal', 'bestbuy', 'ebay deal',
    'walmart deal', 'specs of', 'review of product', 'purchasing', 'coupon code'
  ];

  const matchCount = shoppingKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isShopping = matchCount > 0;
  const confidence = isShopping ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isShopping) {
    console.log(`🛍️ Shopping Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isShopping, confidence };
}

/**
 * Classify whether a query is Career/Job-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isCareer and confidence
 */
export function classifyCareerQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isCareer: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const careerKeywords = [
    'job opening', 'hiring', 'salary range', 'resume', 'glassdoor', 'indeed job',
    'ziprecruiter', 'salary benchmark', 'interview prep', 'interview questions', 'career path'
  ];

  const matchCount = careerKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isCareer = matchCount > 0;
  const confidence = isCareer ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isCareer) {
    console.log(`💼 Career Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isCareer, confidence };
}

/**
 * Classify whether a query is Automotive-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isAutomotive and confidence
 */
export function classifyAutomotiveQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isAutomotive: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const automotiveKeywords = [
    'car review', 'electric vehicle', 'mpg', 'tesla price', 'kbb', 'edmunds',
    'motortrend', 'caranddriver', 'horsepower', 'fuel efficiency', 'reliability index'
  ];

  const matchCount = automotiveKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isAutomotive = matchCount > 0;
  const confidence = isAutomotive ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isAutomotive) {
    console.log(`🚗 Automotive Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isAutomotive, confidence };
}

/**
 * Classify whether a query is Esports/Gaming-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isGaming and confidence
 */
export function classifyGamingQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isGaming: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const gamingKeywords = [
    'esports team', 'twitch schedule', 'tournament bracket', 'walkthrough', 'game review',
    'ign', 'gamespot', 'twitch.tv', 'steampowered', 'liquipedia', 'patch notes',
    'playstation', 'nintendo switch', 'xbox series', 'pc gaming', 'steam link'
  ];

  const matchCount = gamingKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isGaming = matchCount > 0;
  const confidence = isGaming ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isGaming) {
    console.log(`🎮 Gaming/Esports Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isGaming, confidence };
}

/**
 * Classify whether a query is Environment/Energy-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isEnvironment and confidence
 */
export function classifyEnvironmentQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isEnvironment: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const environmentKeywords = [
    'epa compliance', 'greenhouse emissions', 'epa echo', 'solar grid', 'wind capacity',
    'usgs earthquake', 'carbon footprint', 'renewable energy', 'electric grid',
    'nrel.gov', 'environmental quality', 'climate index', 'climate change'
  ];

  const matchCount = environmentKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isEnvironment = matchCount > 0;
  const confidence = isEnvironment ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isEnvironment) {
    console.log(`🌱 Environment Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isEnvironment, confidence };
}

/**
 * Classify whether a query is Local Services/Dining-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isLocal and confidence
 */
export function classifyLocalQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isLocal: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const localKeywords = [
    'restaurant table', 'yelp review', 'dentist near me', 'electrician', 'plumber near',
    'home renovation', 'opentable', 'foursquare', 'yellowpages', 'local business',
    'handyman', 'mechanic shop', 'hair salon'
  ];

  const matchCount = localKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isLocal = matchCount > 0;
  const confidence = isLocal ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isLocal) {
    console.log(`📍 Local Services Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isLocal, confidence };
}

/**
 * Classify whether a query is Parenting/Education-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isEducation and confidence
 */
export function classifyEducationQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isEducation: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const educationKeywords = [
    'study guide', 'khan academy', 'edx course', 'greatschools', 'school rankings',
    'niche rating', 'coursera', 'parenting advice', 'math tutoring', 'curriculum standards',
    'academic syllabus', 'higher education'
  ];

  const matchCount = educationKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isEducation = matchCount > 0;
  const confidence = isEducation ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isEducation) {
    console.log(`📚 Education/Parenting Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isEducation, confidence };
}

/**
 * Classify whether a query is DIY/Gardening-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isDIY and confidence
 */
export function classifyDIYQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isDIY: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const diyKeywords = [
    'diy guide', 'planting schedule', 'soil mix', 'wood cabinets', 'homedepot',
    'lowes tools', 'instructables', 'houzz design', 'vegetable sowing', 'backyard deck',
    'home repair', 'gardening calendar'
  ];

  const matchCount = diyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isDIY = matchCount > 0;
  const confidence = isDIY ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isDIY) {
    console.log(`🛠️ DIY/Gardening Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isDIY, confidence };
}

/**
 * Classify whether a query is Space/Aviation-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isSpaceAviation and confidence
 */
export function classifySpaceAviationQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isSpaceAviation: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const spaceAviationKeywords = [
    'flight delay', 'faa ground stop', 'tail registration', 'spacex launch', 'nasa mission',
    'oceanic route', 'jet stream turbulence', 'airport status board', 'aviation weather report',
    'metar forecast', 'active notam', 'airspace curfew'
  ];

  const matchCount = spaceAviationKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isSpaceAviation = matchCount > 0;
  const confidence = isSpaceAviation ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isSpaceAviation) {
    console.log(`🚀 Space/Aviation Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isSpaceAviation, confidence };
}

/**
 * Classify whether a query is History/Genealogy-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isHistory and confidence
 */
export function classifyHistoryQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isHistory: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const historyKeywords = [
    'historical archive', 'genealogy lookup', 'family tree record', 'census record',
    'ancient civilization', 'roman empire', 'military history', 'historical document',
    'ancestry record', 'library of congress', 'smithsonian archive', 'middle ages'
  ];

  const matchCount = historyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isHistory = matchCount > 0;
  const confidence = isHistory ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isHistory) {
    console.log(`📜 History/Genealogy Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isHistory, confidence };
}

/**
 * Classify whether a query is Art/Design/Fashion-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isArtDesign and confidence
 */
export function classifyArtDesignQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isArtDesign: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const artDesignKeywords = [
    'behance portfolio', 'dribbble shot', 'graphic design', 'ui/ux layout', 'fashion week',
    'metropolitan museum', 'moma exhibit', 'architecture design', 'pantone color',
    'typography font', 'modern art trend', 'couture runway'
  ];

  const matchCount = artDesignKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isArtDesign = matchCount > 0;
  const confidence = isArtDesign ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isArtDesign) {
    console.log(`🎨 Art/Design/Fashion Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isArtDesign, confidence };
}

/**
 * Classify whether a query is Philosophy/Religion-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isPhilosophy and confidence
 */
export function classifyPhilosophyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isPhilosophy: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const philosophyKeywords = [
    'stanford encyclopedia', 'philosophy entry', 'ethics theory', 'existentialism',
    'religious scripture', 'theological study', 'philosophical debate', 'bible commentary',
    'quran verse', 'stoicism concepts', 'epistemology', 'metaphysics'
  ];

  const matchCount = philosophyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isPhilosophy = matchCount > 0;
  const confidence = isPhilosophy ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isPhilosophy) {
    console.log(`🧠 Philosophy/Religion Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isPhilosophy, confidence };
}

/**
 * Classify whether a query is Music/Audio Production-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isMusic and confidence
 */
export function classifyMusicQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isMusic: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const musicKeywords = [
    'guitar tab', 'lyrics lookup', 'daw synth', 'audio interface gear', 'synthesizer review',
    'genius lyrics', 'ultimate guitar chords', 'musicradar review', 'soundonsound review',
    'midi controller', 'vocal processing', 'vinyl discogs'
  ];

  const matchCount = musicKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isMusic = matchCount > 0;
  const confidence = isMusic ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isMusic) {
    console.log(`🎵 Music/Audio Production Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isMusic, confidence };
}

/**
 * Classify whether a query is Pets/Animals-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isPets and confidence
 */
export function classifyPetsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isPets: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const petsKeywords = [
    'dog training', 'cat health', 'petmd symptom', 'veterinary guide', 'animal breed profile',
    'puppy nutrition', 'akc registration', 'feline care', 'raw pet food', 'pet poison control',
    'exotic pet care', 'avian vet'
  ];

  const matchCount = petsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isPets = matchCount > 0;
  const confidence = isPets ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isPets) {
    console.log(`🐾 Pets/Animals Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isPets, confidence };
}

/**
 * Classify whether a query is Geopolitics/Defense-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isGeopolitics and confidence
 */
export function classifyGeopoliticsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isGeopolitics: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const geopoliticsKeywords = [
    'defense policy', 'military doctrine', 'geopolitical conflict', 'foreign relations board',
    'janes defense', 'militarytimes news', 'security council resolution', 'arms control agreement',
    'diplomatic treaty', 'strategic deterrence', 'defense news bulletin', 'pentagon contract'
  ];

  const matchCount = geopoliticsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isGeopolitics = matchCount > 0;
  const confidence = isGeopolitics ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isGeopolitics) {
    console.log(`🗺️ Geopolitics/Defense Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isGeopolitics, confidence };
}

/**
 * Classify whether a query is Architecture/Engineering-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isArchitecture and confidence
 */
export function classifyArchitectureQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isArchitecture: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const architectureKeywords = [
    'architectural blueprint', 'skyscraper construction', 'structural engineering', 'civil engineering',
    'building code compliance', 'hvac design specs', 'cad schematic', 'bridge design',
    'urban planning layout', 'asce standards', 'building code icc', 'green architecture'
  ];

  const matchCount = architectureKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isArchitecture = matchCount > 0;
  const confidence = isArchitecture ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isArchitecture) {
    console.log(`🏗️ Architecture/Engineering Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isArchitecture, confidence };
}

/**
 * Classify whether a query is Agriculture/Agronomy-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isAgriculture and confidence
 */
export function classifyAgricultureQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isAgriculture: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const agricultureKeywords = [
    'crop cultivation', 'crop yield stats', 'agronomy method', 'organic farming soil',
    'agricultural policy', 'crop rotation cycle', 'farm harvest schedule', 'pest management agronomy',
    'fao agriculture report', 'livestock breeding husbandry', 'fertilizer ratio crop'
  ];

  const matchCount = agricultureKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isAgriculture = matchCount > 0;
  const confidence = isAgriculture ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isAgriculture) {
    console.log(`🌾 Agriculture/Agronomy Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isAgriculture, confidence };
}

/**
 * Classify whether a query is Chemistry/Materials Science-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isChemistry and confidence
 */
export function classifyChemistryQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isChemistry: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const chemistryKeywords = [
    'chemical compound', 'molecular synthesis', 'materials science lab', 'metallurgy formula',
    'pubchem lookup', 'chemspider compound', 'organic molecular chemistry', 'material structural testing',
    'chemical formula reaction', 'catalyst reaction speed', 'covalent ionic bonding'
  ];

  const matchCount = chemistryKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isChemistry = matchCount > 0;
  const confidence = isChemistry ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isChemistry) {
    console.log(`🧪 Chemistry/Materials Science Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isChemistry, confidence };
}

/**
 * Classify whether a query is Hobbies/Collectibles-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isHobbies and confidence
 */
export function classifyHobbiesQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isHobbies: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const hobbiesKeywords = [
    'boardgamegeek rating', 'tcgplayer card', 'psacard grading', 'camera aperture dpreview',
    'coin collecting value', 'stamp collection inventory', 'scale modeling kit', 'trading card game',
    'photography settings manual', 'board game strategy geek'
  ];

  const matchCount = hobbiesKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isHobbies = matchCount > 0;
  const confidence = isHobbies ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isHobbies) {
    console.log(`🎲 Hobbies/Collectibles Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isHobbies, confidence };
}

/**
 * Classify whether a query is Maritime/Logistics-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isLogistics and confidence
 */
export function classifyLogisticsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isLogistics: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const logisticsKeywords = [
    'maritime', 'container shipping', 'freight forwarding', 'freight route',
    'port schedule', 'cargo vessel', 'freightwaves', 'supply chain', 'logistics',
    'shipping cargo', 'container ship', 'ocean freight', 'customs clearance'
  ];

  const matchCount = logisticsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isLogistics = matchCount > 0;
  const confidence = isLogistics ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isLogistics) {
    console.log(`🚢 Maritime/Logistics Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isLogistics, confidence };
}

/**
 * Classify whether a query is Personal Finance/Taxation-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isPersonalFinance and confidence
 */
export function classifyPersonalFinanceQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isPersonalFinance: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const personalFinanceKeywords = [
    'standard deduction irs', 'roth ira contribution limit', 'credit score factor', 'nerdwallet review comparison',
    '401k plan limit', 'tax bracket calculator', 'high yield savings rate', 'refinance mortgage calculator',
    'personal budget envelope', 'filing tax return form'
  ];

  const matchCount = personalFinanceKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isPersonalFinance = matchCount > 0;
  const confidence = isPersonalFinance ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isPersonalFinance) {
    console.log(`💵 Personal Finance/Taxation Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isPersonalFinance, confidence };
}

/**
 * Classify whether a query is Cryptocurrency/Blockchain-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isCrypto and confidence
 */
export function classifyCryptoQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isCrypto: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const cryptoKeywords = [
    'bitcoin', 'ethereum', 'solana', 'crypto price', 'blockchain', 'defi protocol',
    'smart contract', 'tokenomics', 'web3 app', 'crypto wallet', 'gas fee',
    'coingecko', 'coinmarketcap', 'etherscan', 'uniswap', 'layer 2 blockchain'
  ];

  const matchCount = cryptoKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isCrypto = matchCount > 0;
  const confidence = isCrypto ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isCrypto) {
    console.log(`🪙 Crypto/Blockchain Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isCrypto, confidence };
}

/**
 * Classify whether a query is Fitness/Exercise-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isFitness and confidence
 */
export function classifyFitnessQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isFitness: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const fitnessKeywords = [
    'workout routine', 'cardio exercise', 'bodybuilding routine', 'muscle building',
    'weightlifting', 'crossfit training', 'fitness exercise', 'runnersworld',
    'strength training', 'calorie target fitness', 'hypertrophy program', 'progressive overload gym'
  ];

  const matchCount = fitnessKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isFitness = matchCount > 0;
  const confidence = isFitness ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isFitness) {
    console.log(`💪 Fitness/Exercise Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isFitness, confidence };
}

/**
 * Classify whether a query is Psychology/Cognitive Science-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isPsychology and confidence
 */
export function classifyPsychologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isPsychology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const psychologyKeywords = [
    'cognitive behavioral', 'cbt therapy', 'mental health psychology', 'psychological study',
    'brain anatomy cognitive', 'neuroscience brain', 'existential therapy', 'personality trait psychology',
    'apa guidelines psychology', 'psychology today', 'cognitive dissonance paradigm'
  ];

  const matchCount = psychologyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isPsychology = matchCount > 0;
  const confidence = isPsychology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isPsychology) {
    console.log(`🧠 Psychology/Cognitive Science Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isPsychology, confidence };
}

/**
 * Classify whether a query is Insurance/Risk Management-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isInsurance and confidence
 */
export function classifyInsuranceQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isInsurance: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const insuranceKeywords = [
    'life insurance premium', 'health insurance deductible', 'auto insurance policy', 'homeowners insurance claim',
    'actuarial table', 'underwriter guideline', 'copay coverage insurance', 'liability coverage auto',
    'medicare coverage plan', 'insurance deductible calculator'
  ];

  const matchCount = insuranceKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isInsurance = matchCount > 0;
  const confidence = isInsurance ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isInsurance) {
    console.log(`🛡️ Insurance/Risk Management Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isInsurance, confidence };
}

/**
 * Classify whether a query is Manufacturing/Robotics-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isRobotics and confidence
 */
export function classifyRoboticsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isRobotics: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const roboticsKeywords = [
    'industrial automation', 'cnc machining tool', '3d printing filament', 'plc programming automation',
    'robotic arm kinematics', 'controlglobal', 'machinedesign', 'manufacturing factory automation',
    'robotic sensor lidar', 'robotic kinematics model'
  ];

  const matchCount = roboticsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isRobotics = matchCount > 0;
  const confidence = isRobotics ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isRobotics) {
    console.log(`🤖 Manufacturing & Robotics Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isRobotics, confidence };
}

/**
 * Classify whether a query is Event Ticketing/Live Shows-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isTicketing and confidence
 */
export function classifyTicketingQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isTicketing: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const ticketingKeywords = [
    'ticketmaster booking', 'stubhub concert', 'seatgeek discount ticket', 'broadway musical ticket',
    'livenation tour dates', 'theater ticket reservation', 'live show tickets', 'concert tour dates schedule'
  ];

  const matchCount = ticketingKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isTicketing = matchCount > 0;
  const confidence = isTicketing ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isTicketing) {
    console.log(`🎟️ Event Ticketing & Live Shows Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isTicketing, confidence };
}

/**
 * Classify whether a query is Astronomy/Astrophysics-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isAstronomy and confidence
 */
export function classifyAstronomyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isAstronomy: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const astronomyKeywords = [
    'james webb telescope', 'hubble space telescope', 'stellar evolution', 'exoplanet discovery',
    'black hole horizon', 'nasa apod', 'astrophysics journal', 'cosmological constant',
    'solar flare forecast', 'galaxy cluster redshift'
  ];

  const matchCount = astronomyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isAstronomy = matchCount > 0;
  const confidence = isAstronomy ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isAstronomy) {
    console.log(`🌌 Astronomy & Astrophysics Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isAstronomy, confidence };
}

/**
 * Classify whether a query is Anthropology/Archaeology-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isAnthropology and confidence
 */
export function classifyAnthropologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isAnthropology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const anthropologyKeywords = [
    'radiocarbon dating', 'archaeological excavation', 'ancient civilization empire', 'fossil hominid',
    'hominin evolutionary tree', 'bronze age collapse', 'mesopotamian cuneiform', 'egyptian hieroglyph decoding',
    'cultural anthropology ethnography'
  ];

  const matchCount = anthropologyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isAnthropology = matchCount > 0;
  const confidence = isAnthropology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isAnthropology) {
    console.log(`🏺 Anthropology & Archaeology Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isAnthropology, confidence };
}

/**
 * Classify whether a query is Linguistics/Etymology-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isLinguistics and confidence
 */
export function classifyLinguisticsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isLinguistics: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const linguisticsKeywords = [
    'phonetic transcription ipa', 'syntax tree linguistics', 'language family origin', 'etymological dictionary origin',
    'proto indo european reconstruction', 'morphological analysis grammar', 'semitic language root', 'chomsky generative grammar'
  ];

  const matchCount = linguisticsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isLinguistics = matchCount > 0;
  const confidence = isLinguistics ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isLinguistics) {
    console.log(`🗣️ Linguistics & Etymology Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isLinguistics, confidence };
}

/**
 * Classify whether a query is Pediatrics/Childcare-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isPediatrics and confidence
 */
export function classifyPediatricsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isPediatrics: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const pediatricsKeywords = [
    'baby sleep training schedule', 'pediatric milestones chart', 'toddler developmental stages', 'aap immunization schedule',
    'infant solid food introduction', 'child nutrition guide pediatric', 'breastfeeding guidelines infant', 'colic remedy baby'
  ];

  const matchCount = pediatricsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isPediatrics = matchCount > 0;
  const confidence = isPediatrics ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isPediatrics) {
    console.log(`👶 Pediatrics & Childcare Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isPediatrics, confidence };
}

/**
 * Classify whether a query is Renewable Energy/Sustainability-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isSustainability and confidence
 */
export function classifySustainabilityQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isSustainability: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const sustainabilityKeywords = [
    'wind turbine efficiency', 'photovoltaic solar panel efficiency', 'circular economy waste', 'green hydrogen fuel cell',
    'carbon capture sequestration', 'geothermal heating system grid', 'smart grid integration battery', 'sustainable energy tech transition'
  ];

  const matchCount = sustainabilityKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isSustainability = matchCount > 0;
  const confidence = isSustainability ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isSustainability) {
    console.log(`♻️ Renewable Energy & Sustainability Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isSustainability, confidence };
}

/**
 * Classify whether a query is Wholesale Sourcing/Dropshipping-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isDropshipping and confidence
 */
export function classifyDropshippingQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isDropshipping: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const dropshippingKeywords = [
    'dropshipping supplier directory', 'wholesale product sourcing', 'alibaba manufacturing RFQ', 'shopify store fulfillment',
    'e-commerce private label', 'third party logistics 3pl fulfillment', 'wholesale distributor wholesale', 'dropship supplier verified'
  ];

  const matchCount = dropshippingKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isDropshipping = matchCount > 0;
  const confidence = isDropshipping ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isDropshipping) {
    console.log(`📦 Wholesale Sourcing & Dropshipping Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isDropshipping, confidence };
}

/**
 * Classify whether a query is Civil Law & Torts-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isCivilLaw and confidence
 */
export function classifyCivilLawQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isCivilLaw: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const civilLawKeywords = [
    'negligence liability', 'personal injury lawsuit', 'breach of contract tort', 'easement property dispute',
    'defamation libel slander', 'civil litigation court', 'tortfeasor liability legal'
  ];

  const matchCount = civilLawKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isCivilLaw = matchCount > 0;
  const confidence = isCivilLaw ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isCivilLaw) {
    console.log(`⚖️ Civil Law & Torts Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isCivilLaw, confidence };
}

/**
 * Classify whether a query is Pedagogy & Instructional Design-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isPedagogy and confidence
 */
export function classifyPedagogyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isPedagogy: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const pedagogyKeywords = [
    "bloom's taxonomy learning", 'addie design model', 'differentiated learning instruction', 'curriculum design framework',
    'classroom management pedagogy', 'active learning strategy'
  ];

  const matchCount = pedagogyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isPedagogy = matchCount > 0;
  const confidence = isPedagogy ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isPedagogy) {
    console.log(`🍎 Pedagogy & Instructional Design Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isPedagogy, confidence };
}

/**
 * Classify whether a query is Veterinary Medicine & Pathology-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isVeterinary and confidence
 */
export function classifyVeterinaryQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isVeterinary: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const veterinaryKeywords = [
    'canine clinical pathology', 'zoonotic disease transmission', 'equine colic veterinary', 'veterinary pharmacology dosage',
    'feline infectious pathology', 'veterinary radiology scan'
  ];

  const matchCount = veterinaryKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isVeterinary = matchCount > 0;
  const confidence = isVeterinary ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isVeterinary) {
    console.log(`🐾 Veterinary Medicine & Pathology Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isVeterinary, confidence };
}

/**
 * Classify whether a query is Meteorology & Synoptic Forecasting-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isMeteorology and confidence
 */
export function classifyMeteorologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isMeteorology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const meteorologyKeywords = [
    'baroclinic instability synoptic', 'isobar weather chart', 'cyclogenesis model weather', 'doppler radar storm',
    'atmospheric sounding thermodynamic', 'mesoscale storm convective'
  ];

  const matchCount = meteorologyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isMeteorology = matchCount > 0;
  const confidence = isMeteorology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isMeteorology) {
    console.log(`⛈️ Meteorology & Synoptic Forecasting Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isMeteorology, confidence };
}

/**
 * Classify whether a query is Urban Planning & GIS-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isUrbanPlanning and confidence
 */
export function classifyUrbanPlanningQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isUrbanPlanning: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const urbanPlanningKeywords = [
    'transit oriented development', 'gis spatial mapping', 'zoning ordinance density', 'heat island mitigation urban',
    'walkability index pedestrian', 'land use classification index'
  ];

  const matchCount = urbanPlanningKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isUrbanPlanning = matchCount > 0;
  const confidence = isUrbanPlanning ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isUrbanPlanning) {
    console.log(`🗺️ Urban Planning & GIS Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isUrbanPlanning, confidence };
}

/**
 * Classify whether a query is Molecular Gastronomy & Food Chemistry-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isFoodChemistry and confidence
 */
export function classifyFoodChemistryQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isFoodChemistry: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const foodChemistryKeywords = [
    'spherification molecular gastronomy', 'sous vide cooking chemistry', 'hydrocolloid agar recipe', 'maillard reaction chemistry',
    'food chemical composition', 'sodium alginate spherification'
  ];

  const matchCount = foodChemistryKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isFoodChemistry = matchCount > 0;
  const confidence = isFoodChemistry ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isFoodChemistry) {
    console.log(`🍳 Molecular Gastronomy & Food Chemistry Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isFoodChemistry, confidence };
}

/**
 * Classify whether a query is Marine Biology & Oceanography-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isMarineBiology and confidence
 */
export function classifyMarineBiologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isMarineBiology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const marineBiologyKeywords = [
    'abyssal zone', 'coral bleaching', 'hydrothermal vent', 'marine trophic',
    'phytoplankton bloom', 'benthic organism', 'marine biology', 'oceanography'
  ];

  const matchCount = marineBiologyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isMarineBiology = matchCount > 0;
  const confidence = isMarineBiology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isMarineBiology) {
    console.log(`🐳 Marine Biology & Oceanography Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isMarineBiology, confidence };
}

/**
 * Classify whether a query is Theoretical Physics & Quantum Mechanics-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isTheoreticalPhysics and confidence
 */
export function classifyTheoreticalPhysicsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isTheoreticalPhysics: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const physicsKeywords = [
    'quantum entanglement', 'supersymmetry', 'supersymmetric', 'string theory', 'bose einstein', 'bose-einstein',
    'quantum superposition', 'hilbert space', 'hadron collider', 'theoretical physics', 'quantum mechanics'
  ];

  const matchCount = physicsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isTheoreticalPhysics = matchCount > 0;
  const confidence = isTheoreticalPhysics ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isTheoreticalPhysics) {
    console.log(`⚛️ Theoretical Physics & Quantum Mechanics Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isTheoreticalPhysics, confidence };
}

/**
 * Classify whether a query is Paleontology & Evolutionary Biology-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isPaleontology and confidence
 */
export function classifyPaleontologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isPaleontology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const paleontologyKeywords = [
    'fossil record', 'mesozoic fauna', 'dinosaur fossil', 'theropod',
    'speciation cladistics', 'phylogenetic tree', 'cladogram', 'stratigraphic fossil', 'paleontology'
  ];

  const matchCount = paleontologyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isPaleontology = matchCount > 0;
  const confidence = isPaleontology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isPaleontology) {
    console.log(`🦕 Paleontology & Evolutionary Biology Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isPaleontology, confidence };
}

/**
 * Classify whether a query is Biomedical Engineering & Prosthetics-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isBiomedical and confidence
 */
export function classifyBiomedicalQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isBiomedical: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const biomedicalKeywords = [
    'biocompatible', 'myoelectric', 'tissue engineering', 'biomechanical',
    'neural interface', 'biosensor', 'prosthesis', 'prosthetic'
  ];

  const matchCount = biomedicalKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isBiomedical = matchCount > 0;
  const confidence = isBiomedical ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isBiomedical) {
    console.log(`🦾 Biomedical Engineering & Prosthetics Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isBiomedical, confidence };
}

/**
 * Classify whether a query is Climatology & Paleoclimatology-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isClimatology and confidence
 */
export function classifyClimatologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isClimatology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const climatologyKeywords = [
    'milankovitch', 'ice core', 'carbon cycle', 'ipcc emission',
    'temperature anomaly', 'climatology', 'paleoclimatology'
  ];

  const matchCount = climatologyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isClimatology = matchCount > 0;
  const confidence = isClimatology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isClimatology) {
    console.log(`🌍 Climatology & Paleoclimatology Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isClimatology, confidence };
}

/**
 * Classify whether a query is Neurotechnology & BCI-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isNeurotech and confidence
 */
export function classifyNeurotechQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isNeurotech: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const neurotechKeywords = [
    'eeg signal', 'motor imagery', 'neural implant', 'electrocorticography',
    'ecog', 'neurostimulation', 'closed loop neuro', 'neurotech', 'brain computer interface', 'brain-computer interface'
  ];

  const matchCount = neurotechKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isNeurotech = matchCount > 0;
  const confidence = isNeurotech ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isNeurotech) {
    console.log(`🧠 Neurotechnology & BCI Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isNeurotech, confidence };
}

/**
 * Classify whether a query is Astrobiology & Planetary Habitability-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isAstrobiology and confidence
 */
export function classifyAstrobiologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isAstrobiology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const astrobiologyKeywords = [
    'astrobiology', 'biosignature', 'extremophile', 'prebiotic chemistry',
    'planetary habitability', 'habitable zone', 'panspermia'
  ];

  const matchCount = astrobiologyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isAstrobiology = matchCount > 0;
  const confidence = isAstrobiology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isAstrobiology) {
    console.log(`🌌 Astrobiology & Planetary Habitability Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isAstrobiology, confidence };
}

/**
 * Classify whether a query is Nanotechnology & Nanomaterials-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isNanotech and confidence
 */
export function classifyNanotechQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isNanotech: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const nanotechKeywords = [
    'nanotechnology', 'nanomaterial', 'graphene', 'carbon nanotube',
    'nanolithography', 'quantum dot', 'self assembly', 'nanocomposite'
  ];

  const matchCount = nanotechKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isNanotech = matchCount > 0;
  const confidence = isNanotech ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isNanotech) {
    console.log(`🔬 Nanotechnology & Nanomaterials Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isNanotech, confidence };
}

/**
 * Classify whether a query is Nuclear Engineering & Fusion Technology-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isNuclear and confidence
 */
export function classifyNuclearQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isNuclear: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const nuclearKeywords = [
    'nuclear engineering', 'nuclear fusion', 'tokamak', 'stellarator',
    'inertial confinement', 'neutronics', 'transmutation', 'heavy water reactor'
  ];

  const matchCount = nuclearKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isNuclear = matchCount > 0;
  const confidence = isNuclear ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isNuclear) {
    console.log(`⚛️ Nuclear Engineering & Fusion Technology Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isNuclear, confidence };
}

/**
 * Classify whether a query is Genetics & CRISPR Gene Editing-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isGenetics and confidence
 */
export function classifyGeneticsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isGenetics: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const geneticsKeywords = [
    'crispr', 'cas9', 'cas12', 'gene editing', 'base editing',
    'prime editing', 'guide rna', 'off target mutation', 'gene drive', 'genomic vector'
  ];

  const matchCount = geneticsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isGenetics = matchCount > 0;
  const confidence = isGenetics ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isGenetics) {
    console.log(`🧬 Genetics & CRISPR Gene Editing Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isGenetics, confidence };
}

/**
 * Classify whether a query is Venture Capital & Startup Finance-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isVentureCapital and confidence
 */
export function classifyVentureCapitalQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isVentureCapital: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const vcKeywords = [
    'venture capital', 'startup finance', 'liquidation preference', 'anti dilution',
    'cap table', 'term sheet round', 'funding waterfall', 'growth equity'
  ];

  const matchCount = vcKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isVentureCapital = matchCount > 0;
  const confidence = isVentureCapital ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isVentureCapital) {
    console.log(`💼 Venture Capital & Startup Finance Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isVentureCapital, confidence };
}

/**
 * Classify whether a query is Digital Humanities & Cultural Heritage-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isDigitalHumanities and confidence
 */
export function classifyDigitalHumanitiesQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isDigitalHumanities: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const dhKeywords = [
    'digital humanities', 'stylometry', 'text mining corpus', 'manuscript digitization',
    'photogrammetry curation', 'cultural heritage archive'
  ];

  const matchCount = dhKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isDigitalHumanities = matchCount > 0;
  const confidence = isDigitalHumanities ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isDigitalHumanities) {
    console.log(`📜 Digital Humanities & Cultural Heritage Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isDigitalHumanities, confidence };
}

/**
 * Classify whether a query is Virology & Immunology-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isVirology and confidence
 */
export function classifyVirologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isVirology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const virologyKeywords = [
    'virology', 'immunology', 'viral replication', 'antigenic drift',
    'antigenic shift', 'cytokine storm', 'monoclonal antibody', 'vaccine vector'
  ];

  const matchCount = virologyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isVirology = matchCount > 0;
  const confidence = isVirology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isVirology) {
    console.log(`🦠 Virology & Immunology Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isVirology, confidence };
}

/**
 * Classify whether a query is Quantum Computing & Information-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isQuantumComputing and confidence
 */
export function classifyQuantumComputingQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isQuantumComputing: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const qcKeywords = [
    'quantum computing', 'qubit', 'bloch sphere', 'quantum gate', 'hadamard',
    'cnot', 'shor\'s algorithm', 'grover\'s algorithm', 'quantum error correction'
  ];

  const matchCount = qcKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isQuantumComputing = matchCount > 0;
  const confidence = isQuantumComputing ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isQuantumComputing) {
    console.log(`💻 Quantum Computing & Information Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isQuantumComputing, confidence };
}

/**
 * Classify whether a query is Materials Science & Metallurgy-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isMetallurgy and confidence
 */
export function classifyMetallurgyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isMetallurgy: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const metallurgyKeywords = [
    'materials science', 'metallurgy', 'crystalline lattice', 'phase diagram',
    'superalloy', 'scanning electron microscopy', 'sem image', 'x-ray diffraction'
  ];

  const matchCount = metallurgyKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isMetallurgy = matchCount > 0;
  const confidence = isMetallurgy ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isMetallurgy) {
    console.log(`🔬 Materials Science & Metallurgy Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isMetallurgy, confidence };
}

/**
 * Classify whether a query is Organic Chemistry & Drug Synthesis-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isOrganicChemistry and confidence
 */
export function classifyOrganicChemistryQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isOrganicChemistry: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const organicKeywords = [
    'organic chemistry', 'drug synthesis', 'retrosynthetic', 'electrophilic substitution',
    'enantiomer', 'chiral', 'arrow pushing', 'nmr shift'
  ];

  const matchCount = organicKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isOrganicChemistry = matchCount > 0;
  const confidence = isOrganicChemistry ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isOrganicChemistry) {
    console.log(`🧪 Organic Chemistry & Drug Synthesis Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isOrganicChemistry, confidence };
}

/**
 * Classify whether a query is Renewable Grid Infrastructure-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isGridInfrastructure and confidence
 */
export function classifyGridInfrastructureQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isGridInfrastructure: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const gridKeywords = [
    'grid infrastructure', 'hvdc', 'microgrid synchronization', 'frequency stabilization',
    'phase locked loop', 'flow battery', 'synchrophasor'
  ];

  const matchCount = gridKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isGridInfrastructure = matchCount > 0;
  const confidence = isGridInfrastructure ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isGridInfrastructure) {
    console.log(`⚡ Renewable Grid Infrastructure Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isGridInfrastructure, confidence };
}

/**
 * Classify whether a query is MLOps-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isMLOps and confidence
 */
export function classifyMLOpsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isMLOps: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const mlopsKeywords = [
    'mlops', 'feature store', 'hyperparameter tuning', 'model drift',
    'triton inference', 'model quantization'
  ];

  const matchCount = mlopsKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isMLOps = matchCount > 0;
  const confidence = isMLOps ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isMLOps) {
    console.log(`🤖 MLOps Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isMLOps, confidence };
}

/**
 * Classify whether a query is Computational Fluid Dynamics & Aerodynamics-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isFluidDynamics and confidence
 */
export function classifyFluidDynamicsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isFluidDynamics: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const cfdKeywords = [
    'fluid dynamics', 'aerodynamics', 'navier-stokes', 'reynolds number',
    'boundary layer', 'turbulence modeling', 'mach number', 'cfd mesh'
  ];

  const matchCount = cfdKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isFluidDynamics = matchCount > 0;
  const confidence = isFluidDynamics ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isFluidDynamics) {
    console.log(`✈️ Computational Fluid Dynamics & Aerodynamics Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isFluidDynamics, confidence };
}

/**
 * Classify whether a query is Endocrinology & Metabolic Disorders-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isEndocrinology and confidence
 */
export function classifyEndocrinologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isEndocrinology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const endocrineKeywords = [
    'endocrinology', 'pituitary adenoma', 'steroidogenesis', 'hormone signaling',
    'thyroid hormone', 'insulin resistance'
  ];

  const matchCount = endocrineKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isEndocrinology = matchCount > 0;
  const confidence = isEndocrinology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isEndocrinology) {
    console.log(`🩸 Endocrinology & Metabolic Disorders Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isEndocrinology, confidence };
}

/**
 * Classify whether a query is Cryptography-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isCryptography and confidence
 */
export function classifyCryptographyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isCryptography: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const cryptoKeywords = [
    'cryptography', 'symmetric key', 'asymmetric key', 'elliptic curve',
    'diffie-hellman', 'zero knowledge proof', 'post quantum', 'post-quantum'
  ];

  const matchCount = cryptoKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isCryptography = matchCount > 0;
  const confidence = isCryptography ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isCryptography) {
    console.log(`🔐 Cryptography Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isCryptography, confidence };
}

/**
 * Classify whether a query is Behavioral Economics & Decision Theory-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isBehavioralEconomics and confidence
 */
export function classifyBehavioralEconomicsQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isBehavioralEconomics: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const behavioralKeywords = [
    'behavioral economics', 'decision theory', 'prospect theory', 'loss aversion',
    'anchoring bias', 'bounded rationality', 'nudge theory'
  ];

  const matchCount = behavioralKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isBehavioralEconomics = matchCount > 0;
  const confidence = isBehavioralEconomics ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isBehavioralEconomics) {
    console.log(`📈 Behavioral Economics & Decision Theory Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isBehavioralEconomics, confidence };
}

/**
 * Classify whether a query is Seismology & Volcanology-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isSeismology and confidence
 */
export function classifySeismologyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isSeismology: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const seismicKeywords = [
    'seismology', 'volcanology', 'seismic wave', 'tectonic plate',
    'richter scale', 'volcanic eruption', 'magma chamber'
  ];

  const matchCount = seismicKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isSeismology = matchCount > 0;
  const confidence = isSeismology ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isSeismology) {
    console.log(`🌋 Seismology & Volcanology Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isSeismology, confidence };
}

/**
 * Classify whether a query is Compiler Design & PLT-related
 * @param {string} query - The user query
 * @returns {Object} - Result with isCompilerDesign and confidence
 */
export function classifyCompilerDesignQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isCompilerDesign: false, confidence: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const compilerKeywords = [
    'compiler design', 'lexical analysis', 'ast parsing', 'llvm pass',
    'register allocation', 'type inference', 'hindley-milner'
  ];

  const matchCount = compilerKeywords.filter(keyword => lowerQuery.includes(keyword)).length;
  const isCompilerDesign = matchCount > 0;
  const confidence = isCompilerDesign ? Math.min(0.95, 0.7 + matchCount * 0.1) : 0;

  if (isCompilerDesign) {
    console.log(`💻 Compiler Design & PLT Classification: YES | Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return { isCompilerDesign, confidence };
}

export default {
  classifyQuery,
  classifyQueryFast,
  getCodeQueryConfidence,
  isAskingForCodeExample,
  classifyWritingRequest,
  classifyFinancialQuery,
  classifySportsQuery,
  classifyAviationQuery,
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
};
