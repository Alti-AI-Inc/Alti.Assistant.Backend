/**
 * @fileoverview Audio Agent configuration.
 * Extends the shared platform config with audio-specific model selections
 * for script writing, TTS synthesis, and music generation.
 *
 * Usage:
 *   import agentConfig from './config/index.js';
 *   console.log(agentConfig.ttsModel); // 'gemini-3.1-flash-tts-preview'
 */

import sharedConfig from '../../../../shared/config/index.js';

const agentConfig = {
  ...sharedConfig,

  // ── Agent Identity ─────────────────────────────────────────────────────────
  agentName: 'audio',

  // ── Script Generation (cheap, fast — drafts scripts/lyrics) ────────────────
  scriptModel: 'gemini-3.5-flash',

  // ── Voice Synthesis (Gemini TTS with audio tags) ───────────────────────────
  ttsModel: 'gemini-3.1-flash-tts-preview',

  // ── Music Generation (full tracks via Lyria 3 Pro) ─────────────────────────
  musicModel: 'lyria-3-pro-preview',

  // ── Short Music / Jingles (via Lyria 3 Clip) ──────────────────────────────
  musicClipModel: 'lyria-3-clip-preview',
};

export default agentConfig;
