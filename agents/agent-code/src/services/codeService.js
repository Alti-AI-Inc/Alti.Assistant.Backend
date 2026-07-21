/**
 * @fileoverview Code generation service for the Code Agent.
 * Calls Gemini 1.5 Pro via Vertex AI.
 *
 * Usage:
 *   const service = new CodeService();
 *   const result = await service.generateCode(prompt, userCtx, options);
 */

import { GoogleGenAI } from '@google/genai';
import config from '../../../../shared/config/index.js';
import { createLogger } from '../../../../shared/logging/index.js';
import agentConfig from '../config/index.js';

const { logger } = createLogger('code-service');

const QUALITY_PROFILES = {
  balanced: {
    temperature: 0.1,
    maxTokens: 8192,
    instruction:
      'Optimize for correctness, readability, and practical implementation details.',
  },
  strict: {
    temperature: 0.05,
    maxTokens: 10000,
    instruction:
      'Prioritize production-safe patterns, explicit error handling, and deterministic output.',
  },
  creative: {
    temperature: 0.2,
    maxTokens: 9000,
    instruction:
      'Propose elegant alternatives and developer-experience improvements while remaining correct.',
  },
};

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
- When reviewing, score on a 1-10 scale
- Prefer explicit assumptions over hidden guesses
- Surface security and reliability implications when relevant`;

// ── CodeService ──────────────────────────────────────────────────────────────

export class CodeService {
  constructor() {
    this.ai = new GoogleGenAI({
      vertexai: {
        project: config.gcp.projectId,
        location: config.gcp.vertexAiRegion || 'us-central1',
      },
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
      maxOutputTokens:
        options.maxTokens || agentConfig.defaults.maxOutputTokens,
      temperature: options.temperature ?? agentConfig.defaults.temperature,
    };

    const startTime = Date.now();
    const result = await this.ai.models.generateContent({
      model: this.modelId,
      contents: userPrompt,
      config: requestConfig,
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
        output_tokens: usage.candidatesTokenCount || 0,
      },
    };
  }

  // ── Generate Code ───────────────────────────────────────────────────────

  async generateCode(prompt, userContext, options = {}) {
    logger.info('generateCode called', {
      userId: userContext?.userId,
      language: options.language,
    });

    const language = this._normalizeLanguage(options.language || 'javascript');
    const qualityProfile = this._resolveQualityProfile(options.qualityProfile);
    const userPrompt = `Generate ${language} code for the following request.

Quality profile: ${qualityProfile.name}
Quality directive: ${qualityProfile.instruction}

Request: ${prompt}

