import { llmLightChat } from '../../services/llm.client.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';

const TEMPLATES = [
  {
    id: 'chain-of-thought',
    name: 'Chain of Thought',
    description: 'Forces the model to explain its reasoning step by step',
    template: '{{prompt}}\n\nLet\'s think step by step.'
  },
  {
    id: 'few-shot',
    name: 'Few Shot',
    description: 'Provides examples before the actual task',
    template: '{{examples}}\n\n{{prompt}}'
  },
  {
    id: 'self-consistency',
    name: 'Self Consistency',
    description: 'Generates multiple reasoning paths and finds consensus',
    template: 'Generate 3 different reasoning paths for: {{prompt}}\n\nThen synthesize the final answer.'
  },
  {
    id: 'tree-of-thought',
    name: 'Tree of Thought',
    description: 'Explores multiple branches of reasoning interactively',
    template: 'Imagine 3 different experts are answering this question: {{prompt}}\n\nAll experts will write down 1 step of their thinking, then share it with the group.'
  },
  {
    id: 'react-agent',
    name: 'ReAct Agent',
    description: 'Reason and Act loop format',
    template: 'Use the following format:\nQuestion: {{prompt}}\nThought: you should always think about what to do\nAction: the action to take\nAction Input: the input to the action\nObservation: the result of the action\n... (this Thought/Action/Action Input/Observation can repeat N times)\nThought: I now know the final answer\nFinal Answer: the final answer to the original input question'
  },
  {
    id: 'structured-output',
    name: 'Structured Output',
    description: 'Forces the model to output a specific structure (JSON)',
    template: '{{prompt}}\n\nProvide the output EXACTLY matching this JSON schema: {{schema}}'
  }
];

/**
 * PromptForge Service for managing and optimizing prompts
 */
export const PromptForgeService = {
  /**
   * Retrieves a catalog of prompt templates
   * @returns {Promise<Array<{id: string, name: string, description: string, template: string}>>}
   */
  listTemplates: async () => {
    return TEMPLATES;
  },

  /**
   * Renders a template with provided variables
   * @param {Object} params
   * @param {string} params.templateId The ID of the template
   * @param {Record<string, string>} params.variables Variables to inject into the template
   * @returns {Promise<{templateId: string, rendered: string, variables: Record<string, string>}>}
   */
  renderTemplate: async ({ templateId, variables }) => {
    const templateObj = TEMPLATES.find(t => t.id === templateId);
    if (!templateObj) {
      throw new Error(`Template with id '${templateId}' not found`);
    }

    let rendered = templateObj.template;
    for (const [key, value] of Object.entries(variables || {})) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return {
      templateId,
      rendered,
      variables: variables || {}
    };
  },

  /**
   * Uses AI to optimize a prompt for a given goal
   * @param {Object} params
   * @param {string} params.prompt The original prompt
   * @param {string} params.goal The desired goal of the prompt
   * @returns {Promise<{original: string, optimized: string, improvements: string[], model: string}>}
   */
  optimizePrompt: async ({ prompt, goal }) => {
    const messages = [
      {
        role: 'system',
        content: `You are a prompt engineering specialist. Rewrite the given prompt to maximize its effectiveness for the stated goal.
Return ONLY a valid JSON object: { "original": "string", "optimized": "string", "improvements": ["string"] }`,
      },
      {
        role: 'user',
        content: `Goal: ${goal}\nPrompt: ${prompt}`,
      },
    ];

    const res = await llmLightChat(messages, {
      model: config.llm?.lightModel || 'gpt-oss-20b',
      temperature: 0.1,
    });

    const content = res.choices?.[0]?.message?.content || '{}';
    try {
      const data = JSON.parse(content);
      return { ...data, model: config.llm?.lightModel || 'gpt-oss-20b' };
    } catch (err) {
      logger.error('[PromptForge] Failed to parse optimize response:', err.message);
      return { original: prompt, optimized: content, improvements: [], model: config.llm?.lightModel || 'gpt-oss-20b' };
    }
  },

  /**
   * Analyzes a prompt for clarity, specificity, and issues
   * @param {Object} params
   * @param {string} params.prompt The prompt to analyze
   * @returns {Promise<{analysis: string, score: number, suggestions: string[], model: string}>}
   */
  analyzePrompt: async ({ prompt }) => {
    const messages = [
      {
        role: 'system',
        content: `You are a prompt quality analyst. Analyze the prompt for clarity, specificity, potential edge cases, and overall quality.
Return ONLY a valid JSON object: { "analysis": "string", "score": number, "suggestions": ["string"] }`,
      },
      {
        role: 'user',
        content: `Analyze this prompt: ${prompt}`,
      },
    ];

    const res = await llmLightChat(messages, {
      model: config.llm?.lightModel || 'gpt-oss-20b',
      temperature: 0.1,
    });

    const content = res.choices?.[0]?.message?.content || '{}';
    try {
      const data = JSON.parse(content);
      return { ...data, model: config.llm?.lightModel || 'gpt-oss-20b' };
    } catch (err) {
      logger.error('[PromptForge] Failed to parse analyze response:', err.message);
      return { analysis: content, score: 0, suggestions: [], model: config.llm?.lightModel || 'gpt-oss-20b' };
    }
  },
};

export default PromptForgeService;
