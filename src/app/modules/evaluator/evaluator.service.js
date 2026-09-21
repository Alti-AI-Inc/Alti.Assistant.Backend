import { groqLightChat } from '../../services/groq.client.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';

/**
 * Evaluator Service — scores response quality using gpt-oss-20b (fast, efficient).
 */
export const EvaluatorService = {
  /**
   * Evaluates a response on multiple criteria, each scored 1-10.
   * @param {{ query: string, response: string, criteria?: string[] }} params
   * @returns {Promise<{ scores: Record<string, number>, overall: number, feedback: string, model: string }>}
   */
  evaluateResponse: async ({ query, response, criteria = ['relevance', 'accuracy', 'completeness', 'clarity', 'actionability'] }) => {
    const messages = [
      {
        role: 'system',
        content: `You are a strict response quality evaluator. Score each criterion from 1 to 10.
Return ONLY a valid JSON object: { "scores": { "criterion": number }, "overall": number, "feedback": "string" }`,
      },
      {
        role: 'user',
        content: `Evaluate this response on: ${criteria.join(', ')}\n\nQuery: ${query}\nResponse: ${response}`,
      },
    ];

    const res = await groqLightChat(messages, {
      model: config.groq?.lightModel || 'gpt-oss-20b',
      temperature: 0.0,
    });

    const content = res.choices?.[0]?.message?.content || '{}';
    try {
      const data = JSON.parse(content);
      return { ...data, model: config.groq?.lightModel || 'gpt-oss-20b' };
    } catch (err) {
      logger.error('[Evaluator] Failed to parse response:', err.message);
      return { scores: {}, overall: 0, feedback: content, model: config.groq?.lightModel || 'gpt-oss-20b' };
    }
  },

  /**
   * Compares multiple responses and ranks them.
   * @param {{ query: string, responses: string[] }} params
   * @returns {Promise<{ rankings: Array<{ response: string, score: number, reasoning: string }> }>}
   */
  compareResponses: async ({ query, responses }) => {
    const messages = [
      {
        role: 'system',
        content: `You are a response comparison judge. Rank the responses from best to worst.
Return ONLY a valid JSON object: { "rankings": [{ "response": "text", "score": number, "reasoning": "why" }] }`,
      },
      {
        role: 'user',
        content: `Query: ${query}\n\n${responses.map((r, i) => `[Response ${i + 1}]: ${r}`).join('\n\n')}`,
      },
    ];

    const res = await groqLightChat(messages, {
      model: config.groq?.lightModel || 'gpt-oss-20b',
      temperature: 0.0,
    });

    const content = res.choices?.[0]?.message?.content || '{}';
    try {
      return JSON.parse(content);
    } catch (err) {
      logger.error('[Evaluator] Failed to parse compare response:', err.message);
      return { rankings: [], raw: content };
    }
  },

  /**
   * Generates evaluation rubric for a given task type.
   * @param {{ taskType: string }} params
   * @returns {Promise<{ taskType: string, criteria: Array<{ name: string, description: string }> }>}
   */
  generateRubric: async ({ taskType }) => {
    const messages = [
      {
        role: 'system',
        content: `You are an evaluation framework designer. Generate scoring criteria for the given task type.
Return ONLY a valid JSON object: { "criteria": [{ "name": "string", "description": "string" }] }`,
      },
      {
        role: 'user',
        content: `Generate evaluation criteria for task type: ${taskType}`,
      },
    ];

    const res = await groqLightChat(messages, {
      model: config.groq?.lightModel || 'gpt-oss-20b',
      temperature: 0.1,
    });

    const content = res.choices?.[0]?.message?.content || '{}';
    try {
      const data = JSON.parse(content);
      return { taskType, criteria: data.criteria || [], model: config.groq?.lightModel || 'gpt-oss-20b' };
    } catch (err) {
      logger.error('[Evaluator] Failed to parse rubric response:', err.message);
      return { taskType, criteria: [], raw: content };
    }
  },
};

export default EvaluatorService;
