import { logger } from '../../shared/logger.js';

/**
 * Memory Service — Mem0-powered long-term agent memory layer.
 * Apache 2.0 License.
 *
 * Provides per-user, per-agent persistent memory:
 * - Extracts facts from conversations
 * - Retrieves relevant memories for context injection
 * - Self-manages updates (conflict resolution, deduplication)
 */

let MemoryClient;
let memoryInstance = null;
let initialized = false;

async function initMem0() {
  if (initialized) return;
  try {
    const mem0 = await import('mem0ai');
    MemoryClient = mem0.default || mem0.MemoryClient || mem0.Memory;
    if (MemoryClient) {
      memoryInstance = new MemoryClient({
        apiKey: process.env.MEM0_API_KEY || undefined,
        // Self-hosted mode uses local vector store if no API key
      });
      initialized = true;
      logger.info('[MemoryService] Mem0 initialized');
    }
  } catch (err) {
    logger.warn(`[MemoryService] Mem0 not available, using fallback in-memory store: ${err.message}`);
    initialized = true; // Mark as initialized even with fallback
  }
}

// Fallback in-memory store when Mem0 is unavailable
const fallbackStore = new Map();

function getFallbackKey(userId, agentId) {
  return `${userId}:${agentId || 'global'}`;
}

export const MemoryService = {
  /**
   * Add a memory from a conversation.
   * Mem0 automatically extracts facts and preferences.
   */
  async addMemory(userId, agentId, messages, metadata = {}) {
    await initMem0();

    const memoryData = {
      messages: Array.isArray(messages) ? messages : [{ role: 'user', content: messages }],
      user_id: userId,
      agent_id: agentId || undefined,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
      },
    };

    if (memoryInstance) {
      try {
        const result = await memoryInstance.add(memoryData.messages, {
          user_id: memoryData.user_id,
          agent_id: memoryData.agent_id,
          metadata: memoryData.metadata,
        });
        logger.info(`[MemoryService] Memory added for user ${userId}, agent ${agentId}`);
        return result;
      } catch (err) {
        logger.error(`[MemoryService] Failed to add memory: ${err.message}`);
      }
    }

    // Fallback: store raw messages
    const key = getFallbackKey(userId, agentId);
    const existing = fallbackStore.get(key) || [];
    existing.push({
      id: `mem_${Date.now()}`,
      ...memoryData,
      createdAt: new Date().toISOString(),
    });
    // Keep last 100 memories per user/agent
    if (existing.length > 100) existing.splice(0, existing.length - 100);
    fallbackStore.set(key, existing);
    return { status: 'stored_fallback', count: existing.length };
  },

  /**
   * Search memories relevant to a query.
   * Returns memories ranked by relevance.
   */
  async searchMemories(userId, agentId, query, limit = 10) {
    await initMem0();

    if (memoryInstance) {
      try {
        const results = await memoryInstance.search(query, {
          user_id: userId,
          agent_id: agentId || undefined,
          limit,
        });
        return results?.results || results || [];
      } catch (err) {
        logger.error(`[MemoryService] Search failed: ${err.message}`);
      }
    }

    // Fallback: simple keyword match
    const key = getFallbackKey(userId, agentId);
    const memories = fallbackStore.get(key) || [];
    const queryLower = query.toLowerCase();
    return memories
      .filter((m) => {
        const content = JSON.stringify(m.messages || '').toLowerCase();
        return content.includes(queryLower);
      })
      .slice(-limit)
      .map((m) => ({
        id: m.id,
        memory: m.messages?.[0]?.content || '',
        score: 0.5,
        metadata: m.metadata,
      }));
  },

  /**
   * Get all memories for a user/agent pair.
   */
  async getMemories(userId, agentId) {
    await initMem0();

    if (memoryInstance) {
      try {
        const results = await memoryInstance.getAll({
          user_id: userId,
          agent_id: agentId || undefined,
        });
        return results?.results || results || [];
      } catch (err) {
        logger.error(`[MemoryService] GetAll failed: ${err.message}`);
      }
    }

    const key = getFallbackKey(userId, agentId);
    return fallbackStore.get(key) || [];
  },

  /**
   * Delete all memories for a user/agent pair.
   */
  async deleteMemories(userId, agentId) {
    await initMem0();

    if (memoryInstance) {
      try {
        await memoryInstance.deleteAll({
          user_id: userId,
          agent_id: agentId || undefined,
        });
        logger.info(`[MemoryService] Memories deleted for user ${userId}, agent ${agentId}`);
        return { deleted: true };
      } catch (err) {
        logger.error(`[MemoryService] Delete failed: ${err.message}`);
      }
    }

    const key = getFallbackKey(userId, agentId);
    fallbackStore.delete(key);
    return { deleted: true };
  },

  /**
   * Build a memory context string for injection into agent system prompt.
   * Returns formatted memories ready for LLM consumption.
   */
  async buildMemoryContext(userId, agentId, query) {
    const memories = await this.searchMemories(userId, agentId, query, 5);

    if (!memories || memories.length === 0) return '';

    const memoryLines = memories
      .map((m, i) => `[Memory ${i + 1}] ${m.memory || m.text || JSON.stringify(m)}`)
      .join('\n');

    return `\n--- Relevant Memories ---\n${memoryLines}\n--- End Memories ---\n`;
  },
};

export default MemoryService;
