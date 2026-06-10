/**
 * @file Manages the in-memory registry of all available "micro-agents" in the AI Swarm.
 * @module modules/swarm/swarm.registry
 * @description This module initializes and populates the `SWARM_REGISTRY`, a central, high-speed lookup
 * table for agent profiles. It provides a function to register new agents and automatically
 * discovers and registers all agents defined under the `./agents/` directory upon application startup.
 */

/**
 * @typedef {Object} AgentProfile
 * @property {string} id - A unique identifier for the agent.
 * @property {string} name - The human-readable name of the agent.
 * @property {string} description - A brief description of the agent's purpose.
 * @property {string[]} [tools=[]] - An array of tool names the agent can utilize.
 * @property {string[]} [keywords=[]] - An array of keywords associated with the agent for search/categorization.
 * @property {Object} [config={}] - Additional configuration specific to the agent.
 */

import { customAgents } from './agents/index.js';

/**
 * Declarative Swarm Registry.
 *
 * Serves as the high-speed, in-memory registry for all modular micro-agents within the system.
 * Agent profiles are dynamically loaded and registered from category files located under './agents/'.
 * This registry ensures quick lookup and management of agent capabilities and configurations.
 *
 * @type {Object.<string, AgentProfile>}
 */
export const SWARM_REGISTRY = {};

/**
 * Dynamically registers a new micro-agent into the global {@link SWARM_REGISTRY}.
 *
 * This function validates the agent profile and adds it to the registry,
 * ensuring that each agent has a unique identifier. It also initializes
 * `tools` and `keywords` arrays if they are not provided.
 *
 * @param {AgentProfile} agentProfile - The declarative configuration object for the agent to be registered.
 * @param {string} agentProfile.id - A unique identifier for the agent. Required.
 * @param {string} agentProfile.name - The human-readable name of the agent.
 * @param {string} agentProfile.description - A brief description of the agent's purpose.
 * @param {string[]} [agentProfile.tools=[]] - An array of tool names the agent can utilize. Defaults to an empty array.
 * @param {string[]} [agentProfile.keywords=[]] - An array of keywords associated with the agent for search/categorization. Defaults to an empty array.
 * @param {Object} [agentProfile.config={}] - Additional configuration specific to the agent.
 * @returns {void}
 * @throws {Error} If `agentProfile.id` is missing.
 * @throws {Error} If an agent with the same `id` already exists in the {@link SWARM_REGISTRY}.
 * @example
 * // Example of registering a new agent
 * registerAgent({
 *   id: 'my-custom-agent',
 *   name: 'My Custom Agent',
 *   description: 'An agent for handling custom tasks.',
 *   tools: ['toolA', 'toolB'],
 *   keywords: ['custom', 'utility']
 * });
 */
export const registerAgent = (agentProfile) => {
  if (!agentProfile.id) {
    throw new new Error('Agent profile must contain a unique id');
  }
  // Bug fix: Prevent silent overwriting of existing agents.
  // A registry should enforce unique identifiers or explicitly handle duplicates.
  if (SWARM_REGISTRY[agentProfile.id]) {
    console.warn(`⚠️ Swarm Registry Warning: Agent with ID "${agentProfile.id}" already exists in the registry. Skipping duplicate registration.`);
    return;
  }

  SWARM_REGISTRY[agentProfile.id] = {
    ...agentProfile,
    tools: agentProfile.tools || [],
    keywords: agentProfile.keywords || []
  };
  console.log(`📡 Swarm Registry: Successfully loaded micro-agent "${agentProfile.name}" (ID: ${agentProfile.id})`);
};

/**
 * @description Initializes the Swarm Registry by automatically discovering and registering
 * all agent profiles exported from the `./agents/` directory. This loop executes
 * upon module import, ensuring the registry is populated at application startup.
 */
// Auto-register all modular agents under the dedicated folder
customAgents.forEach(agent => registerAgent(agent));