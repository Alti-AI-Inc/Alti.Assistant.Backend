import { customAgents } from './agents/index.js';

/**
 * Declarative Swarm Registry
 * Serves as the high-speed registry for all modular micro-agents.
 * All agent profiles are defined in category files under './agents/'.
 */
export const SWARM_REGISTRY = {};

/**
 * Dynamically registers new agents into the swarm.
 * @param {Object} agentProfile - Declarative agent configuration
 */
export const registerAgent = (agentProfile) => {
  if (!agentProfile.id) {
    throw new Error('Agent profile must contain a unique id');
  }
  // Bug fix: Prevent silent overwriting of existing agents.
  // A registry should enforce unique identifiers or explicitly handle duplicates.
  if (SWARM_REGISTRY[agentProfile.id]) {
    throw new Error(`Agent with ID "${agentProfile.id}" already exists in the registry. Cannot register duplicate.`);
  }

  SWARM_REGISTRY[agentProfile.id] = {
    ...agentProfile,
    tools: agentProfile.tools || [],
    keywords: agentProfile.keywords || []
  };
  console.log(`📡 Swarm Registry: Successfully loaded micro-agent "${agentProfile.name}" (ID: ${agentProfile.id})`);
};

// Auto-register all modular agents under the dedicated folder
customAgents.forEach(agent => registerAgent(agent));