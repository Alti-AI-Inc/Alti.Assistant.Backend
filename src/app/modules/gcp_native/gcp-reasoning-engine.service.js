import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * @file gcp-reasoning-engine.service.js
 * @module app/modules/gcp_native/gcp-reasoning-engine.service
 * @description Native Vertex AI Reasoning Engine (Agent Builder) service.
 *   Enables deployment of LangChain/ADK agents as managed Vertex AI Reasoning Engines,
 *   creates interactive sessions, executes multi-turn queries, and streams responses —
 *   all through the Vertex AI REST API with Application Default Credentials (ADC).
 *
 *   Google Repository References (Apache 2.0):
 *   - https://github.com/googleapis/python-aiplatform
 *   - https://github.com/google-gemini/gemini-api-cookbook
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/reasoning-engine/overview
 */

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Returns the Vertex AI Reasoning Engine base URL for the given project/location.
 * @param {string} projectId
 * @param {string} location
 * @returns {string}
 */
const getBaseUrl = (projectId, location) =>
  `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}`;

/**
 * Lists all deployed Reasoning Engine instances in the configured project.
 *
 * @returns {Promise<object>} List of ReasoningEngine resources.
 */
const listReasoningEngines = async () => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');

  logger.info('GCP ReasoningEngine: Listing deployed Reasoning Engine instances...');
  const client = await auth.getClient();

  const url = `${getBaseUrl(projectId, location)}/reasoningEngines`;
  const response = await client.request({ url, method: 'GET' });

  const engines = response.data?.reasoningEngines || [];
  logger.info(`GCP ReasoningEngine: Found ${engines.length} deployed engine(s).`);
  return { success: true, engines, count: engines.length };
};

/**
 * Retrieves details of a specific Reasoning Engine by its resource name.
 *
 * @param {string} engineId - The numeric ID of the Reasoning Engine (not the full resource name).
 * @returns {Promise<object>} The ReasoningEngine resource details.
 */
const getReasoningEngine = async (engineId) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!engineId) throw new Error('Reasoning Engine ID is required.');

  logger.info(`GCP ReasoningEngine: Fetching engine details for ID: ${engineId}`);
  const client = await auth.getClient();

  const url = `${getBaseUrl(projectId, location)}/reasoningEngines/${engineId}`;
  const response = await client.request({ url, method: 'GET' });

  return { success: true, engine: response.data };
};

/**
 * Creates a new Vertex AI Reasoning Engine session for stateful multi-turn conversations.
 * Sessions persist query context across multiple `query()` calls.
 *
 * @param {string} engineId - The Reasoning Engine resource ID to create a session for.
 * @param {object} [userMetadata={}] - Optional metadata to associate with the session (e.g., userId, workspaceId).
 * @returns {Promise<object>} The created session resource, including its session ID.
 */
const createSession = async (engineId, userMetadata = {}) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!engineId) throw new Error('Reasoning Engine ID is required to create a session.');

  logger.info(`GCP ReasoningEngine: Creating session for engine: ${engineId}`);
  const client = await auth.getClient();

  const url = `${getBaseUrl(projectId, location)}/reasoningEngines/${engineId}/sessions`;
  const body = {
    userMetadata: {
      ...userMetadata,
      createdAt: new Date().toISOString(),
      platform: 'inso-assistant'
    }
  };

  const response = await client.request({ url, method: 'POST', data: body });

  const session = response.data;
  const sessionId = session.name?.split('/').pop();

  logger.info(`GCP ReasoningEngine: Session created — ID: ${sessionId}`);
  return { success: true, session, sessionId };
};

/**
 * Lists all active sessions for a specific Reasoning Engine.
 *
 * @param {string} engineId - The Reasoning Engine resource ID.
 * @returns {Promise<object>} List of active sessions.
 */
const listSessions = async (engineId) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!engineId) throw new Error('Reasoning Engine ID is required.');

  logger.info(`GCP ReasoningEngine: Listing sessions for engine: ${engineId}`);
  const client = await auth.getClient();

  const url = `${getBaseUrl(projectId, location)}/reasoningEngines/${engineId}/sessions`;
  const response = await client.request({ url, method: 'GET' });

  const sessions = response.data?.sessions || [];
  return { success: true, sessions, count: sessions.length };
};

/**
 * Deletes a specific session from a Reasoning Engine.
 *
 * @param {string} engineId - The Reasoning Engine resource ID.
 * @param {string} sessionId - The session ID to delete.
 * @returns {Promise<object>} Deletion result.
 */
const deleteSession = async (engineId, sessionId) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!engineId || !sessionId) throw new Error('Both engineId and sessionId are required.');

  logger.info(`GCP ReasoningEngine: Deleting session ${sessionId} from engine ${engineId}`);
  const client = await auth.getClient();

  const url = `${getBaseUrl(projectId, location)}/reasoningEngines/${engineId}/sessions/${sessionId}`;
  await client.request({ url, method: 'DELETE' });

  return { success: true, message: `Session ${sessionId} deleted successfully.` };
};

/**
 * Executes a synchronous query against a Reasoning Engine session.
 * This is the primary inference method — sends a user input and returns the agent's response.
 *
 * @param {string} engineId - The Reasoning Engine resource ID.
 * @param {string} sessionId - The session ID for stateful conversation context.
 * @param {string} input - The user's natural language input or instruction.
 * @param {object} [queryParams={}] - Additional query parameters (e.g., classMethod, classArgs).
 * @returns {Promise<object>} The agent's response output.
 */
