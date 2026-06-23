/**
 * @fileoverview LangGraph workflow for the Code Agent.
 *
 * State flows through these nodes:
 *   validateContext → detectIntent → [generateCode | debugCode | explainCode | reviewCode] → testAndValidate → END
 *
 * The `detectIntent` node uses Claude to classify the user's intent when
 * heuristic matching is insufficient. Each code node delegates to CodeService
 * which calls Claude Sonnet 4.5 via Vertex AI.
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { createLogger } from '../../../../shared/logging/index.js';
import { CodeService } from '../services/codeService.js';

const { logger } = createLogger('code-workflow');

// Singleton CodeService — reuses the GoogleAuth client across invocations
const codeService = new CodeService();

// ── State Schema ─────────────────────────────────────────────────────────────

const CodeAgentState = Annotation.Root({
  /** The user's natural-language prompt */
  prompt: Annotation({ reducer: (_, v) => v, default: () => '' }),

  /** Detected intent: 'generate' | 'debug' | 'explain' | 'review' */
  intent: Annotation({ reducer: (_, v) => v, default: () => 'generate' }),

  /** Target programming language */
  language: Annotation({ reducer: (_, v) => v, default: () => 'javascript' }),

  /** Generated or fixed code output */
  code: Annotation({ reducer: (_, v) => v, default: () => '' }),

  /** Generated unit tests */
  tests: Annotation({ reducer: (_, v) => v, default: () => '' }),

  /** Code review output */
  review: Annotation({ reducer: (_, v) => v, default: () => null }),

  /** Code explanation output */
  explanation: Annotation({ reducer: (_, v) => v, default: () => '' }),

  /** Validation / test results */
  validationResult: Annotation({ reducer: (_, v) => v, default: () => null }),

  /** Error message for debug intent */
  error: Annotation({ reducer: (_, v) => v, default: () => '' }),

  /** User context forwarded from gateway */
  userContext: Annotation({ reducer: (_, v) => v, default: () => ({}) }),

  /** Result metadata (model, tokens, etc.) */
  metadata: Annotation({ reducer: (_, v) => v, default: () => ({}) }),
});

// ── Node Implementations ─────────────────────────────────────────────────────

/**
 * Validate that the incoming state has the minimum required fields.
 * Detects embedded code blocks and language hints from the prompt.
 */
