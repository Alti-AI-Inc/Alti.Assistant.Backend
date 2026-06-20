import { describe, it, expect } from 'vitest';
import { getAgent, getAgentList, specializedCodingAgents } from './specializedCodingAgents.js';

describe('specializedCodingAgents', () => {
  it('should define exactly 110 specialized coding agents', () => {
    expect(specializedCodingAgents.length).toBe(110);
  });

  it('should have correct structure for all agents', () => {
    specializedCodingAgents.forEach((agent) => {
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
      const agent = getAgent('lang_rust');
      expect(agent.id).toBe('lang_rust');
      expect(agent.name).toBe('Rust Specialist');
      expect(agent.category).toBe('Languages');
      expect(agent.systemPrompt).toContain('borrow checker');
    });

    it('should return general fallback agent for an invalid ID', () => {
      const agent = getAgent('invalid_agent_id');
      expect(agent.id).toBe('general');
      expect(agent.name).toBe('General Coding Assistant');
      expect(agent.category).toBe('General');
      expect(agent.systemPrompt).toContain('You are a helpful and versatile AI coding assistant.');
    });

    it('should return general fallback agent for undefined ID', () => {
      const agent = getAgent(undefined);
      expect(agent.id).toBe('general');
    });
  });

  describe('getAgentList', () => {
    it('should return all 110 agents with metadata only', () => {
      const list = getAgentList();
      expect(list.length).toBe(110);
      list.forEach((item) => {
        expect(item.id).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.description).toBeDefined();
        expect(item.category).toBeDefined();
        expect(item.systemPrompt).toBeUndefined(); // Verify systemPrompt is omitted to save tokens
      });
    });
  });
});
