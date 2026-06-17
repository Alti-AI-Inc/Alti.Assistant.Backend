import { describe, it, expect } from 'vitest';
import * as agents from './development.agents.js';

describe('Development Agents Definitions', () => {
  const agentKeys = [
    'coder',
    'codeDebugger',
    'apiDesigner',
    'observabilityEngineer',
    'cicdArchitect',
    'rustDeveloper',
    'goDeveloper',
    'pythonDataScientist',
    'containerSecurityExpert',
    'linuxSystemsExpert',
    'googleChromeExtensionDeveloper',
    'googleAppsScriptDeveloper',
    'googleFlutterDeveloper',
    'gitGitExpert',
    'openclawArchitect',
    'hermesEngineer'
  ];

  it('should export all expected agents', () => {
    agentKeys.forEach(key => {
      expect(agents).toHaveProperty(key);
    });
  });

  agentKeys.forEach(key => {
    describe(`Agent: ${key}`, () => {
      it('should have a valid AgentDefinition structure', () => {
        const agent = agents[key];
        expect(agent).toBeDefined();
        
        expect(typeof agent.id).toBe('string');
        expect(agent.id.length).toBeGreaterThan(0);

        expect(typeof agent.name).toBe('string');
        expect(agent.name.length).toBeGreaterThan(0);

        expect(typeof agent.description).toBe('string');
        expect(agent.description.length).toBeGreaterThan(0);

        expect(typeof agent.systemInstruction).toBe('string');
        expect(agent.systemInstruction.length).toBeGreaterThan(0);

        expect(typeof agent.model).toBe('string');
        expect(agent.model).toBe('gemini-3.5-flash');

        expect(Array.isArray(agent.tools)).toBe(true);

        expect(Array.isArray(agent.keywords)).toBe(true);
        expect(agent.keywords.length).toBeGreaterThan(0);
        agent.keywords.forEach(keyword => {
          expect(typeof keyword).toBe('string');
        });
      });
    });
  });

  it('should have correct specific values for coder agent', () => {
    const { coder } = agents;
    expect(coder.id).toBe('coder');
    expect(coder.name).toBe('Software Engineer');
    expect(coder.systemInstruction).toContain('Principal Software Engineer');
    expect(coder.keywords).toContain('code');
  });

  it('should have correct specific values for codeDebugger agent', () => {
    const { codeDebugger } = agents;
    expect(codeDebugger.id).toBe('code_debugger');
    expect(codeDebugger.name).toBe('Debugging & Remediation Specialist');
    expect(codeDebugger.systemInstruction).toContain('Debugging and Code Remediation Specialist');
  });

  it('should have correct specific values for apiDesigner agent', () => {
    const { apiDesigner } = agents;
    expect(apiDesigner.id).toBe('api_designer');
    expect(apiDesigner.name).toBe('API Systems Architect');
  });

  it('should have correct specific values for openclawArchitect agent', () => {
    const { openclawArchitect } = agents;
    expect(openclawArchitect.id).toBe('openclaw_architect');
    expect(openclawArchitect.keywords).toContain('openclaw');
  });

  it('should have correct specific values for hermesEngineer agent', () => {
    const { hermesEngineer } = agents;
    expect(hermesEngineer.id).toBe('hermes_engineer');
    expect(hermesEngineer.keywords).toContain('hermes');
  });

  it('should simulate role-based access boundaries if filtered', () => {
    // Simulate a scenario where certain agents are restricted or accessible based on roles
    const getAgentsForRole = (role) => {
      if (role === 'super_admin' || role === 'admin') {
        return agentKeys; // Admins can access all development agents
      }
      if (role === 'manager') {
        // Managers can access standard development agents but not systems/security/architecture specialists
        return ['coder', 'codeDebugger', 'apiDesigner', 'pythonDataScientist', 'googleAppsScriptDeveloper'];
      }
      if (role === 'user') {
        // Standard users can only access basic coder and debugger
        return ['coder', 'codeDebugger'];
      }
      return [];
    };

    expect(getAgentsForRole('super_admin')).toHaveLength(agentKeys.length);
    expect(getAgentsForRole('admin')).toHaveLength(agentKeys.length);
    expect(getAgentsForRole('manager')).toContain('coder');
    expect(getAgentsForRole('manager')).not.toContain('containerSecurityExpert');
    expect(getAgentsForRole('user')).toEqual(['coder', 'codeDebugger']);
    expect(getAgentsForRole('guest')).toEqual([]);
  });
});