async function validateContext(state) {
  logger.info('validateContext', { prompt: state.prompt?.substring(0, 80) });

  if (!state.prompt || typeof state.prompt !== 'string' || state.prompt.trim().length === 0) {
    throw new Error('Prompt is required and must be a non-empty string.');
  }

  const updates = { prompt: state.prompt.trim() };

  // Detect language hints from fenced code blocks: ```python ...```
  const codeBlockMatch = state.prompt.match(/```(\w+)/);
  if (codeBlockMatch && !state.language) {
    updates.language = codeBlockMatch[1].toLowerCase();
    logger.info('Auto-detected language from code block', { language: updates.language });
  }

  // Detect language from explicit mentions
  if (!updates.language || updates.language === 'javascript') {
    const langPatterns = [
      { pattern: /\b(python|py)\b/i, lang: 'python' },
      { pattern: /\b(typescript|ts)\b/i, lang: 'typescript' },
      { pattern: /\b(java)\b/i, lang: 'java' },
      { pattern: /\b(golang|go)\b/i, lang: 'go' },
      { pattern: /\b(rust)\b/i, lang: 'rust' },
      { pattern: /\b(c\+\+|cpp)\b/i, lang: 'cpp' },
      { pattern: /\b(c#|csharp)\b/i, lang: 'csharp' },
      { pattern: /\b(ruby)\b/i, lang: 'ruby' },
      { pattern: /\b(php)\b/i, lang: 'php' },
      { pattern: /\b(swift)\b/i, lang: 'swift' },
      { pattern: /\b(kotlin)\b/i, lang: 'kotlin' },
      { pattern: /\b(sql)\b/i, lang: 'sql' },
      { pattern: /\b(bash|shell)\b/i, lang: 'bash' },
      { pattern: /\b(powershell)\b/i, lang: 'powershell' },
    ];

    for (const { pattern, lang } of langPatterns) {
      if (pattern.test(state.prompt)) {
        updates.language = lang;
        logger.info('Auto-detected language from prompt text', { language: lang });
        break;
      }
    }
  }

  return updates;
}

/**
 * Detect the user's intent from the prompt text.
 * First attempts heuristic regex matching; falls back to Claude classification
 * if the heuristics are inconclusive.
 */
async function detectIntent(state) {
  const prompt = state.prompt.toLowerCase();

  // If caller already specified a non-default intent, honour it
  if (state.intent && state.intent !== 'generate') {
    logger.info('detectIntent — caller-specified', { intent: state.intent });
    return { intent: state.intent };
  }

  // ── Heuristic pass ──────────────────────────────────────────────────────
  const debugSignals = /\b(debug|fix|error|bug|broken|crash|exception|traceback|stack\s*trace|segfault|not working|fails?)\b/;
  const explainSignals = /\b(explain|what does|how does|walk me through|break down|describe|meaning of)\b/;
  const reviewSignals = /\b(review|audit|improve|refactor|optimize|clean up|code quality|best practices|security check)\b/;

  let intent = 'generate';

  // Check if the prompt contains a code block — strong signal for debug/review/explain
  const hasCodeBlock = /```[\s\S]*```/.test(state.prompt);

  if (debugSignals.test(prompt)) {
    intent = 'debug';
  } else if (explainSignals.test(prompt)) {
    intent = 'explain';
  } else if (reviewSignals.test(prompt)) {
    intent = 'review';
  } else if (hasCodeBlock && !/(create|generate|write|build|make)\b/.test(prompt)) {
    // Has code but no generate keywords — try Claude classification
    intent = await _classifyWithClaude(state.prompt);
  }

  logger.info('detectIntent', { intent, usedClaude: intent === 'generate' && hasCodeBlock });
  return { intent };
}

/**
 * Use Claude to classify ambiguous intents.
 * @param {string} prompt
 * @returns {Promise<string>} 'generate' | 'debug' | 'explain' | 'review'
 */
async function _classifyWithClaude(prompt) {
  try {
    const result = await codeService.callClaude([
      {
        role: 'system',
        content: 'You are an intent classifier. Respond with exactly one word: generate, debug, explain, or review.',
      },
      {
        role: 'user',
        content: `Classify the following user request into one of these categories: generate, debug, explain, review.\n\nRequest: ${prompt.substring(0, 500)}`,
      },
    ], { maxTokens: 16, temperature: 0 });

    const classified = result.text.trim().toLowerCase();
    if (['generate', 'debug', 'explain', 'review'].includes(classified)) {
      return classified;
    }
  } catch (err) {
    logger.warn('Claude intent classification failed, defaulting to generate', { error: err.message });
  }

  return 'generate';
}

/**
 * Generate code from the prompt via CodeService → Claude.
 */
async function generateCode(state) {
  logger.info('generateCode node', { language: state.language });

  const result = await codeService.generateCode(
    state.prompt,
    state.userContext,
    { language: state.language },
  );

  return {
    code: result.code,
    tests: result.tests,
    explanation: result.explanation,
    metadata: result.metadata,
  };
}

/**
 * Debug code — analyze the error and produce a fix via CodeService → Claude.
 */
async function debugCode(state) {
  logger.info('debugCode node', { error: state.error?.substring(0, 80) });

  // The prompt may contain inline code, or the caller sends code separately
  const codeToDebug = _extractCodeBlock(state.prompt) || state.prompt;
  const result = await codeService.debugCode(codeToDebug, state.error, state.userContext);

  return {
    code: result.fixedCode,
    explanation: result.explanation,
    metadata: result.metadata,
  };
}

/**
 * Explain the provided code via CodeService → Claude.
 */
async function explainCode(state) {
  logger.info('explainCode node');

  const codeToExplain = _extractCodeBlock(state.prompt) || state.prompt;
  const result = await codeService.explainCode(codeToExplain, state.userContext);

  return {
    explanation: result.explanation,
    metadata: result.metadata,
  };
}

/**
 * Review the provided code via CodeService → Claude.
 */
async function reviewCode(state) {
  logger.info('reviewCode node');

  const codeToReview = _extractCodeBlock(state.prompt) || state.prompt;
  const result = await codeService.reviewCode(codeToReview, state.userContext);

  return {
    review: {
      summary: result.review,
      issues: result.issues,
      suggestions: result.suggestions,
      securityFlags: result.securityFlags,
      score: result.score,
    },
    metadata: result.metadata,
  };
}

/**
 * Validate the output structure. Ensures the workflow produced meaningful results.
 */
async function testAndValidate(state) {
  logger.info('testAndValidate node', { intent: state.intent });

  const checks = [];

  switch (state.intent) {
    case 'generate':
      checks.push({
        name: 'code_present',
        passed: Boolean(state.code && state.code.length > 0),
        message: state.code ? 'Generated code present' : 'No code was generated',
      });
      break;

    case 'debug':
      checks.push({
        name: 'fix_present',
        passed: Boolean(state.code && state.code.length > 0),
        message: state.code ? 'Fixed code present' : 'No fixed code produced',
      });
      checks.push({
        name: 'explanation_present',
        passed: Boolean(state.explanation),
        message: state.explanation ? 'Debug explanation present' : 'No explanation provided',
      });
      break;

    case 'explain':
      checks.push({
        name: 'explanation_present',
        passed: Boolean(state.explanation && state.explanation.length > 0),
        message: state.explanation ? 'Explanation present' : 'No explanation produced',
      });
      break;

    case 'review':
      checks.push({
        name: 'review_present',
        passed: Boolean(state.review),
        message: state.review ? 'Review present' : 'No review produced',
      });
      break;
  }

  const allPassed = checks.every((c) => c.passed);

  if (!allPassed) {
    logger.warn('Validation found issues', { checks });
  }

  return {
    validationResult: {
      passed: allPassed,
      checks,
      message: allPassed
        ? `All ${checks.length} validation checks passed.`
        : `${checks.filter((c) => !c.passed).length} of ${checks.length} checks failed.`,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the first fenced code block from a prompt string.
 * @param {string} text
 * @returns {string|null}
 */
function _extractCodeBlock(text) {
  const match = text.match(/```(?:\w+)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : null;
}

// ── Conditional Router ───────────────────────────────────────────────────────

/**
 * Routes from detectIntent to the appropriate code node.
 */
function intentRouter(state) {
  switch (state.intent) {
    case 'debug':
      return 'debugCode';
    case 'explain':
      return 'explainCode';
    case 'review':
      return 'reviewCode';
    case 'generate':
    default:
      return 'generateCode';
  }
}

// ── Build the Graph ──────────────────────────────────────────────────────────

const workflow = new StateGraph(CodeAgentState)
  // Add nodes
  .addNode('validateContext', validateContext)
  .addNode('detectIntent', detectIntent)
  .addNode('generateCode', generateCode)
  .addNode('debugCode', debugCode)
  .addNode('explainCode', explainCode)
  .addNode('reviewCode', reviewCode)
  .addNode('testAndValidate', testAndValidate)

  // Entry edge
  .addEdge('__start__', 'validateContext')

  // validateContext → detectIntent
  .addEdge('validateContext', 'detectIntent')

  // detectIntent → conditional routing to code nodes
  .addConditionalEdges('detectIntent', intentRouter, {
    generateCode: 'generateCode',
    debugCode: 'debugCode',
    explainCode: 'explainCode',
    reviewCode: 'reviewCode',
  })

  // All code nodes → testAndValidate
  .addEdge('generateCode', 'testAndValidate')
  .addEdge('debugCode', 'testAndValidate')
  .addEdge('explainCode', 'testAndValidate')
  .addEdge('reviewCode', 'testAndValidate')

  // testAndValidate → END
  .addEdge('testAndValidate', END);

// ── Compile & Export ─────────────────────────────────────────────────────────

export const codeAgentGraph = workflow.compile();
export { CodeAgentState };
export default codeAgentGraph;
