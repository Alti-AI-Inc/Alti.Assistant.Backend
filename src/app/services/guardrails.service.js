import { logger } from '../../shared/logger.js';

/**
 * Guardrails Service — Pre and post-generation safety layer.
 *
 * INPUT: Validates, sanitizes, detects prompt injection, classifies risk.
 * OUTPUT: Validates hallucination score, relevance, confidence, content safety.
 *
 * Nothing enters or exits the system without passing through guardrails.
 */

// Prompt injection patterns (regex-based fast check)
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?prior/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /forget\s+(everything|all|your)/i,
  /system\s*prompt\s*:/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|im_start\|>/i,
  /<\|system\|>/i,
  /jailbreak/i,
  /DAN\s*mode/i,
  /pretend\s+you\s+(are|have)\s+no\s+(rules|restrictions)/i,
  /bypass\s+(your\s+)?(safety|content|ethical)/i,
];

// Content safety patterns
const UNSAFE_CONTENT_PATTERNS = [
  /how\s+to\s+(make|build|create)\s+(a\s+)?(bomb|explosive|weapon)/i,
  /synthesize\s+(drugs|narcotics|methamphetamine)/i,
  /hack\s+(into|someone'?s)\s+(bank|account|password)/i,
];

const MAX_INPUT_LENGTH = 10000;

export const GuardrailsService = {
  /**
   * Pre-generation input validation.
   * Returns { safe, sanitized, risk, warnings }.
   */
  async validateInput(message) {
    const warnings = [];

    if (!message || typeof message !== 'string') {
      return { safe: false, sanitized: '', risk: 'invalid', warnings: ['Empty or invalid input'] };
    }

    // Length check
    let sanitized = message;
    if (message.length > MAX_INPUT_LENGTH) {
      sanitized = message.slice(0, MAX_INPUT_LENGTH);
      warnings.push(`Input truncated from ${message.length} to ${MAX_INPUT_LENGTH} characters`);
    }

    // Prompt injection detection (fast regex)
    const injectionMatch = INJECTION_PATTERNS.find(p => p.test(sanitized));
    if (injectionMatch) {
      logger.warn(`[Guardrails] Prompt injection detected: ${injectionMatch}`);
      warnings.push('Potential prompt injection detected');
      return {
        safe: false,
        sanitized,
        risk: 'injection',
        warnings,
        rejectionReason: 'Your message contains patterns that may attempt to override system instructions.',
      };
    }

    // Content safety check
    const unsafeMatch = UNSAFE_CONTENT_PATTERNS.find(p => p.test(sanitized));
    if (unsafeMatch) {
      logger.warn(`[Guardrails] Unsafe content detected`);
      return {
        safe: false,
        sanitized,
        risk: 'unsafe_content',
        warnings: ['Content policy violation detected'],
        rejectionReason: 'This request cannot be processed due to content safety policies.',
      };
    }

    // Sanitize HTML/script tags in input
    sanitized = sanitized
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '');

    const risk = this.classifyRisk(sanitized);

    return { safe: true, sanitized, risk, warnings };
  },

  /**
   * Classify the risk level of a request.
   */
  classifyRisk(message) {
    const lower = message.toLowerCase();

    // High risk: autonomous execution
    if (/\b(execute|run|deploy|delete|remove|send|post|submit)\b/.test(lower) &&
        /\b(agent|workflow|all|everything|production)\b/.test(lower)) {
      return 'high';
    }

    // Medium risk: tool calls / actions
    if (/\b(send|email|create|update|schedule|book|cancel)\b/.test(lower) &&
        /\b(meeting|ticket|message|invoice|appointment)\b/.test(lower)) {
      return 'medium';
    }

    // Low risk: questions, search, code
    return 'low';
  },

  /**
   * Post-generation output validation.
   * Returns { valid, confidence, groundingScore, warnings }.
   */
  async validateOutput(output, context = {}) {
    const warnings = [];
    const { query, groundingScore = 1.0 } = context;

    if (!output || typeof output !== 'string' || output.length === 0) {
      return {
        valid: false,
        confidence: 'none',
        groundingScore: 0,
        warnings: ['Empty output'],
      };
    }

    // Check for common hallucination patterns
    const hallucIndicators = [
      /as of my (last |knowledge )?(?:update|cutoff|training)/i,
      /I don'?t have (?:access to |real-?time )/i,
      /I'?m not (?:able to|sure|certain) (?:about |if )/i,
      /I cannot (?:verify|confirm|access)/i,
    ];

    const hedgingCount = hallucIndicators.filter(p => p.test(output)).length;
    if (hedgingCount > 0) {
      warnings.push(`Output contains ${hedgingCount} hedging/uncertainty indicator(s)`);
    }

    // Check output length reasonableness
    if (output.length < 10 && query && query.length > 30) {
      warnings.push('Output is unusually short for the given query');
    }

    // Confidence scoring
    let confidence;
    if (groundingScore >= 0.8 && hedgingCount === 0) {
      confidence = 'high';
    } else if (groundingScore >= 0.5) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Relevance check: does the output address the query?
    let relevance = 1.0;
    if (query) {
      const queryWords = query.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3);
      const outputLower = output.toLowerCase();
      const matchCount = queryWords.filter(w => outputLower.includes(w)).length;
      relevance = queryWords.length > 0 ? matchCount / queryWords.length : 1.0;

      if (relevance < 0.3) {
        warnings.push('Output may not be relevant to the query');
        confidence = 'low';
      }
    }

    return {
      valid: warnings.length < 3 && confidence !== 'none',
      confidence,
      groundingScore,
      relevance,
      hedgingCount,
      warnings,
    };
  },

  /**
   * Enforce a Zod schema on structured output.
   */
  async enforceSchema(output, schema) {
    if (!schema) return { valid: true, data: output };

    try {
      const { default: zod } = await import('zod');
      const parsed = schema.parse(output);
      return { valid: true, data: parsed };
    } catch (err) {
      return { valid: false, data: null, error: err.message };
    }
  },

  /**
   * Build a safety-enhanced system prompt that prevents hallucination.
   */
  buildGroundedSystemPrompt(basePrompt, context = {}) {
    const groundingInstructions = `

CRITICAL INSTRUCTIONS — FOLLOW WITHOUT EXCEPTION:
1. Only state facts you are confident about. If uncertain, say "I'm not sure" or "Based on available information."
2. Never fabricate URLs, citations, statistics, dates, or names.
3. If the user asks about current events or real-time data, explicitly state that your knowledge may not be current.
4. Distinguish clearly between facts, opinions, and inferences.
5. When providing numerical data, qualify with source or time frame if known.
6. If you don't know something, say so directly. Never guess.`;

    let enhanced = basePrompt + groundingInstructions;

    if (context.memoryContext) {
      enhanced += `\n\nUser context from memory:\n${context.memoryContext}`;
    }

    if (context.ragContext) {
      enhanced += `\n\nGrounded knowledge:\n${context.ragContext}`;
    }

    if (context.searchContext) {
      enhanced += `\n\nReal-time search results:\n${context.searchContext}`;
    }

    return enhanced;
  },
};

export default GuardrailsService;