const querySession = async (engineId, sessionId, input, queryParams = {}) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!engineId || !sessionId) throw new Error('Both engineId and sessionId are required.');
  if (!input) throw new Error('Input query text is required.');

  logger.info(`GCP ReasoningEngine: Querying session ${sessionId} with input: "${input.slice(0, 80)}..."`);
  const client = await auth.getClient();

  const url = `${getBaseUrl(projectId, location)}/reasoningEngines/${engineId}/sessions/${sessionId}:query`;

  // The Reasoning Engine :query endpoint supports class_method invocation
  const body = {
    input: {
      input,
      ...queryParams
    }
  };

  const response = await client.request({ url, method: 'POST', data: body });

  const output = response.data?.output || response.data;
  logger.info(`GCP ReasoningEngine: Session query completed for session ${sessionId}`);

  return {
    success: true,
    engineId,
    sessionId,
    input,
    output,
    timestamp: new Date().toISOString()
  };
};

/**
 * Streams a query against a Reasoning Engine session using server-sent events (SSE).
 * Ideal for long-running agent tasks where intermediate results should be emitted progressively.
 *
 * @param {string} engineId - The Reasoning Engine resource ID.
 * @param {string} sessionId - The session ID for stateful conversation context.
 * @param {string} input - The user's natural language input.
 * @param {Function} onChunk - Callback invoked for each streamed chunk: `(chunk: string) => void`.
 * @param {object} [queryParams={}] - Additional query parameters.
 * @returns {Promise<object>} Final aggregated result after stream completes.
 */
const streamQuerySession = async (engineId, sessionId, input, onChunk, queryParams = {}) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!engineId || !sessionId) throw new Error('Both engineId and sessionId are required.');
  if (!input) throw new Error('Input query text is required.');

  logger.info(`GCP ReasoningEngine: Streaming query for session ${sessionId}...`);
  const client = await auth.getClient();

  const url = `${getBaseUrl(projectId, location)}/reasoningEngines/${engineId}/sessions/${sessionId}:streamQuery`;
  const body = { input: { input, ...queryParams } };

  // Use the client to make the streaming POST request
  const accessToken = (await client.getAccessToken()).token;

  const fetch = (await import('node-fetch')).default;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GCP ReasoningEngine streaming failed: ${res.status} ${errText}`);
  }

  let fullText = '';
  const chunks = [];

  // Stream the NDJSON/SSE response line by line
  for await (const chunk of res.body) {
    const lines = chunk.toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.replace(/^data:\s*/, ''));
        const partial = parsed?.output?.content || parsed?.output || '';
        if (partial) {
          fullText += partial;
          chunks.push(partial);
          if (typeof onChunk === 'function') onChunk(partial);
        }
      } catch {
        // Non-JSON line — skip
      }
    }
  }

  logger.info(`GCP ReasoningEngine: Stream completed for session ${sessionId} — ${fullText.length} chars`);
  return {
    success: true,
    engineId,
    sessionId,
    input,
    output: fullText,
    chunks,
    timestamp: new Date().toISOString()
  };
};

/**
 * Retrieves the full message history for a given Reasoning Engine session.
 * Each entry includes the role (user/agent) and message content.
 *
 * @param {string} engineId - The Reasoning Engine resource ID.
 * @param {string} sessionId - The session ID.
 * @returns {Promise<object>} The list of events in the session.
 */
const getSessionHistory = async (engineId, sessionId) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!engineId || !sessionId) throw new Error('Both engineId and sessionId are required.');

  logger.info(`GCP ReasoningEngine: Retrieving history for session ${sessionId}...`);
  const client = await auth.getClient();

  const url = `${getBaseUrl(projectId, location)}/reasoningEngines/${engineId}/sessions/${sessionId}/events`;
  const response = await client.request({ url, method: 'GET' });

  const events = response.data?.sessionEvents || response.data?.events || [];
  return { success: true, sessionId, events, count: events.length };
};

/**
 * Complete end-to-end agent conversation helper.
 * Creates a session, runs a query, and optionally deletes the session after completion.
 *
 * @param {string} engineId - The Reasoning Engine resource ID.
 * @param {string} input - The user's natural language question or task.
 * @param {object} [options={}]
 * @param {boolean} [options.cleanup=true] - If true, the session is deleted after the query.
 * @param {object} [options.metadata={}] - Session metadata (userId, workspaceId, etc.).
 * @returns {Promise<object>} The complete response with session info.
 */
const runOneShot = async (engineId, input, options = {}) => {
  const { cleanup = true, metadata = {} } = options;

  logger.info(`GCP ReasoningEngine: Running one-shot query on engine ${engineId}...`);
  const { sessionId } = await createSession(engineId, metadata);

  try {
    const result = await querySession(engineId, sessionId, input);

    if (cleanup) {
      await deleteSession(engineId, sessionId).catch((err) => {
        logger.warn(`GCP ReasoningEngine: Cleanup of session ${sessionId} failed: ${err.message}`);
      });
    }

    return { ...result, sessionId: cleanup ? null : sessionId, isOneShot: true };
  } catch (err) {
    // Always cleanup on error
    if (cleanup) {
      await deleteSession(engineId, sessionId).catch(() => {});
    }
    throw err;
  }
};

/**
 * @namespace GcpReasoningEngineService
 * @description Provides a native service layer for Vertex AI Reasoning Engine (Agent Builder).
 * Manages engine discovery, session lifecycle, synchronous queries, streaming inference,
 * and full conversation history retrieval — all using GCP Application Default Credentials.
 */
export const GcpReasoningEngineService = {
  listReasoningEngines,
  getReasoningEngine,
  createSession,
  listSessions,
  deleteSession,
  querySession,
  streamQuerySession,
  getSessionHistory,
  runOneShot
};
