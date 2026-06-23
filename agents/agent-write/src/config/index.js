/**
 * @fileoverview Agent-specific configuration for the Write Agent.
 * Extends the shared config with write-specific model and region settings.
 *
 * Usage:
 *   import agentConfig from './config/index.js';
 *   console.log(agentConfig.primaryModel); // 'claude-4-5-sonnet@20250219'
 */

import sharedConfig from '../../../../shared/config/index.js';

const agentConfig = {
  ...sharedConfig,

  // ── Write Agent Identity ──────────────────────────────────────────────────
  agentName: 'write',

  // ── Model Configuration ───────────────────────────────────────────────────
  // Claude 4.5 Sonnet is the primary model for high-quality document generation.
  // Gemini 3.5 Flash is the fallback for speed-critical or cost-sensitive paths.
  primaryModel: 'claude-4-5-sonnet@20250219',
  fallbackModel: 'gemini-3.5-flash',

  // ── Region Override ───────────────────────────────────────────────────────
  // us-east5 is the designated region for Claude on Vertex AI.
  vertexAiRegion: 'us-east5',
};

export default agentConfig;
