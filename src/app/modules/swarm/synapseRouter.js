import { SWARM_REGISTRY } from './swarm.registry.js';

/**
 * Synapse Routing Orchestrator
 * Performs fast, multi-tier intent matching and dynamic execution chain assembly.
 */
export class SynapseRouter {
  /**
   * Identifies and ranks micro-agents that best match the query context.
   * @param {string} query - Raw user query
   * @returns {Array<Object>} Sorted list of recruited micro-agent profiles
   */
  static routeQuery(query) {
    // HARD LAW: This platform is a clean, direct chatbot and search engine like ChatGPT/Perplexity.
    // It is strictly forbidden from recruiting technical/code agents, and must NEVER generate code output.
    if (!query || typeof query !== 'string') {
      return [SWARM_REGISTRY.general_chat_assistant];
    }

    const lowerQuery = query.toLowerCase();
    
    // Check for translation, summarization, or brainstorming intents
    const isTranslation = ['translate', 'spanish', 'french', 'german', 'chinese', 'japanese', 'language', 'traduccion'].some(kw => lowerQuery.includes(kw));
    const isSummary = ['summarize', 'summary', 'tldr', 'executive summary', 'brief', 'shorten', 'outline'].some(kw => lowerQuery.includes(kw));
    const isBrainstorm = ['brainstorm', 'ideas', 'suggest', 'suggestions', 'innovate'].some(kw => lowerQuery.includes(kw));

    if (isTranslation) {
      return [SWARM_REGISTRY.translator];
    }
    if (isSummary) {
      return [SWARM_REGISTRY.summarizer];
    }
    if (isBrainstorm) {
      return [SWARM_REGISTRY.brainstormer];
    }

    // Default to the Core Conversational Assistant (never coder or systems architect agents)
    console.log('📡 Synapse Router: Routing to Core Assistant to guarantee a clean conversational answer.');
    return [SWARM_REGISTRY.general_chat_assistant];
  }

  /**
   * Analyzes the query to build a collaborative multi-agent execution pipeline.
   * @param {string} query - Raw user query
   * @returns {Object} Structured execution pipeline
   */
  static buildExecutionPipeline(query) {
    const recruitedAgents = this.routeQuery(query);
    
    // Check if the query asks for secondary tasks like translation
    const additionalAgents = [];
    const lowerQuery = query.toLowerCase();
    
    const translationKeywords = ['translate', 'spanish', 'french', 'german', 'chinese', 'japanese', 'language', 'traduccion'];
    const hasTranslationRequest = translationKeywords.some(kw => lowerQuery.includes(kw));

    const summaryKeywords = ['summarize', 'summary', 'tldr', 'executive summary', 'brief', 'shorten'];
    const hasSummaryRequest = summaryKeywords.some(kw => lowerQuery.includes(kw));

    if (hasSummaryRequest && !recruitedAgents.some(a => a.id === 'summarizer')) {
      additionalAgents.push(SWARM_REGISTRY.summarizer);
    }
    if (hasTranslationRequest && !recruitedAgents.some(a => a.id === 'translator')) {
      additionalAgents.push(SWARM_REGISTRY.translator);
    }

    const fullPipelineChain = [...recruitedAgents, ...additionalAgents];
    
    return {
      query,
      chain: fullPipelineChain,
      timestamp: Date.now()
    };
  }
}
