import { logger } from '../../../shared/logger.js';

export const SupervisorService = {
  async routePrompt(prompt) {
    logger.info(`[LangChain Supervisor] Analyzing raw prompt intent: "${prompt.slice(0, 50)}..."`);
    
    const promptLower = prompt.toLowerCase();
    let route = 'chat'; // default

    if (promptLower.includes('research') || promptLower.includes('find out') || promptLower.includes('search')) {
      route = 'deep_research';
      logger.info(`[LangChain Supervisor] ➡️ Routing to Exa.ai Deep Research Swarm`);
    } else if (promptLower.includes('deploy') || promptLower.includes('build app')) {
      route = 'deploy';
      logger.info(`[LangChain Supervisor] ➡️ Routing to Liberty Prompt-to-URL Compiler`);
    } else if (promptLower.includes('book') || promptLower.includes('email') || promptLower.includes('github')) {
      route = 'composio';
      logger.info(`[LangChain Supervisor] ➡️ Routing to Composio.dev Action Executor`);
    } else if (promptLower.includes('click') || promptLower.includes('desktop')) {
      route = 'computer_use';
      logger.info(`[LangChain Supervisor] ➡️ Routing to Desktop GUI Automation`);
    } else {
      logger.info(`[LangChain Supervisor] ➡️ Routing to Standard Together.ai Chat`);
    }

    return { route, prompt };
  }
};
