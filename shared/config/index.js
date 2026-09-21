/**
 * @fileoverview Shared configuration module for all Inso AI agent microservices.
 * Each agent imports this to get a consistent view of environment variables
 * without duplicating config parsing logic.
 *
 * Usage:
 *   import config from '@inso/shared/config';
 */

import path from 'path';
import fs from 'fs';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: envPath });
  } catch (e) {
    console.warn('dotenv not found, skipping .env load');
  }
}

// ── Strip BOM (\uFEFF) from all environment variables ───────────────────────
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
  port: parseInt(process.env.PORT || '5100', 10),
  serviceName: process.env.SERVICE_NAME || 'inso-agent',

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

  // ── Groq Inference ──────────────────────────────────────────────────────────
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'gpt-oss-120b',
    sttModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
    temperature: parseFloat(process.env.GROQ_TEMPERATURE) || 0.2,
  },

  // ── Internal Service Auth ───────────────────────────────────────────────────
  internal: {
    serviceSecret: process.env.INTERNAL_SERVICE_SECRET || 'inso-internal-dev-secret',
  },

  // ── Privacy ─────────────────────────────────────────────────────────────────
  privacy: {
    neverCollectData: true,
    neverTrainOnUserData: true,
    dataRetentionDays: 0,
  },
};

/**
 * Dynamically loads missing critical secrets from environment variables.
 * Should be called at application startup before relying on these secrets.
 */
export async function loadMissingSecrets() {
  if (config.env !== 'production') return;
  
  try {
    const { getSecret } = await import('./secrets.js');
    
    if (config.internal.serviceSecret === 'inso-internal-dev-secret') {
      const secret = await getSecret('INTERNAL_SERVICE_SECRET');
      if (secret) {
        config.internal.serviceSecret = secret;
      }
    }
    if (!config.groq.apiKey) {
      const key = await getSecret('GROQ_API_KEY');
      if (key) {
        config.groq.apiKey = key;
      }
    }
    if (!config.jwt.accessToken) {
      const token = await getSecret('JWT_ACCESS_TOKEN');
      if (token) {
        config.jwt.accessToken = token;
      }
    }
  } catch (error) {
    console.warn('Could not load secrets dynamically:', error.message);
  }
}

export default config;
