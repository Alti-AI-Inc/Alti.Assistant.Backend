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
    
    // Check for translation, summarization, brainstorming, real-time search, data processing, or intelligence intents
    const isTranslation = ['translate', 'spanish', 'french', 'german', 'chinese', 'japanese', 'language', 'traduccion'].some(kw => lowerQuery.includes(kw));
    const isSummary = ['summarize', 'summary', 'tldr', 'executive summary', 'brief', 'shorten', 'outline'].some(kw => lowerQuery.includes(kw));
    const isBrainstorm = ['brainstorm', 'ideas', 'suggest', 'suggestions', 'innovate'].some(kw => lowerQuery.includes(kw));
    
    // Granular specialized Search checks
    const isFinancialSearch = ['stock', 'ticker', 'market cap', 'pe ratio', 'nasdaq', 'nyse', 'dividend', 'revenue', 'googl', 'aapl', 'nvda'].some(kw => lowerQuery.includes(kw));
    const isAcademicSearch = ['doi', 'academic paper', 'arxiv', 'pubmed', 'biorxiv', 'medrxiv', 'scholarly', 'literature review', 'citation'].some(kw => lowerQuery.includes(kw));
    const isRealtimeSearch = ['search', 'lookup', 'latest news', 'current price', 'weather', 'sports schedule', 'game score', 'who won', 'what is the current status of', 'happenings', 'real-time', 'realtime'].some(kw => lowerQuery.includes(kw));
    
    // Granular specialized Data checks
    const isSchemaMapping = ['ddl', 'schema design', 'entity relationship', 'table schema', 'database model', 'sql schema', 'database partition', 'erd diagram'].some(kw => lowerQuery.includes(kw));
    const isPayloadTransform = ['clean data', 'sanitize payload', 'flatten json', 'parse csv', 'null handling', 'type coercion', 'normalize datetime', 'data scrubber', 'bad json'].some(kw => lowerQuery.includes(kw));
    const isDataProcessing = ['process', 'json', 'csv', 'xml', 'database', 'format', 'convert', 'nested data', 'dataset', 'parser'].some(kw => lowerQuery.includes(kw));
    
    // Granular specialized Intelligence checks
    const isArchitecturalReasoning = ['multi region', 'latency budget', 'fault tolerance', 'high availability', 'scaling blueprint', 'datacenter topology', 'disaster recovery', 'vpc design'].some(kw => lowerQuery.includes(kw));
    const isMathLogicProof = ['logic proof', 'formal logic', 'symbolic proof', 'theorem proving', 'time complexity proof', 'big o induction', 'combinatorics', 'discrete math', 'propositional logic', 'boolean algebra'].some(kw => lowerQuery.includes(kw));
    const isIntelligence = ['think', 'reason', 'logic', 'proof', 'strategy', 'plan', 'critique', 'cognitive', 'deep reasoning', 'analysis'].some(kw => lowerQuery.includes(kw));

    if (isTranslation) {
      return [SWARM_REGISTRY.translator];
    }
    if (isSummary) {
      return [SWARM_REGISTRY.summarizer];
    }
    if (isBrainstorm) {
      return [SWARM_REGISTRY.brainstormer];
    }
    
    // Route search specialists
    if (isFinancialSearch) {
      return [SWARM_REGISTRY.financial_search_agent];
    }
    if (isAcademicSearch) {
      return [SWARM_REGISTRY.academic_search_agent];
    }
    if (isRealtimeSearch) {
      return [SWARM_REGISTRY.realtime_search_agent];
    }
    
    // Route data specialists
    if (isSchemaMapping) {
      return [SWARM_REGISTRY.schema_mapper_agent];
    }
    if (isPayloadTransform) {
      return [SWARM_REGISTRY.payload_transformer_agent];
    }
    if (isDataProcessing) {
      return [SWARM_REGISTRY.data_processor_agent];
    }
    
    // Route cognitive specialists
    if (isArchitecturalReasoning) {
      return [SWARM_REGISTRY.architectural_reasoning_agent];
    }
    if (isMathLogicProof) {
      return [SWARM_REGISTRY.math_logic_prover_agent];
    }
    if (isIntelligence) {
      return [SWARM_REGISTRY.intelligence_agent];
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
