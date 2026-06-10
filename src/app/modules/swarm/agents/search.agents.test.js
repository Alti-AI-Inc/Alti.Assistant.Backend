import { describe, it, expect } from 'vitest';
import {
  realtimeSearchAgent,
  perplexityDeepSearcher,
  youtubeResearcher,
  academicScholar,
  financialSearchAgent,
  academicSearchAgent,
  liveIntelAggregator,
  academicMetaAnalyst,
} from './search.agents.js';

const allAgents = [
  realtimeSearchAgent,
  perplexityDeepSearcher,
  youtubeResearcher,
  academicScholar,
  financialSearchAgent,
  academicSearchAgent,
  liveIntelAggregator,
  academicMetaAnalyst,
];

const agentSchema = {
  id: 'string',
  name: 'string',
  description: 'string',
  systemInstruction: 'string',
  model: 'string',
  tools: 'array',
  keywords: 'array',
};

describe('Swarm Search Agents Definition', () => {
  it('should have unique IDs for all agents', () => {
    const ids = allAgents.map(agent => agent.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should contain all expected agents', () => {
    expect(allAgents.length).toBe(8);
    const agentIds = allAgents.map(a => a.id);
    expect(agentIds).toContain('realtime_search_agent');
    expect(agentIds).toContain('perplexity_deep_searcher');
    expect(agentIds).toContain('youtube_researcher');
    expect(agentIds).toContain('academic_scholar');
    expect(agentIds).toContain('financial_search_agent');
    expect(agentIds).toContain('academic_search_agent');
    expect(agentIds).toContain('live_intel_aggregator');
    expect(agentIds).toContain('academic_meta_analyst');
  });

  describe.each(allAgents.map(a => [a.name, a]))('Agent: %s', (agentName, agent) => {
    it('should conform to the SwarmAgent schema', () => {
      expect(Object.keys(agent)).toEqual(expect.arrayContaining(Object.keys(agentSchema)));
    });

    it('should have a non-empty string for id, name, description, systemInstruction, and model', () => {
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
    });

    it('should have an array of strings for tools', () => {
      expect(Array.isArray(agent.tools)).toBe(true);
      agent.tools.forEach(tool => {
        expect(typeof tool).toBe('string');
      });
    });

    it('should have an array of strings for keywords', () => {
      expect(Array.isArray(agent.keywords)).toBe(true);
      agent.keywords.forEach(keyword => {
        expect(typeof keyword).toBe('string');
      });
    });
  });

  describe('Specific Agent Configuration Checks', () => {
    it('realtimeSearchAgent should include both google-search and youtube-search tools', () => {
      expect(realtimeSearchAgent.tools).toEqual(expect.arrayContaining(['google-search', 'youtube-search']));
    });

    it('perplexityDeepSearcher should include google-search tool', () => {
      expect(perplexityDeepSearcher.tools).toContain('google-search');
    });

    it('youtubeResearcher should only have the youtube-search tool', () => {
      expect(youtubeResearcher.tools).toEqual(['youtube-search']);
    });

    it('academicScholar should have no tools by default, as per its design', () => {
      expect(academicScholar.tools).toEqual([]);
    });

    it('financialSearchAgent should include google-search tool', () => {
      expect(financialSearchAgent.tools).toContain('google-search');
    });

    it('academicSearchAgent should include google-search tool', () => {
      expect(academicSearchAgent.tools).toContain('google-search');
    });

    it('liveIntelAggregator should include google-search tool', () => {
      expect(liveIntelAggregator.tools).toContain('google-search');
    });

    it('academicMetaAnalyst should include google-search tool', () => {
      expect(academicMetaAnalyst.tools).toContain('google-search');
    });

    it('academicScholar should have keywords related to academic research', () => {
      expect(academicScholar.keywords).toContain('literature review');
      expect(academicScholar.keywords).toContain('scientific');
    });
  });
});