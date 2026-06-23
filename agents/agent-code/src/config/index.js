/**
 * @fileoverview Agent-specific configuration for the Code Agent.
 * Extends the shared config with code-generation model preferences.
 *
 * Usage:
 *   import agentConfig from './src/config/index.js';
 *   console.log(agentConfig.primaryModel);
 */

import sharedConfig from '../../../../shared/config/index.js';

const agentConfig = {
  ...sharedConfig,

  // ── Agent Identity ───────────────────────────────────────────────────────
  agentName: 'code',
  agentVersion: '1.0.0',

  // ── Model Configuration ──────────────────────────────────────────────────
  primaryModel: 'claude-4-5-sonnet@20250219',
  fallbackModel: 'gemini-3.5-flash',

  // ── Vertex AI Region ─────────────────────────────────────────────────────
  vertexAiRegion: 'us-east5',

  // ── Code Generation Defaults ─────────────────────────────────────────────
  defaults: {
    temperature: 0.1, // Low temperature for deterministic code output
    maxOutputTokens: 8192,
    topP: 0.95,
    topK: 40,
  },

  // ── Supported Languages ──────────────────────────────────────────────────
  supportedLanguages: [
    'javascript', 'typescript', 'python', 'java', 'go', 'rust',
    'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin',
    'sql', 'html', 'css', 'bash', 'powershell',
  ],
};

export default agentConfig;
