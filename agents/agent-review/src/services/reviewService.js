import { GoogleGenAI } from '@google/genai';
import config from '../../../../shared/config/index.js';
import { createLogger } from '../../../../shared/logging/index.js';
import agentConfig from '../config/index.js';

const { logger } = createLogger('review-service');

const QUALITY_PROFILES = {
  balanced: {
    temperature: 0.08,
    maxTokens: 8192,
    instruction: 'Balance depth, precision, and practical recommendations.',
  },
  strict: {
    temperature: 0.03,
    maxTokens: 10000,
    instruction:
      'Prioritize production risk identification, correctness, and explicit remediation.',
  },
  concise: {
    temperature: 0.05,
    maxTokens: 5000,
    instruction:
      'Focus on top issues, short rationale, and immediate action items.',
  },
};

const SYSTEM_PROMPT = `You are a principal reviewer for software, technical documents, and architecture decisions.
You produce objective, evidence-based assessments that are production oriented.

Rules:
- Be precise and avoid vague statements.
- Tie findings to clear impact (security, reliability, performance, maintainability, compliance).
- Rank issues by severity and priority.
- Include actionable remediation steps.
- Make assumptions explicit when information is missing.
- Return valid JSON only when asked.`;

export class ReviewService {
  constructor() {
    this.ai = new GoogleGenAI({
      vertexai: {
        project: config.gcp.projectId,
        location: config.gcp.vertexAiRegion || 'us-central1',
      },
    });

    this.modelId = 'gemini-3.1-pro';

    logger.info('ReviewService initialized', {
      model: this.modelId,
      location: config.gcp.vertexAiRegion || 'us-central1',
      projectId: config.gcp.projectId ? '***' : 'NOT SET',
    });
  }

