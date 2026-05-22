/**
 * Query Classification Service
 * Determines if a query is code-related, writing-related, OR financial
 * Financial queries are priority-routed to Massive.com real-time data
 */
import { detectFinancialIntent } from '../../../helpers/massiveTickerDB.js';
import { detectSportsIntent } from '../../../helpers/sportsIntentDB.js';

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
  };
}

export default {
  classifyQuery,
  classifyQueryFast,
  getCodeQueryConfidence,
  isAskingForCodeExample,
  classifyWritingRequest,
  classifyFinancialQuery,
  classifySportsQuery,
};
