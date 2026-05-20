/**
 * Smart Model Selector for Gemini Models
 * Analyzes queries and automatically determines the optimal model to use
 */

/**
 * Query Analysis Categories
 */
export const QueryCategory = {
  SIMPLE_FACTUAL: 'simple_factual', // Quick facts, dates, simple lookups
  COMPLEX_ANALYTICAL: 'complex_analytical', // Analysis, reasoning, comparisons
  CREATIVE_WRITING: 'creative_writing', // Content generation, creative tasks
  TECHNICAL_CODE: 'technical_code', // Programming, technical questions
  CONVERSATIONAL: 'conversational', // Chat, follow-up questions
  MULTI_STEP_RESEARCH: 'multi_step_research', // Deep research, multiple sources
};

/**
 * Analyze query characteristics to determine optimal model
 * @param {string} query - The user query
 * @param {Object} context - Additional context
 * @returns {Object} Analysis result with model recommendation
 */
export const analyzeQueryForModel = (query, context = {}) => {
  const {
    conversationHistory = [],
    searchDepth = 'standard',
    previousToolCalls = 0,
    responseLength = 0,
    requiresReasoning = false,
  } = context;

  const queryLower = query.toLowerCase();
  const queryLength = query.length;
  const wordCount = query.split(/\s+/).length;

  // Initialize score
  let complexityScore = 0;
  let category = QueryCategory.SIMPLE_FACTUAL;
  let reasoning = [];

  // === COMPLEXITY INDICATORS ===

  // 1. Query Length (longer queries often need more processing)
  if (wordCount > 30) {
    complexityScore += 2;
    reasoning.push('Long query (>30 words)');
  } else if (wordCount > 15) {
    complexityScore += 1;
    reasoning.push('Medium query (15-30 words)');
  }

  // 2. Analytical Keywords
  const analyticalKeywords = [
    'analyze',
    'compare',
    'evaluate',
    'assess',
    'determine',
    'investigate',
    'examine',
    'research',
    'study',
    'explain why',
    'what makes',
    'how does',
    'pros and cons',
    'advantages and disadvantages',
    'better',
    'worse',
    'implications',
    'impact',
    'consequences',
    'relationship between',
    'correlation',
    'causation',
    'trend',
    'pattern',
    'predict',
    'forecast',
    'strategy',
    'recommend',
    'suggest',
    'advise',
    'should i',
    'which is better',
    'comprehensive',
    'detailed',
    'in-depth',
    'thorough',
  ];

  const analyticalCount = analyticalKeywords.filter((kw) =>
    queryLower.includes(kw)
  ).length;
  if (analyticalCount >= 2) {
    complexityScore += 3;
    category = QueryCategory.COMPLEX_ANALYTICAL;
    reasoning.push(`Multiple analytical keywords (${analyticalCount})`);
  } else if (analyticalCount === 1) {
    complexityScore += 2;
    category = QueryCategory.COMPLEX_ANALYTICAL;
    reasoning.push('Contains analytical keyword');
  }

  // 3. Multi-step or Multi-part Questions
  const multiPartIndicators = [
    'first',
    'second',
    'third',
    'then',
    'after that',
    'next',
    'and also',
    'additionally',
    'furthermore',
    'moreover',
    'step by step',
    'walk me through',
    'explain in detail',
  ];

  const hasMultiPart = multiPartIndicators.some((ind) =>
    queryLower.includes(ind)
  );
  const hasMultipleQuestions = (query.match(/\?/g) || []).length > 1;

  if (hasMultiPart || hasMultipleQuestions) {
    complexityScore += 2;
    category = QueryCategory.MULTI_STEP_RESEARCH;
    reasoning.push('Multi-step or multi-part question');
  }

  // 4. Technical/Code Related
  const technicalKeywords = [
    'code',
    'function',
    'algorithm',
    'implement',
    'debug',
    'error',
    'api',
    'database',
    'query',
    'python',
    'javascript',
    'react',
    'node',
    'sql',
    'mongodb',
    'typescript',
    'programming',
    'syntax',
    'framework',
    'library',
    'package',
    'dependency',
    'optimize',
  ];

  const hasTechnical = technicalKeywords.some((kw) => queryLower.includes(kw));
  if (hasTechnical) {
    complexityScore += 1;
    category = QueryCategory.TECHNICAL_CODE;
    reasoning.push('Technical/programming context');
  }

  // 5. Creative Writing
  const creativeKeywords = [
    'write',
    'create',
    'draft',
    'compose',
    'generate',
    'story',
    'essay',
    'article',
    'blog',
    'email',
    'letter',
    'poem',
    'narrative',
    'content',
    'copy',
    'description',
  ];

  const hasCreative = creativeKeywords.some((kw) => queryLower.includes(kw));
  if (hasCreative && !hasTechnical) {
    complexityScore += 1;
    category = QueryCategory.CREATIVE_WRITING;
    reasoning.push('Creative writing request');
  }

  // 6. Simple Factual Queries
  const simplePatterns = [
    /^what is /i,
    /^when is /i,
    /^where is /i,
    /^who is /i,
    /^how many /i,
    /^what time /i,
    /^what's the /i,
    /next game/i,
    /weather in/i,
    /temperature/i,
  ];

  const isSimpleFactual =
    simplePatterns.some((pattern) => pattern.test(query)) && wordCount < 15;
  if (isSimpleFactual && analyticalCount === 0) {
    complexityScore = Math.max(0, complexityScore - 2);
    category = QueryCategory.SIMPLE_FACTUAL;
    reasoning.push('Simple factual query pattern');
  }

  // 7. Conversation Context
  if (conversationHistory.length > 5) {
    complexityScore += 1;
    reasoning.push('Long conversation history');
  }

  // 8. Deep Search Requested
  if (searchDepth === 'deep') {
    complexityScore += 2;
    category = QueryCategory.MULTI_STEP_RESEARCH;
    reasoning.push('Deep search mode requested');
  }

  // 9. Previous Tool Calls (indicates iterative research)
  if (previousToolCalls > 3) {
    complexityScore += 2;
    reasoning.push(`Multiple previous tool calls (${previousToolCalls})`);
  }

  // 10. Expected Response Length
  if (responseLength > 5000) {
    complexityScore += 1;
    reasoning.push('Long response expected');
  }

  // 11. Explicit Reasoning Request
  if (requiresReasoning) {
    complexityScore += 3;
    reasoning.push('Explicit reasoning required');
  }

  // === MODEL RECOMMENDATION ===

  let recommendedModel = 'gemini-3.5-flash';
  let modelName = 'Gemini 3.5 Flash';
  let modelReason = '';

  // Use Gemini 3 Pro for complex scenarios
  if (complexityScore >= 6) {
    recommendedModel = 'gemini-3.5-flash';
    modelName = 'Gemini 3.5 Flash';
    modelReason = 'High complexity requires advanced reasoning';
  } else if (
    complexityScore >= 4 &&
    category === QueryCategory.COMPLEX_ANALYTICAL
  ) {
    recommendedModel = 'gemini-3.5-flash';
    modelName = 'Gemini 3.5 Flash';
    modelReason = 'Analytical query requires deeper reasoning';
  } else if (category === QueryCategory.MULTI_STEP_RESEARCH) {
    recommendedModel = 'gemini-3.5-flash';
    modelName = 'Gemini 3.5 Flash';
    modelReason = 'Multi-step research benefits from advanced capabilities';
  } else if (searchDepth === 'deep') {
    recommendedModel = 'gemini-3.5-flash';
    modelName = 'Gemini 3.5 Flash';
    modelReason = 'Deep search mode requires comprehensive analysis';
  } else {
    modelReason = 'Standard query suitable for fast processing';
  }

  return {
    recommendedModel,
    modelName,
    category,
    complexityScore,
    reasoning,
    modelReason,
    useFlash: recommendedModel === 'gemini-2.5-flash',
    usePro: recommendedModel === 'gemini-3.5-flash',
    analysis: {
      queryLength: wordCount,
      conversationLength: conversationHistory.length,
      searchDepth,
      previousToolCalls,
      isSimpleFactual,
      hasAnalyticalKeywords: analyticalCount > 0,
      hasTechnicalContext: hasTechnical,
      hasCreativeContext: hasCreative,
    },
  };
};

/**
 * Quick model selection shorthand
 * @param {string} query - The user query
 * @param {Object} context - Additional context
 * @returns {string} Model identifier ('gemini-2.5-flash' or 'gemini-3.5-flash')
 */
export const selectOptimalModel = (query, context = {}) => {
  const analysis = analyzeQueryForModel(query, context);
  return analysis.recommendedModel;
};

/**
 * Get detailed analysis with logging
 * @param {string} query - The user query
 * @param {Object} context - Additional context
 * @returns {Object} Analysis result
 */
export const analyzeAndLogModelSelection = (query, context = {}) => {
  const analysis = analyzeQueryForModel(query, context);

  console.log('\n🧠 === SMART MODEL SELECTION ===');
  console.log(
    `📝 Query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`
  );
  console.log(`📊 Category: ${analysis.category}`);
  console.log(`🎯 Complexity Score: ${analysis.complexityScore}/10`);
  console.log(`🤖 Selected Model: ${analysis.modelName}`);
  console.log(`💡 Reason: ${analysis.modelReason}`);
  console.log(`📋 Reasoning Factors:`);
  analysis.reasoning.forEach((r) => console.log(`   - ${r}`));
  console.log('================================\n');

  return analysis;
};
