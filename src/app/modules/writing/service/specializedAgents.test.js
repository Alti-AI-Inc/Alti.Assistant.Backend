import { describe, it, expect } from 'vitest';
import { getAgent, getAgentList, specializedAgents } from './specializedAgents.js';

describe('specializedAgents', () => {
  it('should define exactly 152 specialized agents', () => {
    expect(specializedAgents.length).toBe(152);
  });

  it('should have correct structure for all agents', () => {
    specializedAgents.forEach((agent) => {
      expect(agent.id).toBeDefined();
      expect(typeof agent.id).toBe('string');
      expect(agent.name).toBeDefined();
      expect(typeof agent.name).toBe('string');
      expect(agent.description).toBeDefined();
      expect(typeof agent.description).toBe('string');
      expect(agent.category).toBeDefined();
      expect(typeof agent.category).toBe('string');
      expect(agent.systemPrompt).toBeDefined();
      expect(typeof agent.systemPrompt).toBe('string');
    });
  });

  describe('getAgent', () => {
    it('should return the correct agent for a valid ID', () => {
      const agent = getAgent('legal_nda');
      expect(agent.id).toBe('legal_nda');
      expect(agent.name).toBe('Non-Disclosure Agreement (NDA) Generator');
      expect(agent.category).toBe('Legal Drafting');
    });

    it('should return general fallback agent for an invalid ID', () => {
      const agent = getAgent('invalid_agent_id');
      expect(agent.id).toBe('general');
      expect(agent.name).toBe('General Writing Assistant');
      expect(agent.category).toBe('General');
      expect(agent.systemPrompt).toContain('You are an expert writer.');
    });

    it('should return general fallback agent for undefined ID', () => {
      const agent = getAgent(undefined);
      expect(agent.id).toBe('general');
    });
  });

  describe('getAgentList', () => {
    it('should return all 152 agents with metadata only', () => {
      const list = getAgentList();
      expect(list.length).toBe(152);
      list.forEach((item) => {
        expect(item.id).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.description).toBeDefined();
        expect(item.category).toBeDefined();
        expect(item.systemPrompt).toBeUndefined(); // Should exclude prompt to save tokens
      });
    });
  });
});