Respond with a JSON object (and nothing else) with these fields:
{
  "code": "<the generated code>",
  "language": "<programming language>",
  "explanation": "<brief explanation of the code>",
  "tests": "<unit tests for the code, or empty string if not applicable>",
  "runInstructions": ["<ordered shell commands to install/run>"] ,
  "dependencies": ["<dependency names>"] ,
  "edgeCases": ["<important edge cases handled>"] ,
  "complexity": {
    "time": "<big-o or 'n/a'>",
    "space": "<big-o or 'n/a'>"
  },
  "assumptions": ["<explicit assumptions>"]
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt, {
      maxTokens: options.maxTokens || qualityProfile.maxTokens,
      temperature: options.temperature ?? qualityProfile.temperature,
    });

    const parsed = this._parseJSON(result.text, {
      code: result.text,
      language,
      explanation: '',
      tests: '',
      runInstructions: [],
      dependencies: [],
      edgeCases: [],
      complexity: { time: 'n/a', space: 'n/a' },
      assumptions: [],
    });

    return {
      intent: 'generate',
      code: parsed.code,
      language: parsed.language || language,
      explanation: parsed.explanation || '',
      tests: parsed.tests || '',
      runInstructions: parsed.runInstructions || [],
      dependencies: parsed.dependencies || [],
      edgeCases: parsed.edgeCases || [],
      complexity: parsed.complexity || { time: 'n/a', space: 'n/a' },
      assumptions: parsed.assumptions || [],
      model: this.modelId,
      metadata: {
        tokensUsed:
          (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        inputTokens: result.usage.input_tokens || 0,
        outputTokens: result.usage.output_tokens || 0,
        qualityProfile: qualityProfile.name,
      },
    };
  }

  // ── Architect Code ──────────────────────────────────────────────────────

  async architectCode(prompt, userContext, options = {}) {
    logger.info('architectCode called', {
      userId: userContext?.userId,
    });

    const qualityProfile = this._resolveQualityProfile(options.qualityProfile);
    const userPrompt = `Provide a high-level technical design, architecture, and implementation plan for the following request.
Do not write the final code, only provide the structure, components, data flow, and design patterns to be used.

Quality profile: ${qualityProfile.name}
Quality directive: ${qualityProfile.instruction}

Request: ${prompt}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt, {
      maxTokens: options.maxTokens || qualityProfile.maxTokens,
      temperature: options.temperature ?? qualityProfile.temperature,
    });

    return {
      intent: 'architect',
      explanation: result.text,
      model: this.modelId,
      metadata: {
        tokensUsed:
          (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        inputTokens: result.usage.input_tokens || 0,
        outputTokens: result.usage.output_tokens || 0,
        qualityProfile: qualityProfile.name,
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
  "changesApplied": ["<list of changes made>"],
  "regressionTests": ["<tests to prevent reintroducing this bug>"],
  "preventionChecklist": ["<guardrails to avoid this class of bug>"]
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt);

    const parsed = this._parseJSON(result.text, {
      fixedCode: code,
      rootCause: 'Unable to determine root cause.',
      explanation: result.text,
      changesApplied: [],
      regressionTests: [],
      preventionChecklist: [],
    });

    return {
      intent: 'debug',
      originalCode: code,
      error,
      fixedCode: parsed.fixedCode,
      rootCause: parsed.rootCause,
      explanation: parsed.explanation,
      changesApplied: parsed.changesApplied || [],
      regressionTests: parsed.regressionTests || [],
      preventionChecklist: parsed.preventionChecklist || [],
      model: this.modelId,
      metadata: {
        tokensUsed:
          (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
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
  "positives": ["<what is already good>"],
  "issues": [
    { "severity": "critical|high|medium|low", "description": "<issue>", "line": <line number or null> }
  ],
  "suggestions": ["<improvement suggestion>"],
  "securityFlags": ["<security concern, if any>"],
  "priorityFixes": ["<ordered top fixes to apply first>"]
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt);

    const parsed = this._parseJSON(result.text, {
      summary: result.text,
      score: null,
      positives: [],
      issues: [],
      suggestions: [],
      securityFlags: [],
      priorityFixes: [],
    });

    return {
      intent: 'review',
      code,
      review: parsed.summary,
      positives: parsed.positives || [],
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
      securityFlags: parsed.securityFlags || [],
      priorityFixes: parsed.priorityFixes || [],
      score: parsed.score,
      model: this.modelId,
      metadata: {
        tokensUsed:
          (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
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
  "mentalModel": "<simple conceptual model>",
  "lineByLine": [
    { "lines": "<line range, e.g. 1-3>", "description": "<what these lines do>" }
  ],
  "complexity": "<time/space complexity if applicable, otherwise null>",
  "keyConcepts": ["<programming concept used>"],
  "pitfalls": ["<common mistakes to watch for>"]
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt);

    const parsed = this._parseJSON(result.text, {
      explanation: result.text,
      mentalModel: '',
      lineByLine: [],
      complexity: null,
      keyConcepts: [],
      pitfalls: [],
    });

    return {
      intent: 'explain',
      code,
      explanation: parsed.explanation,
      mentalModel: parsed.mentalModel || '',
      lineByLine: parsed.lineByLine || [],
      complexity: parsed.complexity,
      keyConcepts: parsed.keyConcepts || [],
      pitfalls: parsed.pitfalls || [],
      model: this.modelId,
      metadata: {
        tokensUsed:
          (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
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
      try {
        const extracted = this._extractJSONObject(text);
        if (extracted) {
          return JSON.parse(extracted);
        }
      } catch {
        // Fall through to fallback handling below.
      }

      logger.warn('Failed to parse Gemini JSON response, using fallback', {
        textLength: text?.length,
        textPreview: text?.substring(0, 200),
      });
      return fallback;
    }
  }

  _extractJSONObject(text = '') {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    return text.substring(start, end + 1);
  }

  _normalizeLanguage(language) {
    const normalized = String(language || '')
      .toLowerCase()
      .trim();
    if (agentConfig.supportedLanguages.includes(normalized)) {
      return normalized;
    }
    return 'javascript';
  }

  _resolveQualityProfile(profile) {
    const requested = String(profile || 'balanced')
      .toLowerCase()
      .trim();
    const selected = QUALITY_PROFILES[requested] || QUALITY_PROFILES.balanced;
    return {
      name: QUALITY_PROFILES[requested] ? requested : 'balanced',
      ...selected,
    };
  }
}

export default CodeService;
