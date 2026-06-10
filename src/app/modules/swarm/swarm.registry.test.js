import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock customAgents initially to be an empty array.
// This prevents the auto-registration loop from populating SWARM_REGISTRY
// when the module is first imported, allowing us to test `registerAgent` in isolation.
vi.mock('./agents/index.js', () => ({
  customAgents: [],
}));

// Import the module under test. At this point, SWARM_REGISTRY will be empty due to the mock.
import { SWARM_REGISTRY, registerAgent } from './swarm.registry.js';

describe('swarm.registry', () => {
  let consoleLogSpy;

  beforeEach(() => {
    // Clear the registry before each test to ensure isolation for `registerAgent` tests.
    // This SWARM_REGISTRY is the one imported at the top of this file.
    for (const key in SWARM_REGISTRY) {
      delete SWARM_REGISTRY[key];
    }
    // Spy on console.log for all tests to check output.
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.log after each test.
    consoleLogSpy.mockRestore();
  });

  describe('registerAgent', () => {
    it('should register an agent with a minimal profile', () => {
      const agent = { id: 'test-agent-1', name: 'Test Agent 1', description: 'A test agent.' };
      registerAgent(agent);
      expect(SWARM_REGISTRY['test-agent-1']).toEqual({
        ...agent,
        tools: [], // Should be defaulted
        keywords: [], // Should be defaulted
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(`📡 Swarm Registry: Successfully loaded micro-agent "Test Agent 1" (ID: test-agent-1)`);
    });

    it('should register an agent with a full profile', () => {
      const agent = {
        id: 'test-agent-2',
        name: 'Test Agent 2',
        description: 'Another test agent.',
        tools: ['toolA', 'toolB'],
        keywords: ['keyword1', 'keyword2'],
        config: { setting: true },
      };
      registerAgent(agent);
      expect(SWARM_REGISTRY['test-agent-2']).toEqual(agent);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should initialize tools and keywords as empty arrays if not provided', () => {
      const agent = { id: 'test-agent-3', name: 'Test Agent 3', description: 'No tools or keywords.' };
      registerAgent(agent);
      expect(SWARM_REGISTRY['test-agent-3'].tools).toEqual([]);
      expect(SWARM_REGISTRY['test-agent-3'].keywords).toEqual([]);
    });

    it('should throw an error if agentProfile.id is missing', () => {
      const agent = { name: 'Invalid Agent', description: 'Missing ID.' };
      // Note: The original file has a syntax error `new new Error`. Assuming it should be `new Error`.
      expect(() => registerAgent(agent)).toThrow('Agent profile must contain a unique id');
      expect(SWARM_REGISTRY).toEqual({}); // Registry should remain empty
      expect(consoleLogSpy).not.toHaveBeenCalled(); // No log for failed registration
    });

    it('should throw an error if an agent with the same id already exists', () => {
      const agent1 = { id: 'duplicate-agent', name: 'Agent One', description: 'First agent.' };
      const agent2 = { id: 'duplicate-agent', name: 'Agent Two', description: 'Second agent.' };

      registerAgent(agent1); // First registration should succeed
      expect(SWARM_REGISTRY['duplicate-agent']).toBeDefined();
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      // Second registration with the same ID should fail
      expect(() => registerAgent(agent2)).toThrow('Agent with ID "duplicate-agent" already exists in the registry. Cannot register duplicate.');
      expect(SWARM_REGISTRY['duplicate-agent'].name).toBe('Agent One'); // Ensure the original agent was not overwritten
      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // No new log for failed registration
    });
  });

  describe('SWARM_REGISTRY auto-population on module load', () => {
    // Each test in this suite will reset modules and re-import,
    // allowing us to control `customAgents` via `vi.doMock` for each specific test.
    beforeEach(() => {
      vi.resetModules(); // Clears module cache and all mocks
      consoleLogSpy.mockRestore(); // Restore the spy from the outer beforeEach
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); // Create a new spy for this context
    });

    afterEach(() => {
      // Unmock customAgents after each test in this suite to ensure isolation
      // for other test files that might run later or if this suite is run multiple times.
      vi.unmock('./agents/index.js');
    });

    it('should auto-register agents from customAgents on module load', async () => {
      const mockCustomAgents = [
        { id: 'auto-agent-1', name: 'Auto Agent 1', description: 'First auto-registered agent.' },
        { id: 'auto-agent-2', name: 'Auto Agent 2', description: 'Second auto-registered agent.', tools: ['auto-tool'] },
      ];

      // Set the mock for customAgents for the upcoming import
      vi.doMock('./agents/index.js', () => ({
        customAgents: mockCustomAgents,
      }));

      // Dynamically import the module. This will trigger the auto-registration with mockCustomAgents.
      const { SWARM_REGISTRY: reimportedRegistry } = await import('./swarm.registry.js');

      expect(Object.keys(reimportedRegistry)).toHaveLength(2);
      expect(reimportedRegistry['auto-agent-1']).toEqual({
        id: 'auto-agent-1',
        name: 'Auto Agent 1',
        description: 'First auto-registered agent.',
        tools: [], // Defaulted
        keywords: [], // Defaulted
      });
      expect(reimportedRegistry['auto-agent-2']).toEqual({
        id: 'auto-agent-2',
        name: 'Auto Agent 2',
        description: 'Second auto-registered agent.',
        tools: ['auto-tool'],
        keywords: [], // Defaulted
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully loaded micro-agent "Auto Agent 1"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully loaded micro-agent "Auto Agent 2"'));
    });

    it('should stop auto-registration and throw if a duplicate ID is encountered', async () => {
      const mockCustomAgentsWithDuplicate = [
        { id: 'dup-auto-agent', name: 'First Dup', description: 'First.' },
        { id: 'dup-auto-agent', name: 'Second Dup', description: 'Second.' }, // Duplicate ID
        { id: 'never-registered', name: 'Never Registered', description: 'Should not be reached.' },
      ];

      vi.doMock('./agents/index.js', () => ({
        customAgents: mockCustomAgentsWithDuplicate,
      }));

      let caughtError;
      let reimportedRegistry;
      try {
        const module = await import('./swarm.registry.js');
        reimportedRegistry = module.SWARM_REGISTRY;
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError.message).toBe('Agent with ID "dup-auto-agent" already exists in the registry. Cannot register duplicate.');

      // The `reimportedRegistry` from the `try` block will hold the state *up to the point of error*.
      expect(Object.keys(reimportedRegistry)).toHaveLength(1);
      expect(reimportedRegistry['dup-auto-agent']).toEqual({
        id: 'dup-auto-agent',
        name: 'First Dup',
        description: 'First.',
        tools: [],
        keywords: [],
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // Only the first agent logged success
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully loaded micro-agent "First Dup"'));
    });

    it('should stop auto-registration and throw if an agent in customAgents is missing an ID', async () => {
      const mockCustomAgentsWithMissingId = [
        { id: 'valid-agent', name: 'Valid Agent', description: 'Valid.' },
        { name: 'Invalid Agent', description: 'Missing ID.' }, // Missing ID
      ];

      vi.doMock('./agents/index.js', () => ({
        customAgents: mockCustomAgentsWithMissingId,
      }));

      let caughtError;
      let reimportedRegistry;
      try {
        const module = await import('./swarm.registry.js');
        reimportedRegistry = module.SWARM_REGISTRY;
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError.message).toBe('Agent profile must contain a unique id');

      // Only the first agent should have been registered before the error
      expect(Object.keys(reimportedRegistry)).toHaveLength(1);
      expect(reimportedRegistry['valid-agent']).toEqual({
        id: 'valid-agent',
        name: 'Valid Agent',
        description: 'Valid.',
        tools: [],
        keywords: [],
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully loaded micro-agent "Valid Agent"'));
    });
  });
});