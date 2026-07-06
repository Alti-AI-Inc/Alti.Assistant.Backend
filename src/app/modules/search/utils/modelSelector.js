/**
 * Smart Model Selector for Gemini Models
 * Analyzes queries and automatically determines the optimal model to use
 */

/**
 * @typedef {Object} QueryContext
 * @property {Array<string>} [conversationHistory=[]] - An array of previous conversation turns or messages.
 * @property {'standard'|'deep'} [searchDepth='standard'] - Indicates the desired depth of search or information retrieval. 'standard' for quick lookups, 'deep' for comprehensive research.
 * @property {number} [previousToolCalls=0] - The number of tools that have been invoked in the current conversational turn or session.
 * @property {number} [responseLength=0] - An estimated or requested length of the expected response in characters or tokens.
 * @property {boolean} [requiresReasoning=false] - Explicitly indicates if the query requires complex reasoning or analytical thought.
 */

/**
 * @typedef {Object} ModelAnalysisResult
 * @property {string} recommendedModel - The identifier of the recommended Gemini model (e.g., 'gemini-3.5-flash', 'gemini-3.1-pro').
 * @property {string} modelName - A human-readable name for the recommended model (e.g., 'Gemini 3.5 Flash', 'Gemini 3.1 Pro').
 * @property {QueryCategory} category - The primary category identified for the user query.
 * @property {number} complexityScore - A numerical score indicating the estimated complexity of the query, higher means more complex.
 * @property {Array<string>} reasoning - A list of factors that contributed to the model selection decision.
 * @property {string} modelReason - A concise explanation for why the specific model was chosen.
 * @property {boolean} useFlash - True if 'gemini-3.5-flash' is recommended.
 * @property {boolean} usePro - True if 'gemini-3.1-pro' is recommended.
 * @property {Object} analysis - Detailed breakdown of query characteristics.
 * @property {number} analysis.queryLength - The word count of the input query.
 * @property {number} analysis.conversationLength - The number of turns in the conversation history.
 * @property {'standard'|'deep'} analysis.searchDepth - The search depth setting from the context.
 * @property {number} analysis.previousToolCalls - The number of previous tool calls from the context.
 * @property {boolean} analysis.isSimpleFactual - True if the query appears to be a simple factual lookup.
 * @property {boolean} analysis.hasAnalyticalKeywords - True if analytical keywords were detected in the query.
 * @property {boolean} analysis.hasTechnicalContext - True if technical or programming-related keywords were detected.
 * @property {boolean} analysis.hasCreativeContext - True if creative writing keywords were detected.
 */

/**
 * Query Analysis Categories
 * Defines different types of queries based on their characteristics and the cognitive demands they place on a language model.
 * Each category helps in guiding the model selection process.
 * @readonly
 * @enum {string}
 */
export const QueryCategory = {
  /** Quick facts, dates, simple lookups, direct answers. */
  SIMPLE_FACTUAL: 'simple_factual',
  /** Analysis, reasoning, comparisons, synthesis of information, problem-solving. */
  COMPLEX_ANALYTICAL: 'complex_analytical',
  /** Content generation, creative tasks, storytelling, drafting. */
  CREATIVE_WRITING: 'creative_writing',
  /** Programming, technical questions, debugging, code generation, system design. */
  TECHNICAL_CODE: 'technical_code',
  /** Chat, follow-up questions, maintaining context, general dialogue. */
  CONVERSATIONAL: 'conversational',
  /** Deep research, requiring multiple steps, information gathering from various sources, comprehensive understanding. */
  MULTI_STEP_RESEARCH: 'multi_step_research',
};

/**
 * Analyzes query characteristics and additional context to determine the optimal Gemini model
 * (e.g., Flash for speed, Pro for complexity) to use for generating a response.
 * It scores the query based on various indicators like length, keywords, conversation history,
 * and explicit user requirements to recommend the most suitable model.
 *
 * @param {string} query - The user's input query string.
 * @param {QueryContext} [context={}] - An object containing additional contextual information to aid in model selection.
 * @returns {ModelAnalysisResult} An object containing the recommended model, its name, category, complexity score, and detailed reasoning.
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

  // Use Gemini 2.5 Pro for complex scenarios
  if (complexityScore >= 6) {
    recommendedModel = 'gemini-3.1-pro';
    modelName = 'Gemini 2.5 Pro';
    modelReason = 'High complexity requires advanced reasoning';
  } else if (
    complexityScore >= 4 &&
    category === QueryCategory.COMPLEX_ANALYTICAL
  ) {
    recommendedModel = 'gemini-3.1-pro';
    modelName = 'Gemini 2.5 Pro';
    modelReason = 'Analytical query requires deeper reasoning';
  } else if (category === QueryCategory.MULTI_STEP_RESEARCH) {
    recommendedModel = 'gemini-3.1-pro';
    modelName = 'Gemini 2.5 Pro';
    modelReason = 'Multi-step research benefits from advanced capabilities';
  } else if (searchDepth === 'deep') {
    recommendedModel = 'gemini-3.1-pro';
    modelName = 'Gemini 2.5 Pro';
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
    useFlash: recommendedModel === 'gemini-3.5-flash',
    usePro: recommendedModel === 'gemini-3.1-pro',
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
 * Provides a quick shorthand for selecting the optimal Gemini model based on a query and context.
 * This function internally calls `analyzeQueryForModel` and directly returns the recommended model identifier.
 *
 * @param {string} query - The user's input query string.
 * @param {QueryContext} [context={}] - An object containing additional contextual information.
 * @returns {string} The identifier of the recommended Gemini model (e.g., 'gemini-3.5-flash' or 'gemini-3.1-pro').
 */
export const selectOptimalModel = (query, context = {}) => {
  const analysis = analyzeQueryForModel(query, context);
  return analysis.recommendedModel;
};

/**
 * Performs model selection analysis for a given query and context, then logs the detailed
 * analysis results to the console for debugging or monitoring purposes.
 * This function is useful for understanding why a particular model was chosen.
 *
 * @param {string} query - The user's input query string.
 * @param {QueryContext} [context={}] - An object containing additional contextual information.
 * @returns {ModelAnalysisResult} The full analysis result object, including the recommended model and reasoning.
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