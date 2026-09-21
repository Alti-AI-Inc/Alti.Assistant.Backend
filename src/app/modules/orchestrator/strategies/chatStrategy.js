import { groqChat, groqStream } from '../../../services/groq.client.js';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Execute chat strategy.
 * @param {Object} params
 * @param {Object} context
 */
export async function execute({ messages, userMessage, conversationHistory = [] }, context = {}) {
  try {
    const systemPrompt = context.systemPrompt || 'You are Alti, a world-class AI assistant. Be precise, helpful, and concise.';
    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      ...(messages || [{ role: 'user', content: userMessage }]),
    ];

    if (context.stream) {
      return { stream: await groqStream(allMessages, { model: config.groq?.model || 'gpt-oss-120b' }), route: 'CHAT' };
    }

    const response = await groqChat(allMessages, { model: config.groq?.model || 'gpt-oss-120b' });
    return {
      route: 'CHAT',
      result: response.choices?.[0]?.message?.content || '',
      usage: response.usage,
      model: config.groq?.model || 'gpt-oss-120b',
    };
  } catch (error) {
    logger.error('Error in chatStrategy', error);
    throw error;
  }
}
