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

const sessionMemoryStore = {};

const chatService = async (sessionId, prompt, userId) => {
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

    // Call Groq AI to generate a response
    const historyMessages = await memory.chatHistory.getMessages();
    const messages = historyMessages.map(msg => ({
      role: msg._getType() === 'human' ? 'user' : 'assistant',
      content: msg.content
    }));

    const result = await groqChat(messages, { model: config.groq?.model || 'gpt-oss-120b' });
    const reply =
      result?.choices?.[0]?.message?.content ||
      'No reply generated';

    await memory.chatHistory.addMessage(new AIMessage(reply));

    const responseData = {
      prompt,
      model: config.groq?.model || 'gpt-oss-120b',
      reply,
      total_time: result?.usage?.total_time || 0,
    };

    let chatSession = await Chat.findOne({ user: userId, sessionId });

    if (chatSession) {
      chatSession.responses.push(responseData);
      await chatSession.save();
    } else {
      chatSession = await Chat.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      await UserModel.findByIdAndUpdate(userId, {
        $push: { chatAiSessions: chatSession._id },
      });
    }

    const payload = { prompt, sessionId, reply };
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
