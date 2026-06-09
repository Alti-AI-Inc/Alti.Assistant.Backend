import { describe, it, expect } from 'vitest';
import {
  securityAuditAgent,
  perfMonitorAgent,
  cacheOptimizerAgent,
  selfCriticAgent,
  contextCompressorAgent,
  queryDisambiguator,
  factValidationCritic,
  toolRoutingOrchestrator,
  semanticCachePrewarmer,
  responseDensityOptimizer,
  authoritativeSourceGrounder,
  semanticDriftCorrector,
  semanticRelevanceScorer,
  contextAttentionPruner,
  sentimentToneGuard,
  logicCoherenceChecker,
  ingestionRouter,
} from './background.agents';

describe('Background Agents Definitions', () => {
  const agents = {
    securityAuditAgent,
    perfMonitorAgent,
    cacheOptimizerAgent,
    selfCriticAgent,
    contextCompressorAgent,
    queryDisambiguator,
    factValidationCritic,
    toolRoutingOrchestrator,
    semanticCachePrewarmer,
    responseDensityOptimizer,
    authoritativeSourceGrounder,
    semanticDriftCorrector,
    semanticRelevanceScorer,
    contextAttentionPruner,
    sentimentToneGuard,
    logicCoherenceChecker,
    ingestionRouter,
  };

  const expectedAgentIds = [
    'security_audit_agent',
    'perf_monitor_agent',
    'cache_optimizer_agent',
    'self_critic_agent',
    'context_compressor_agent',
    'query_disambiguator',
    'fact_validation_critic',
    'tool_routing_orchestrator',
    'semantic_cache_prewarmer',
    'response_density_optimizer',
    'authoritative_source_grounder',
    'semantic_drift_corrector',
    'semantic_relevance_scorer',
    'context_attention_pruner',
    'sentiment_tone_guard',
    'logic_coherence_checker',
    'ingestion_router',
  ];

  it('should export all expected agents', () => {
    const actualAgentIds = Object.values(agents).map(agent => agent.id);
    expect(actualAgentIds).toEqual(expect.arrayContaining(expectedAgentIds));
    expect(actualAgentIds.length).toBe(expectedAgentIds.length); // Ensure no extra agents are exported
  });

  // Helper function to test a single agent's structure and content
  const testAgentProperties = (agent) => {
    expect(agent).toBeDefined();
    expect(typeof agent).toBe('object');
    expect(agent).not.toBeNull();

    // Check for required properties
    expect(agent).toHaveProperty('id');
    expect(agent).toHaveProperty('name');
    expect(agent).toHaveProperty('description');
    expect(agent).toHaveProperty('systemInstruction');
    expect(agent).toHaveProperty('model');
    expect(agent).toHaveProperty('tools');
    expect(agent).toHaveProperty('keywords');

    // Check data types and non-emptiness for critical string properties
    expect(typeof agent.id).toBe('string');
    expect(agent.id).not.toBe('');

    expect(typeof agent.name).toBe('string');
    expect(agent.name).not.toBe('');

    expect(typeof agent.description).toBe('string');
    expect(agent.description).not.toBe('');

    expect(typeof agent.systemInstruction).toBe('string');
    expect(agent.systemInstruction).not.toBe('');

    expect(typeof agent.model).toBe('string');
    expect(agent.model).not.toBe('');

    // Check array properties
    expect(Array.isArray(agent.tools)).toBe(true);
    expect(Array.isArray(agent.keywords)).toBe(true);
  };

  // Dynamically create tests for each agent
  for (const agentKey in agents) {
    if (Object.prototype.hasOwnProperty.call(agents, agentKey)) {
      const agent = agents[agentKey];
      describe(`${agent.name} (${agent.id})`, () => {
        it('should have a valid structure and non-empty critical properties', () => {
          testAgentProperties(agent);
        });
      });
    }
  }
});