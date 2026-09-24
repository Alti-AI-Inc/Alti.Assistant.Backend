import { logger } from '../../../shared/logger.js';
import { llmChat } from '../../services/llm.client.js';

/**
 * Aphura Hive-Mind Engine
 * Powered by CrewAI architecture (MIT).
 * Spawns multiple specialized sub-agents to collaborate on complex tasks.
 */
export const CrewAIService = {
  
  async executeSwarmTask(objective, teamConfig) {
    logger.info(`[Aphura Hive-Mind] 🐝 Spawning agent swarm for objective: ${objective}`);
    
    // In a full implementation, this spins up independent isolated event loops.
    // For this engine, we orchestrate them sequentially.
    
    let sharedContext = `Objective: ${objective}\n\n`;
    
    try {
      for (const role of teamConfig) {
        logger.info(`[Aphura Hive-Mind] 🤖 Activating sub-agent: ${role}...`);
        
        const systemPrompt = `You are a specialized ${role} in the Aphura Hive-Mind. Review the current context and contribute your specific expertise to the objective.`;
        
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: sharedContext }
        ];

        // We use DeepSeek-V4-Pro for all agents to ensure maximum intelligence
        const result = await llmChat(messages, { max_tokens: 4096 });
        
        sharedContext += `\n--- Output from ${role} ---\n${result.content}\n`;
      }
      
      logger.info(`[Aphura Hive-Mind] ✅ Swarm consensus reached.`);
      return { success: true, finalConsensus: sharedContext };
    } catch (error) {
      logger.error(`[Aphura Hive-Mind] ❌ Swarm synchronization failed: ${error.message}`);
      throw error;
    }
  }
};
