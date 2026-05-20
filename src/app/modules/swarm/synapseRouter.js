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
    if (!query || typeof query !== 'string') {
      return [SWARM_REGISTRY.coder]; // Fallback to basic Software Engineer agent
    }

    const lowerQuery = query.toLowerCase();
    const stopWords = new Set(['show', 'me', 'the', 'and', 'its', 'from', 'collection', 'repository', 'repo', 'repositories', 'google', 'cloud', 'platform', 'gcp', 'a', 'of', 'in', 'for', 'with', 'on', 'how', 'to', 'find', 'get', 'list', 'search', 'what', 'is', 'are', 'any', 'some', 'about']);
    const queryWords = lowerQuery
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    const candidates = [];

    // Score all available micro-agents in the Swarm Registry
    for (const [id, agent] of Object.entries(SWARM_REGISTRY)) {
      let score = 0;

      // Tier 1: Keyword-based matching
      if (agent.keywords && agent.keywords.length > 0) {
        agent.keywords.forEach(keyword => {
          if (lowerQuery.includes(keyword.toLowerCase())) {
            score += 15; // Direct keyword match has high weight
          }
        });
      }

      // Tier 2: Token match density against name & description
      if (queryWords.length > 0) {
        const nameLower = agent.name.toLowerCase();
        const descLower = agent.description.toLowerCase();

        queryWords.forEach(word => {
          if (nameLower.includes(word)) {
            score += 5;
          }
          if (descLower.includes(word)) {
            score += 2;
          }
        });
      }

      if (score > 0) {
        candidates.push({ agent, score });
      }
    }

    // Sort candidates by match score
    candidates.sort((a, b) => b.score - a.score);

    // If no specific agent matched, default to generic grounded search or coder agent
    if (candidates.length === 0) {
      console.log('📡 Synapse Router: No specific micro-agent matched. Defaulting to Gcp Grounding + Coder agent chain.');
      const isGcpRelated = ['gcp', 'google cloud', 'gke', 'cloud storage', 'compute', 'bigquery', 'appengine', 'cloud run'].some(word => lowerQuery.includes(word));
      return isGcpRelated ? [SWARM_REGISTRY.gcp_grounding, SWARM_REGISTRY.coder] : [SWARM_REGISTRY.coder];
    }

    // Assemble the recruited chain (return top matching agents)
    const recruitedChain = candidates.map(c => c.agent).slice(0, 3);
    console.log(`📡 Synapse Router: Recruited Agent Swarm [${recruitedChain.map(a => a.name).join(' -> ')}] for query "${query.substring(0, 40)}..."`);
    
    return recruitedChain;
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
