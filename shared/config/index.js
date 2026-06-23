/**
 * @fileoverview Shared configuration module for all Alti agent microservices.
 * Each agent imports this to get a consistent view of environment variables
 * without duplicating config parsing logic.
 *
 * Usage:
 *   import config from '@alti/shared/config';
 *   console.log(config.gcp.projectId);
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// ── Strip BOM (\\uFEFF) from all environment variables ───────────────────────
const BOM = '\uFEFF';
for (const key of Object.keys(process.env)) {
  if (typeof process.env[key] === 'string') {
    let val = process.env[key];
    if (val.startsWith(BOM)) {
      val = val.replace(/^\uFEFF+/, '');
    }
    process.env[key] = val.replace(/[\r\n]+$/, '').trim();
  }
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  serviceName: process.env.SERVICE_NAME || 'alti-agent',

  // ── Database ────────────────────────────────────────────────────────────────
  database: {
    uri: process.env.DATABASE_LOCAL || process.env.MONGODB_URI,
    options: { family: 4 },
  },

  // ── Redis ───────────────────────────────────────────────────────────────────
  redis: {
    url: process.env.REDIS_URL,
    expiresIn: process.env.REDIS_TOKEN_EXPIRES_IN,
  },

  // ── JWT (for validating gateway-forwarded tokens) ───────────────────────────
  jwt: {
    accessToken: process.env.JWT_ACCESS_TOKEN,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
  },

  // ── GCP ─────────────────────────────────────────────────────────────────────
  gcp: {
    projectId: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_LOCATION || 'us-central1',
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    vertexAiEndpoint: process.env.VERTEX_AI_ENDPOINT,
    vertexAiRegion: process.env.VERTEX_AI_LOCATION || 'us-central1',
  },

  // ── GCS Buckets ─────────────────────────────────────────────────────────────
  gcs: {
    uploadsBucket: process.env.GCS_UPLOADS_BUCKET || 'alti_assistant_uploads',
    transcriptionBucket: process.env.GCS_TRANSCRIPTION_BUCKET || 'alti_assistant_transcription',
    knowledgeBankBucket: process.env.GCS_KNOWLEDGE_BANK_BUCKET || 'alti_knowledge_bank_files',
    presentationBucket: process.env.GCS_PRESENTATION_BUCKET || 'alti_assistant_presentation',
  },

  // ── Model Defaults ──────────────────────────────────────────────────────────
  models: {
    flash: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    pro: process.env.GEMINI_PRO_MODEL || 'gemini-3.1-pro',
    claudeSonnet: 'claude-4-5-sonnet@20250219',
    imagen: 'gemini-3.1-flash-image',
    tts: 'gemini-3.1-flash-tts-preview',
    lyria: 'lyria-3-pro-preview',
    veo: 'veo-3.1-fast-generate-preview',
  },

  // ── Gemini API ──────────────────────────────────────────────────────────────
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.2,
  },

  // ── Internal Service Auth ───────────────────────────────────────────────────
  internal: {
    // Shared secret for gateway ↔ agent service-to-service auth
    serviceSecret: process.env.INTERNAL_SERVICE_SECRET || 'alti-internal-dev-secret',
  },

  // ── Privacy ─────────────────────────────────────────────────────────────────
  privacy: {
    neverCollectData: true,
    neverTrainOnUserData: true,
    dataRetentionDays: 0,
  },
};

export default config;
