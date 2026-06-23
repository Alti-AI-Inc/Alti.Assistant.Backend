/**
 * @fileoverview Search Agent configuration.
 * Merges shared platform config with agent-specific overrides
 * (model selection, grounding toggle, etc.).
 */

import sharedConfig from '../../../../shared/config/index.js';

const agentConfig = {
  ...sharedConfig,

  // ── Agent Identity ─────────────────────────────────────────────────────────
  agentName: 'search',

  // ── Model Selection ────────────────────────────────────────────────────────
  primaryModel: 'gemini-3.5-flash',
  fallbackModel: 'gemini-3.1-flash-lite',

  // ── Search-Specific ────────────────────────────────────────────────────────
  enableGrounding: true,
};

export default agentConfig;
