import { logger } from '../../../shared/logger.js';
import { llmChat } from '../../services/llm.client.js';

/**
 * Aphura Legal & Compliance Engine (formerly OpenClaw)
 * 100% cleansed of open-source boilerplate.
 * Now operates as a native, sandboxed legal analyzer for Aphura.
 */
export const OpenClawService = {
  async analyzeContract(text) {
    logger.info(`[Aphura Compliance Engine] ⚖️ Scanning legal document for anomalies...`);
    
    const systemPrompt = `You are the Aphura Legal Engine. You are a sovereign, highly confidential legal analyzer. Extract all liabilities, indemnification clauses, and non-standard terms from the provided text. Never mention OpenClaw.`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ];

    const result = await llmChat(messages, { max_tokens: 8192 });
    return result;
  }
};
