/**
 * @fileoverview Code generation service for the Code Agent.
 * Calls Gemini 1.5 Pro via Vertex AI.
 *
 * Usage:
 *   const service = new CodeService();
 *   const result = await service.generateCode(prompt, userCtx, options);
 */

import { GoogleGenAI } from '@google/genai';
import { createLogger } from '../../../../shared/logging/index.js';
import agentConfig from '../config/index.js';
import config from '../../../../shared/config/index.js';

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
    this.ai = new GoogleGenAI({ 
      vertexai: { project: config.gcp.projectId, location: config.gcp.vertexAiRegion || 'us-central1' } 
    });
    this.modelId = 'gemini-3.1-pro';

    logger.info('CodeService initialized with Vertex AI Gemini', {
      model: this.modelId,
      location: config.gcp.vertexAiRegion || 'us-central1',
      projectId: config.gcp.projectId ? '***' : 'NOT SET',
    });
  }

  // ── Core Gemini Caller ──────────────────────────────────────────────────

  /**
   * Send messages to Gemini via Vertex AI.
   * @param {string} systemInstruction - The system instructions
   * @param {string} userPrompt - The user's prompt
   * @param {object} [options] - Generation options
   * @param {number} [options.maxTokens=8192]
   * @param {number} [options.temperature=0.1]
   * @returns {Promise<{text: string, usage: object}>}
   */
  async callGemini(systemInstruction, userPrompt, options = {}) {
    if (!config.gcp.projectId) {
      throw new Error('GCP_PROJECT_ID is not set — cannot call Vertex AI.');
    }

    const requestConfig = {
      systemInstruction: systemInstruction,
      maxOutputTokens: options.maxTokens || agentConfig.defaults.maxOutputTokens,
      temperature: options.temperature ?? agentConfig.defaults.temperature,
    };

    const startTime = Date.now();
    const result = await this.ai.models.generateContent({
      model: this.modelId,
      contents: userPrompt,
      config: requestConfig
    });
    const latencyMs = Date.now() - startTime;

    const replyText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = result.usageMetadata || {};

    logger.info('Gemini call completed', {
      latencyMs,
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
    });

    return {
      text: replyText,
      usage: {
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: usage.candidatesTokenCount || 0
      },
    };
  }

  // ── Generate Code ───────────────────────────────────────────────────────

  async generateCode(prompt, userContext, options = {}) {
    logger.info('generateCode called', {
      userId: userContext?.userId,
      language: options.language,
    });

    const language = options.language || 'javascript';
    const userPrompt = `Generate ${language} code for the following request.

Request: ${prompt}

Respond with a JSON object (and nothing else) with these fields:
{
  "code": "<the generated code>",
  "language": "<programming language>",
  "explanation": "<brief explanation of the code>",
  "tests": "<unit tests for the code, or empty string if not applicable>"
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt, {
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

  async debugCode(code, error, userContext) {
    logger.info('debugCode called', { userId: userContext?.userId });

    const userPrompt = `Debug the following code. An error is occurring.

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
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt);

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

  async reviewCode(code, userContext) {
    logger.info('reviewCode called', { userId: userContext?.userId });

    const userPrompt = `Review the following code for quality, security, performance, and best practices.

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
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt);

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

  async explainCode(code, userContext) {
    logger.info('explainCode called', { userId: userContext?.userId });

    const userPrompt = `Explain the following code clearly and thoroughly.

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
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt);

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

  _parseJSON(text, fallback) {
    try {
      const cleaned = text
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      logger.warn('Failed to parse Gemini JSON response, using fallback', {
        textLength: text?.length,
        textPreview: text?.substring(0, 200),
      });
      return fallback;
    }
  }
}

export default CodeService;
