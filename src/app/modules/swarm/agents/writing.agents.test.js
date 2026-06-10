import { describe, it, expect } from 'vitest';
import {
  emailWriter,
  letterWriter,
  songWriter,
  essayWriter,
  blogWriter,
  copywriter,
  technicalDocWriter,
  proposalWriter,
  speechWriter,
  socialMediaSwarmWriter,
} from './writing.agents.js';

const allAgents = [
  emailWriter,
  letterWriter,
  songWriter,
  essayWriter,
  blogWriter,
  copywriter,
  technicalDocWriter,
  proposalWriter,
  speechWriter,
  socialMediaSwarmWriter,
];

describe('Writing Agents Configuration (writing.agents.js)', () => {
  it('should export exactly 10 agent configurations', () => {
    expect(allAgents.length).toBe(10);
    allAgents.forEach(agent => {
      expect(agent).toBeDefined();
    });
  });

  it('should have a unique ID for each agent', () => {
    const ids = allAgents.map(agent => agent.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  describe.each(allAgents)('Agent: $name (ID: $id)', (agent) => {
    it('should have a valid structure and adhere to the WritingAgentConfig type', () => {
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('systemInstruction');
      expect(agent).toHaveProperty('model');
      expect(agent).toHaveProperty('tools');
      expect(agent).toHaveProperty('keywords');
    });

    it('should have a non-empty string for id', () => {
      expect(typeof agent.id).toBe('string');
      expect(agent.id.length).toBeGreaterThan(0);
    });

    it('should have a non-empty string for name', () => {
      expect(typeof agent.name).toBe('string');
      expect(agent.name.length).toBeGreaterThan(0);
    });

    it('should have a non-empty string for description', () => {
      expect(typeof agent.description).toBe('string');
      expect(agent.description.length).toBeGreaterThan(0);
    });

    it('should have a non-empty string for systemInstruction', () => {
      expect(typeof agent.systemInstruction).toBe('string');
      expect(agent.systemInstruction.length).toBeGreaterThan(0);
    });

    it('should use a valid Gemini model from the allowed list', () => {
      const validModels = ['gemini-2.5-flash', 'gemini-2.5-pro'];
      expect(typeof agent.model).toBe('string');
      expect(validModels).toContain(agent.model);
    });

    it('should have a "tools" property that is an array of strings', () => {
      expect(Array.isArray(agent.tools)).toBe(true);
      agent.tools.forEach(tool => {
        expect(typeof tool).toBe('string');
      });
    });

    it('should have a "keywords" property that is a non-empty array of strings', () => {
      expect(Array.isArray(agent.keywords)).toBe(true);
      expect(agent.keywords.length).toBeGreaterThan(0);
      agent.keywords.forEach(keyword => {
        expect(typeof keyword).toBe('string');
        expect(keyword.length).toBeGreaterThan(0);
      });
    });
  });
});