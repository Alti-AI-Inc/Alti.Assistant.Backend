/**
 * @fileoverview Agent Proxy Router — dispatches AI workloads from the API Gateway
 * to the appropriate agent microservice. This module is imported by the existing
 * monolith's route index and replaces direct module calls with HTTP proxy requests.
 *
 * Architecture:
 *   Client → Gateway (auth/billing) → Agent Service (AI processing) → Gateway → Client
 *
 * Each agent service URL is configured via environment variables:
 *   SEARCH_AGENT_URL, RESEARCH_AGENT_URL, WRITE_AGENT_URL, CODE_AGENT_URL, REVIEW_AGENT_URL,
 *   IMAGE_AGENT_URL, AUDIO_AGENT_URL, VIDEO_AGENT_URL
 */

import { createInternalHeaders } from '../../../../shared/auth/index.js';
import { logger } from '../../../../shared/logging/index.js';

// ── Agent Service Registry ──────────────────────────────────────────────────
const AGENT_REGISTRY = {
  search: {
    url: process.env.SEARCH_AGENT_URL,
    name: 'Search Agent',
    model: 'Gemini 3.5 Flash + Live Web Grounding',
  },
  research: {
    url: process.env.RESEARCH_AGENT_URL,
    name: 'Research Agent',
    model: 'Gemini 3.1 Pro',
  },
  write: {
    url: process.env.WRITE_AGENT_URL,
    name: 'Write Agent',
    model: 'Claude Sonnet 4.5 (Vertex AI)',
  },
  code: {
    url: process.env.CODE_AGENT_URL,
    name: 'Code Agent',
    model: 'Claude Sonnet 4.5 (Vertex AI)',
  },
  review: {
    url: process.env.REVIEW_AGENT_URL,
    name: 'Review Agent',
    model: 'Gemini 3.1 Pro (Structured Review)',
  },
  image: {
    url: process.env.IMAGE_AGENT_URL,
    name: 'Image Agent',
    model: 'Gemini 3.1 Flash Image',
  },
  audio: {
    url: process.env.AUDIO_AGENT_URL,
    name: 'Audio Agent',
    model: 'Gemini 3.1 Flash TTS + Lyria 3',
  },
  video: {
    url: process.env.VIDEO_AGENT_URL,
    name: 'Video Agent',
    model: 'Veo 3.1 (Tiered)',
  },
};

/**
 * Proxy a request to an agent service.
 * @param {string} agentName - Key in AGENT_REGISTRY
 * @param {string} path - The endpoint path on the agent (e.g., '/execute')
 * @param {object} body - The request body to forward
 * @param {object} user - The authenticated user object
 * @param {object} [options] - Additional options
 * @param {boolean} [options.stream] - If true, returns a readable stream (SSE)
 * @returns {Promise<object>} The agent's response
 */
export async function proxyToAgent(agentName, path, body, user, options = {}) {
  const agent = AGENT_REGISTRY[agentName];
  if (!agent) {
    throw new Error(`Unknown agent: ${agentName}`);
  }

  if (!agent.url) {
    throw new Error(
      `Agent service URL not configured for ${agent.name}. ` +
        `Set ${agentName.toUpperCase()}_AGENT_URL environment variable.`
    );
  }

  const url = `${agent.url}${path}`;
  const headers = createInternalHeaders(user);

  logger.info(`Proxying request to ${agent.name}: ${url}`, {
    agent: agentName,
    model: agent.model,
    userId: user._id || user.userId,
  });

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000), // 5 minute timeout
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        `Agent ${agent.name} returned ${response.status}: ${errorBody}`
      );
      throw new Error(`Agent service error (${response.status}): ${errorBody}`);
    }

    // Handle streaming responses (SSE)
    if (options.stream) {
      return response.body;
    }

    const result = await response.json();
    const duration = Date.now() - startTime;

    logger.info(`Agent ${agent.name} responded in ${duration}ms`, {
      agent: agentName,
      durationMs: duration,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      `Agent ${agent.name} request failed after ${duration}ms: ${error.message}`,
      {
        agent: agentName,
        durationMs: duration,
        error: error.message,
      }
    );
    throw error;
  }
}

/**
 * Check health of all agent services.
 * @returns {Promise<object>} Health status of all agents
 */
export async function checkAgentHealth() {
  const results = {};

  await Promise.allSettled(
    Object.entries(AGENT_REGISTRY).map(async ([name, agent]) => {
      if (!agent.url) {
        results[name] = { status: 'unconfigured', model: agent.model };
        return;
      }

      try {
        const response = await fetch(`${agent.url}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        const data = await response.json();
        results[name] = { status: 'healthy', model: agent.model, ...data };
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          model: agent.model,
          error: error.message,
        };
      }
    })
  );

  return results;
}

/**
 * Get the registry of all configured agents.
 * @returns {object}
 */
export function getAgentRegistry() {
  return Object.fromEntries(
    Object.entries(AGENT_REGISTRY).map(([name, agent]) => [
      name,
      {
        name: agent.name,
        model: agent.model,
        configured: !!agent.url,
        url: agent.url ? '(configured)' : '(not configured)',
      },
    ])
  );
}

export default { proxyToAgent, checkAgentHealth, getAgentRegistry };
