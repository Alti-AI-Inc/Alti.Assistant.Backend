import { describe, it, expect } from 'vitest';
import {
  summarizer,
  translator,
  transcriber,
  documenter,
  brainstormer,
  creativeCopywriter,
  uxStrategist,
  seoContentSpecialist,
  emailCorrespondenceExpert,
  youtubeTranscriptSummarizer,
  resumeCvCoach,
  socialMediaWriter,
  pressReleaseWriter,
  grantProposalWriter
} from './utility.agents';

// Define the expected structure for an AgentDefinition
const expectedAgentProperties = [
  'id',
  'name',
  'description',
  'systemInstruction',
  'model',
  'tools',
  'keywords'
];

describe('Agent Definitions', () => {
  const agents = {
    summarizer,
    translator,
    transcriber,
    documenter,
    brainstormer,
    creativeCopywriter,
    uxStrategist,
    seoContentSpecialist,
    emailCorrespondenceExpert,
    youtubeTranscriptSummarizer,
    resumeCvCoach,
    socialMediaWriter,
    pressReleaseWriter,
    grantProposalWriter
  };

  for (const agentName in agents) {
    const agent = agents[agentName];

    it(`should have a valid structure for the '${agentName}' agent`, () => {
      expect(agent).toBeDefined();
      expect(typeof agent).toBe('object');
      expect(agent).not.toBeNull();

      // Check for all required properties
      expectedAgentProperties.forEach(prop => {
        expect(agent).toHaveProperty(prop);
      });

      // Check types of properties
      expect(typeof agent.id).toBe('string');
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.description).toBe('string');
      expect(typeof agent.systemInstruction).toBe('string');
      expect(typeof agent.model).toBe('string');
      expect(Array.isArray(agent.tools)).toBe(true);
      expect(Array.isArray(agent.keywords)).toBe(true);

      // Check if id matches the export name (a common convention)
      expect(agent.id).toBe(agentName);

      // Check if description and systemInstruction are not empty
      expect(agent.description.length).toBeGreaterThan(0);
      expect(agent.systemInstruction.length).toBeGreaterThan(0);

      // Check if arrays contain strings (optional but good for robustness)
      agent.tools.forEach(tool => {
        expect(typeof tool).toBe('string');
      });
      agent.keywords.forEach(keyword => {
        expect(typeof keyword).toBe('string');
      });
    });
  }
});