  async callGemini(systemInstruction, userPrompt, options = {}) {
    if (!config.gcp.projectId) {
      throw new Error('GCP_PROJECT_ID is not set - cannot call Vertex AI.');
    }

    const requestConfig = {
      systemInstruction,
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

    logger.info('Review model call completed', {
      latencyMs,
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
      responseLength: replyText.length,
    });

    return {
      text: replyText,
      usage: {
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: usage.candidatesTokenCount || 0,
      },
    };
  }

  async reviewContent(payload, userContext, options = {}) {
    const reviewType = this._normalizeReviewType(payload.reviewType);
    const qualityProfile = this._resolveQualityProfile(options.qualityProfile);

    const rubricText =
      Array.isArray(payload.rubric) && payload.rubric.length
        ? payload.rubric.map((item, idx) => `${idx + 1}. ${item}`).join('\n')
        : 'No custom rubric provided.';

    const userPrompt = `Perform a ${reviewType} review for the following content.

Context:
${payload.context || 'No additional context provided.'}

Rubric:
${rubricText}

Quality profile: ${qualityProfile.name}
Quality directive: ${qualityProfile.instruction}

Content:
${payload.content}

Respond with a JSON object and nothing else:
{
  "reviewType": "${reviewType}",
  "overallSummary": "<2-4 sentence executive summary>",
  "score": <integer 1-10>,
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "category": "security|reliability|performance|maintainability|correctness|clarity|compliance|other",
      "title": "<short issue title>",
      "impact": "<why this matters>",
      "evidence": "<quote or reference from content>",
      "recommendation": "<specific remediation>"
    }
  ],
  "strengths": ["<what is good and should be retained>"],
  "quickWins": ["<small, high ROI fixes>"],
  "assumptions": ["<explicit assumptions made>"]
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt, {
      maxTokens: options.maxTokens || qualityProfile.maxTokens,
      temperature: options.temperature ?? qualityProfile.temperature,
    });

    const parsed = this._parseJSON(result.text, {
      reviewType,
      overallSummary: result.text,
      score: null,
      findings: [],
      strengths: [],
      quickWins: [],
      assumptions: [],
    });

    return {
      ...parsed,
      model: this.modelId,
      metadata: {
        reviewer: 'agent-review',
        qualityProfile: qualityProfile.name,
        generatedAt: new Date().toISOString(),
        userId: userContext?.userId,
        tokensUsed:
          (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        inputTokens: result.usage.input_tokens || 0,
        outputTokens: result.usage.output_tokens || 0,
      },
    };
  }

  async compareRevisions(payload, userContext, options = {}) {
    const reviewType = this._normalizeReviewType(payload.reviewType);
    const qualityProfile = this._resolveQualityProfile(options.qualityProfile);

    const userPrompt = `Compare ORIGINAL and REVISED versions of a ${reviewType} artifact.
Assess whether the revised version is objectively better and identify regressions.

ORIGINAL:
${payload.original}

REVISED:
${payload.revised}

Respond with JSON only:
{
  "reviewType": "${reviewType}",
  "verdict": "improved|mixed|regressed",
  "summary": "<high-level comparison summary>",
  "improvements": ["<specific improvement>"] ,
  "regressions": ["<specific regression>"] ,
  "remainingGaps": ["<what still needs work>"] ,
  "nextActions": ["<ordered next actions>"]
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt, {
      maxTokens: options.maxTokens || qualityProfile.maxTokens,
      temperature: options.temperature ?? qualityProfile.temperature,
    });

    const parsed = this._parseJSON(result.text, {
      reviewType,
      verdict: 'mixed',
      summary: result.text,
      improvements: [],
      regressions: [],
      remainingGaps: [],
      nextActions: [],
    });

    return {
      ...parsed,
      model: this.modelId,
      metadata: {
        reviewer: 'agent-review',
        qualityProfile: qualityProfile.name,
        generatedAt: new Date().toISOString(),
        userId: userContext?.userId,
      },
    };
  }

  async evaluateChecklist(payload, userContext, options = {}) {
    const reviewType = this._normalizeReviewType(payload.reviewType);
    const qualityProfile = this._resolveQualityProfile(options.qualityProfile);

    const checklistText = payload.checklist
      .map((item, idx) => `${idx + 1}. ${item}`)
      .join('\n');

    const userPrompt = `Evaluate the following content against a checklist.

Review type: ${reviewType}
Checklist:
${checklistText}

Content:
${payload.content}

Respond with JSON only:
{
  "reviewType": "${reviewType}",
  "passRate": "<percentage string, e.g., 78%>",
  "results": [
    {
      "item": "<checklist item>",
      "status": "pass|partial|fail",
      "notes": "<reasoning and evidence>",
      "fix": "<what to change if partial/fail>"
    }
  ],
  "criticalFailures": ["<critical failed items>"] ,
  "recommendedOrder": ["<ordered remediation plan>"]
}`;

    const result = await this.callGemini(SYSTEM_PROMPT, userPrompt, {
      maxTokens: options.maxTokens || qualityProfile.maxTokens,
      temperature: options.temperature ?? qualityProfile.temperature,
    });

    const parsed = this._parseJSON(result.text, {
      reviewType,
      passRate: '0%',
      results: [],
      criticalFailures: [],
      recommendedOrder: [],
    });

    return {
      ...parsed,
      model: this.modelId,
      metadata: {
        reviewer: 'agent-review',
        qualityProfile: qualityProfile.name,
        generatedAt: new Date().toISOString(),
        userId: userContext?.userId,
      },
    };
  }

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
        // Fallback below
      }

      logger.warn('Failed to parse review JSON, using fallback', {
        textLength: text?.length,
        textPreview: text?.substring(0, 180),
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

  _normalizeReviewType(reviewType) {
    const normalized = String(reviewType || '')
      .toLowerCase()
      .trim();
    if (agentConfig.reviewTypes.includes(normalized)) {
      return normalized;
    }
    return 'general';
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

export default ReviewService;
