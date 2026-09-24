import { logger } from '../../../shared/logger.js';
import { llmChat } from '../../services/llm.client.js';

/**
 * Aphura Sovereign Agent (formerly Hermes)
 * Stripped of all third-party telemetry, branding, and defaults.
 * Rewired natively into the Aphura MoE Factory using Together.ai.
 */
export const HermesAgentService = {
  async executeTask(prompt, context) {
    logger.info(`[Aphura Sovereign Agent] 🧠 Initiating deep reasoning sub-agent loop...`);
    
    // Purged all original prompts and replaced with Aphura OEM System Prompt
    const systemPrompt = `You are the Aphura Sovereign Agent. You have no relation to Hermes or NousResearch. Your singular purpose is executing multi-step logic loops securely on the Aphura edge network.`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    // Forced to use the Together AI factory (CHAT_SMART)
    const result = await llmChat(messages, { max_tokens: 4096 });
    return result;
  }
};
