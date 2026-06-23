/**
 * @fileoverview Code generation service for the Code Agent.
 * Calls Claude Sonnet 4.5 via Vertex AI rawPredict for all code operations.
 *
 * Usage:
 *   const service = new CodeService();
 *   const result = await service.generateCode(prompt, userCtx, options);
 */

import { GoogleAuth } from 'google-auth-library';
import { createLogger } from '../../../../shared/logging/index.js';
import agentConfig from '../config/index.js';

const { logger } = createLogger('code-service');

// ── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert software engineer specializing in code generation, debugging,
and review. You write clean, efficient, well-documented code.

Capabilities:
- Generate code in any programming language
- Debug errors with root cause analysis
- Review code for quality, security, performance, and best practices
- Explain complex code in clear terms
- Suggest improvements and optimizations

Rules:
- Always include relevant comments and documentation
- Follow language-specific conventions and best practices
- Consider edge cases and error handling
- Use meaningful variable and function names
- Provide complete, runnable code when generating
- When debugging, explain the root cause clearly
- When reviewing, score on a 1-10 scale`;

// ── CodeService ──────────────────────────────────────────────────────────────

export class CodeService {
  constructor() {
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.modelId = agentConfig.primaryModel;
    this.location = agentConfig.vertexAiRegion;
    this.projectId = agentConfig.gcp?.projectId;

    logger.info('CodeService initialized', {
      model: this.modelId,
      location: this.location,
      projectId: this.projectId ? '***' : 'NOT SET',
    });
  }

  // ── Core Claude Caller ──────────────────────────────────────────────────

  /**
   * Send messages to Claude via Vertex AI rawPredict.
   * @param {Array<{role: string, content: string}>} messages - Conversation messages
   * @param {object} [options] - Generation options
   * @param {number} [options.maxTokens=8192]
   * @param {number} [options.temperature=0.1]
   * @returns {Promise<{text: string, usage: object}>}
   */
  async callClaude(messages, options = {}) {
    const projectId = this.projectId;
    if (!projectId) {
      throw new Error('GCP_PROJECT_ID is not set — cannot call Vertex AI.');
    }

    const client = await this.auth.getClient();
    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${this.location}/publishers/anthropic/models/${this.modelId}:rawPredict`;

    // Separate system messages and format user/assistant alternation
    let systemPrompt = '';
    const formattedMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt += msg.content + '\n\n';
        continue;
      }

      let role = (msg.role === 'assistant' || msg.role === 'model')
        ? 'assistant'
        : 'user';
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg.content?.[0]?.text || '');

      if (!text) continue;

      // Merge consecutive same-role messages
      if (formattedMessages.length > 0 && formattedMessages.at(-1).role === role) {
        formattedMessages.at(-1).content += '\n\n' + text;
      } else {
        formattedMessages.push({ role, content: text });
      }
    }

    // Ensure conversation starts with a user message
    if (formattedMessages[0]?.role === 'assistant') {
      formattedMessages.unshift({ role: 'user', content: 'Hello' });
    }

    const requestBody = {
      anthropic_version: 'vertex-2023-10-16',
      messages: formattedMessages,
      max_tokens: options.maxTokens || agentConfig.defaults.maxOutputTokens,
      temperature: options.temperature ?? agentConfig.defaults.temperature,
    };

    if (systemPrompt.trim()) {
      requestBody.system = systemPrompt.trim();
    }

    const startTime = Date.now();

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: requestBody,
    });

    const latencyMs = Date.now() - startTime;
    const usage = response.data?.usage || {};

    logger.info('Claude call completed', {
      latencyMs,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
    });

    return {
      text: response.data?.content?.[0]?.text || '',
      usage,
    };
  }

  // ── Generate Code ───────────────────────────────────────────────────────

  /**
   * Generate code from a natural-language prompt.
   * @param {string} prompt - The user's code generation request
   * @param {object} userContext - Forwarded user context from gateway
   * @param {object} [options] - Generation options (language, framework, etc.)
   * @returns {Promise<object>} { code, language, explanation, metadata }
   */
  async generateCode(prompt, userContext, options = {}) {
    logger.info('generateCode called', {
      userId: userContext?.userId,
      language: options.language,
    });

    const language = options.language || 'javascript';

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Generate ${language} code for the following request.

Request: ${prompt}

Respond with a JSON object (and nothing else) with these fields:
{
  "code": "<the generated code>",
  "language": "<programming language>",
  "explanation": "<brief explanation of the code>",
  "tests": "<unit tests for the code, or empty string if not applicable>"
}`,
      },
    ];

    const result = await this.callClaude(messages, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });

    const parsed = this._parseJSON(result.text, {
      code: result.text,
      language,
      explanation: '',
      tests: '',
    });

    return {
      intent: 'generate',
      code: parsed.code,
      language: parsed.language || language,
      explanation: parsed.explanation || '',
      tests: parsed.tests || '',
      model: this.modelId,
      metadata: {
        tokensUsed: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        inputTokens: result.usage.input_tokens || 0,
        outputTokens: result.usage.output_tokens || 0,
      },
    };
  }

  // ── Debug Code ──────────────────────────────────────────────────────────

  /**
   * Debug code given an error message / stack trace.
   * @param {string} code - The buggy code
   * @param {string} error - The error message or stack trace
   * @param {object} userContext - Forwarded user context
   * @returns {Promise<object>} { fixedCode, explanation, rootCause, metadata }
   */
  async debugCode(code, error, userContext) {
    logger.info('debugCode called', { userId: userContext?.userId });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Debug the following code. An error is occurring.

## Code
\`\`\`
${code}
\`\`\`

## Error
\`\`\`
${error || 'No error message provided — please analyze for potential bugs.'}
\`\`\`

Respond with a JSON object (and nothing else) with these fields:
{
  "fixedCode": "<the corrected code>",
  "rootCause": "<concise root cause of the bug>",
  "explanation": "<detailed explanation of what was wrong and what you fixed>",
  "changesApplied": ["<list of changes made>"]
}`,
      },
    ];

    const result = await this.callClaude(messages);

    const parsed = this._parseJSON(result.text, {
      fixedCode: code,
      rootCause: 'Unable to determine root cause.',
      explanation: result.text,
      changesApplied: [],
    });

    return {
      intent: 'debug',
      originalCode: code,
      error,
      fixedCode: parsed.fixedCode,
      rootCause: parsed.rootCause,
      explanation: parsed.explanation,
      changesApplied: parsed.changesApplied || [],
      model: this.modelId,
      metadata: {
        tokensUsed: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        inputTokens: result.usage.input_tokens || 0,
        outputTokens: result.usage.output_tokens || 0,
      },
    };
  }

  // ── Review Code ─────────────────────────────────────────────────────────

  /**
   * Review code for quality, security, and best practices.
   * @param {string} code - The code to review
   * @param {object} userContext - Forwarded user context
   * @returns {Promise<object>} { review, issues, suggestions, score, metadata }
   */
  async reviewCode(code, userContext) {
    logger.info('reviewCode called', { userId: userContext?.userId });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Review the following code for quality, security, performance, and best practices.

\`\`\`
${code}
\`\`\`

Respond with a JSON object (and nothing else) with these fields:
{
  "summary": "<overall assessment>",
  "score": <1-10 integer>,
  "issues": [
    { "severity": "critical|high|medium|low", "description": "<issue>", "line": <line number or null> }
  ],
  "suggestions": ["<improvement suggestion>"],
  "securityFlags": ["<security concern, if any>"]
}`,
      },
    ];

    const result = await this.callClaude(messages);

    const parsed = this._parseJSON(result.text, {
      summary: result.text,
      score: null,
      issues: [],
      suggestions: [],
      securityFlags: [],
    });

    return {
      intent: 'review',
      code,
      review: parsed.summary,
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
      securityFlags: parsed.securityFlags || [],
      score: parsed.score,
      model: this.modelId,
      metadata: {
        tokensUsed: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        inputTokens: result.usage.input_tokens || 0,
        outputTokens: result.usage.output_tokens || 0,
      },
    };
  }

  // ── Explain Code ────────────────────────────────────────────────────────

  /**
   * Explain code in plain language.
   * @param {string} code - The code to explain
   * @param {object} userContext - Forwarded user context
   * @returns {Promise<object>} { explanation, metadata }
   */
  async explainCode(code, userContext) {
    logger.info('explainCode called', { userId: userContext?.userId });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Explain the following code clearly and thoroughly.

\`\`\`
${code}
\`\`\`

Respond with a JSON object (and nothing else) with these fields:
{
  "explanation": "<clear high-level explanation>",
  "lineByLine": [
    { "lines": "<line range, e.g. 1-3>", "description": "<what these lines do>" }
  ],
  "complexity": "<time/space complexity if applicable, otherwise null>",
  "keyConcepts": ["<programming concept used>"]
}`,
      },
    ];

    const result = await this.callClaude(messages);

    const parsed = this._parseJSON(result.text, {
      explanation: result.text,
      lineByLine: [],
      complexity: null,
      keyConcepts: [],
    });

    return {
      intent: 'explain',
      code,
      explanation: parsed.explanation,
      lineByLine: parsed.lineByLine || [],
      complexity: parsed.complexity,
      keyConcepts: parsed.keyConcepts || [],
      model: this.modelId,
      metadata: {
        tokensUsed: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        inputTokens: result.usage.input_tokens || 0,
        outputTokens: result.usage.output_tokens || 0,
      },
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Attempt to parse a JSON response from Claude.
   * Falls back to a default object if parsing fails.
   * @param {string} text - Raw response text
   * @param {object} fallback - Fallback object
   * @returns {object}
   */
  _parseJSON(text, fallback) {
    try {
      // Strip markdown fences if Claude wraps in ```json ... ```
      const cleaned = text
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      logger.warn('Failed to parse Claude JSON response, using fallback', {
        textLength: text?.length,
        textPreview: text?.substring(0, 200),
      });
      return fallback;
    }
  }
}

export default CodeService;
