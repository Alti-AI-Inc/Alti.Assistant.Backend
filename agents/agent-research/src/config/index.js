/**
 * @fileoverview Agent-specific configuration for the Research Agent.
 * Merges the shared base config with research-specific model selections.
 *
 * Usage:
 *   import config from '../config/index.js';
 *   console.log(config.agentName);       // 'research'
 *   console.log(config.primaryModel);    // 'gemini-3.1-pro'
 */

import sharedConfig from '../../../../shared/config/index.js';

const agentConfig = {
  ...sharedConfig,

  // ── Research Agent Identity ───────────────────────────────────────────────
  agentName: 'research',

  // ── Model Assignments ─────────────────────────────────────────────────────
  // Primary model for deep-dive analysis and synthesis
  primaryModel: 'gemini-3.1-pro',

  // Fast model for breadth search (many parallel calls)
  breadthModel: 'gemini-3.5-flash',

  // Synthesis model for final report generation
  synthesisModel: 'gemini-3.1-pro',
};

export default agentConfig;
