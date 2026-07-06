/**
 * @fileoverview Image Agent configuration.
 * Merges shared platform config with agent-specific overrides
 * (model selection, image generation settings, etc.).
 */

import sharedConfig from '../../../../shared/config/index.js';

const agentConfig = {
  ...sharedConfig,

  // ── Agent Identity ──────────────────────────────────────────────────────────
  agentName: 'image',

  // ── Model Selection ─────────────────────────────────────────────────────────
  // Primary: Imagen 4 native image generation (text+image in, text+image out)
  primaryModel: 'imagen-4.0-generate-001',
  // Conversational: Used for prompt analysis and refinement
  conversationalModel: 'gemini-3.5-flash',

  // ── Deprecation Notice ──────────────────────────────────────────────────────
  note: 'Replaces deprecated Imagen 4 (shutdown Aug 17 2026)',

  // ── Image Defaults ──────────────────────────────────────────────────────────
  defaults: {
    width: 1024,
    height: 1024,
    format: 'png',
    quality: 90,
  },
};

export default agentConfig;
