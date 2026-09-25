import { logger } from '../../../shared/logger.js';
import { OmniDataTools } from "../ai/tools/omnidata.tools.js";

export const SupervisorService = {
  async routePrompt(prompt) {
    logger.info(`[LangChain Supervisor] Analyzing raw prompt intent: "${prompt.slice(0, 50)}..."`);
    
    const promptLower = prompt.toLowerCase();
    let route = 'chat'; // default

    if (promptLower.includes('research') || promptLower.includes('find out') || promptLower.includes('search')) {
      route = 'deep_research';
      logger.info(`[LangChain Supervisor] ➡️ Routing to Exa.ai Deep Research Swarm`);
    } else if (promptLower.includes('weather') || promptLower.includes('flight') || promptLower.includes('crypto') || promptLower.includes('news')) {
      route = 'omnidata_agent';
      logger.info(`[LangChain Supervisor] ➡️ Routing to OmniData Aggregator Agent`);
    } else if (promptLower.includes('rust') || promptLower.includes('wasm') || promptLower.includes('c++')) {
      route = 'wasm_engine';
      logger.info(`[LangChain Supervisor] ➡️ Routing to WebAssembly V8 Sandbox`);
    } else if (promptLower.includes('deploy') || promptLower.includes('build app')) {
      route = 'deploy';
      logger.info(`[LangChain Supervisor] ➡️ Routing to Liberty Prompt-to-URL Compiler`);
    } else if (promptLower.includes('book') || promptLower.includes('email') || promptLower.includes('github')) {
      route = 'composio';
      logger.info(`[LangChain Supervisor] ➡️ Routing to Composio.dev Action Executor`);
    } else if (promptLower.includes("workflow") || promptLower.includes("manage agent") || promptLower.includes("paperclip")) {
      route = "paperclip";
      logger.info(`[LangChain Supervisor] ➡️ Routing to Paperclip AI Agent Manager`);
    } else if (promptLower.includes('click') || promptLower.includes('desktop')) {
      route = 'computer_use';
      logger.info(`[LangChain Supervisor] ➡️ Routing to Desktop GUI Automation`);
    } else {
      logger.info(`[LangChain Supervisor] ➡️ Routing to Standard Together.ai Chat`);
    }

    return { route, prompt };
  }
};
