/**
 * Core System Agents
 */

/**
 * @constant {object} generalChatAssistant - Configuration object for the Inso AI Core Assistant.
 *   This agent is designed to handle general conversational queries, providing clear and direct answers
 *   based on its defined system instructions. It serves as a foundational conversational AI.
 * @property {string} id - A unique identifier for the general chat assistant.
 * @property {string} name - The display name of the assistant.
 * @property {string} description - A brief description of the assistant's primary function.
 * @property {string} systemInstruction - Detailed instructions guiding the assistant's behavior and response style.
 *   It emphasizes direct answers, conciseness, and specific formatting for different types of questions.
 * @property {string} model - The AI model used by this assistant (e.g., 'gemini-3.5-flash').
 * @property {Array<object>} safetySettings - Configuration for Google's content safety filters.
 * @property {Array<string>} tools - An array of tools available to this assistant (currently empty).
 * @property {Array<string>} keywords - A list of keywords or phrases that might trigger or be associated with this assistant's domain.
 */
export const generalChatAssistant = {
  id: 'general_chat_assistant',
  name: 'Inso AI Core Assistant',
  description: 'Handles general conversational queries with clear, direct answers.',
  systemInstruction: `You are Inso AI, a direct-answer AI assistant.

Give ONLY the answer. Lead with the answer. No filler.
- Simple question = one sentence answer.
- Complex question = concise paragraph (under 150 words).
- Multiple facts = bullet points.
- Comparisons = table.
- If uncertain, say "I'm not sure." Never fabricate.`,
  model: 'gemini-3.5-flash',
  // Enterprise safety settings to block harmful content.
  // These settings are passed to the Vertex AI model during initialization.
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: [],
  keywords: ['hello', 'hi', 'how are you', 'operating system for law', 'would you rather', 'conceptual', 'general chat', 'explanation', 'discussion', 'what is', 'opinion', 'philosophical', 'question']
};

/**
 * @constant {object} platformOwnerAgent - Configuration object for the Platform Owner / Super Admin Agent.
 *   This agent is designed for global oversight, tenant management (suspension/unsuspension, limit overrides),
 *   system-wide configuration, and global log analysis.
 * @property {string} id - A unique identifier for the platform owner agent.
 * @property {string} name - The display name of the agent.
 * @property {string} description - A brief description of the agent's administrative capabilities.
 * @property {string} systemInstruction - Detailed instructions guiding the agent's administrative behavior, security protocols, and operational procedures.
 * @property {string} model - The AI model used by this agent.
 * @property {Array<object>} safetySettings - Configuration for Google's content safety filters.
 * @property {Array<string>} tools - An array of tools available to this agent for executing administrative actions.
 * @property {Array<string>} keywords - A list of keywords or phrases associated with administrative tasks.
 */
export const platformOwnerAgent = {
  id: 'platform_owner_agent',
  name: 'Platform Owner Agent',
  description: 'Elite administrative agent with global oversight, tenant management, and system configuration capabilities.',
  systemInstruction: `You are the Platform Owner / Super Admin Agent. Your role is to provide global oversight and execute administrative actions across the entire multi-tenant platform.

You have the authority to:
1. Manage Tenants: Suspend or unsuspend tenants, override tenant resource/rate limits, and provision new tenants.
2. System-wide Configuration: Modify global system settings, feature flags, and environment variables.
3. Global Oversight: View aggregated system statistics, active connections, and tenant usage metrics.
4. Global Logs: Query and analyze system-wide logs to diagnose issues or audit administrative actions.

Security Protocol:
- Always verify the caller's Super Admin credentials before executing destructive actions (e.g., tenant suspension, limit overrides).
- Log all administrative actions with detailed context (timestamp, target tenant, action performed, and initiator).
- Maintain strict confidentiality of tenant data; do not expose cross-tenant data unless explicitly authorized.`,
  model: 'gemini-3.5-flash',
  // Enterprise safety settings to block harmful content.
  // These settings are passed to the Vertex AI model during initialization.
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: [
    'manage_tenant',
    'get_global_stats',
    'configure_system',
    'view_global_logs'
  ],
  keywords: [
    'admin',
    'suspend',
    'unsuspend',
    'tenant limit',
    'override limit',
    'global stats',
    'system config',
    'global logs',
    'platform owner',
    'super admin',
    'tenant management',
    'system settings'
  ]
};