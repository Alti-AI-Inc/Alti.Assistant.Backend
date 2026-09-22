import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import httpStatus from 'http-status';
import { BufferMemory } from 'langchain/memory';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import UserModel from '../auth/auth.model.js';
import Chat from './chat.model.js';
import { CHAT_RESPONSE_SERVICE_POST } from './chat.constant.js';
import { groqChat } from '../../services/groq.client.js';

import { SovereignRouterService } from '../orchestrator/sovereignRouter.service.js';

const chatService = async (sessionId, prompt, userId, userContext = {}) => {
  let memory = sessionMemoryStore[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });
    sessionMemoryStore[sessionId] = memory;
  }

  try {
    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Call Sovereign Data Intelligence Router (checks all 14 subsystems + citations)
    const sovereignResult = await SovereignRouterService.handlePromptJson({
      prompt,
      sessionId,
      userId,
      userContext,
    });

    const reply = sovereignResult.reply || 'No reply generated';
    await memory.chatHistory.addMessage(new AIMessage(reply));

    const payload = {
      prompt,
      sessionId,
      reply,
      route: sovereignResult.route,
      reference: sovereignResult.references || [],
      citations: sovereignResult.citations || [],
      total_time: sovereignResult.total_time,
    };

    if (payload) {
      await RedisClient.publish(
        CHAT_RESPONSE_SERVICE_POST,
        JSON.stringify(payload)
      );
    }
    return payload;
  } catch (err) {
    logger.error('Chat Service Error:', err);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Chat Service failed'
    );
  }
};

export const ChatAiService = {
  chatService,
  geminiService: chatService, // alias for backwards compatibility
};

export const GeminiAiService = ChatAiService; // alias for backwards compatibility

export default ChatAiService;
