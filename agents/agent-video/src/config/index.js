/**
 * @fileoverview Video Agent configuration.
 * Merges shared platform config with agent-specific overrides
 * (Veo model tiers, quality routing, cost metadata).
 */

import sharedConfig from '../../../../shared/config/index.js';

const agentConfig = {
  ...sharedConfig,

  // ── Agent Identity ─────────────────────────────────────────────────────────
  agentName: 'video',

  // ── Conversational Model (for prompt analysis, clarification) ──────────────
  conversationalModel: 'gemini-3.5-flash',

  // ── Veo Model Tiers ────────────────────────────────────────────────────────
  // Each tier maps to a Veo model with different quality/cost tradeoffs.
  // Pricing is per-second of generated video.
  veoModels: {
    lite: 'veo-3.1-lite-generate-preview',         // $0.03–$0.05/sec
    fast: 'veo-3.1-fast-generate-preview',          // $0.15–$0.25/sec
    standard: 'veo-3.1-generate-preview',           // $0.35–$0.50/sec
    standardAudio: 'veo-3.1-generate-preview',      // $0.75/sec (with audio flag)
  },

  // ── Default Tier ───────────────────────────────────────────────────────────
  defaultTier: 'fast',
};

export default agentConfig;
