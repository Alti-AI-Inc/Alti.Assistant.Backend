import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// ── Strip BOM (\uFEFF) from all environment variables ───────────────────────
// Some secret injection pipelines can prepend a BOM.
// This runs once at startup and sanitizes every env var before any code reads them.
const BOM = '\uFEFF';
for (const key of Object.keys(process.env)) {
  if (typeof process.env[key] === 'string') {
    let val = process.env[key];
    if (val.startsWith(BOM)) {
      val = val.replace(/^\uFEFF+/, '');
    }
    // Strip trailing carriage returns, newlines, and trailing spaces from secrets
    process.env[key] = val.replace(/[\r\n]+$/, '').trim();
  }
}
export default {
  env: process.env.NODE_ENV,
  database_local: process.env.DATABASE_LOCAL,
  port: process.env.PORT,
  client_url: process.env.CLIENT_URL,
  youtube_api_key: process.env.YOUTUBE_API_KEY,
  jwt: {
    access_token: process.env.JWT_ACCESS_TOKEN,
    access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    refresh_token: process.env.JWT_REFRESH_REFRESH_TOKEN,
    refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || 'admin@insohq.com',
  email: process.env.email,
  password: process.env.password,
  client_id: process.env.CLIENT_ID,
  client_secret: process.env.CLIENT_SECRET,
  sender_mail: process.env.SENDER_MAIL,
  refresh_token: process.env.REFRESH_TOKEN,
  access_token: process.env.ACCESS_TOKEN,
  confirm_reg_email: process.env.CONFIRM_REG_EMAIL,
  livekit_api_key: process.env.LIVEKIT_API_KEY,
  livekit_secret_key: process.env.LIVEKIT_SECRET_KEY,
  cloud_storage_secret_key: process.env.CLOUD_STORAGE_SECRET_KEY,
  cloud_storage_access_key: process.env.CLOUD_STORAGE_ACCESS_KEY,
  cloud_storage_bucket: process.env.CLOUD_STORAGE_BUCKET,
  linkup_api_key: process.env.LINKUP_API_KEY,
  exa_api_key: process.env.EXA_API_KEY,
  redis: {
    url: process.env.REDIS_URL,
    expires_in: process.env.REDIS_TOKEN_EXPIRES_IN,
  },
  // Top-level alias for backwards-compat with modules using config.redis_url
  redis_url: process.env.REDIS_URL,
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DATABASE || 'rag_database',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
  },
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
  },

  openMemory: {
    enabled: process.env.OPENMEMORY_ENABLED === 'true',
    baseUrl: process.env.OPENMEMORY_BASE_URL || 'http://localhost:8080',
    apiKey: process.env.OPENMEMORY_API_KEY || '',
    defaultNamespace: process.env.OPENMEMORY_NAMESPACE || 'default',
    defaultTopK: Number(process.env.OPENMEMORY_TOP_K || 5),
    timeoutMs: Number(process.env.OPENMEMORY_TIMEOUT_MS || 8000),
  },

  // ── Groq Config (single source of truth) ──────────────────────────────────
  // gpt-oss-120b: 120B MoE, 500 tok/s, 128k context, tool calling — heavy reasoning & code
  // gpt-oss-20b:  20B dense, 1200 tok/s, 128k context — fast classification, evaluation, simple tasks
  // whisper-large-v3-turbo: Speech-to-text
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'gpt-oss-120b',
    lightModel: process.env.GROQ_LIGHT_MODEL || 'gpt-oss-20b',
    sttModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
    temperature: parseFloat(process.env.GROQ_TEMPERATURE) || 0.2,
  },
  realestate_api_key: process.env.REALESTATE_API_KEY,

  llmProvider: 'groq',

  browser_use_secret_key: process.env.BROWSER_USE_SECRET_KEY,
  cyberdesk_api_key: process.env.CYBERDESK_API_KEY,
  stripe: {
    stripe_secret_key: process.env.STRIPE_SECRET_KEY,
    webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
    webhook_secret_fallback: process.env.STRIPE_WEBHOOK_SECRET_FALLBACK,
    security_alert_webhook: process.env.SECURITY_ALERT_WEBHOOK,
  },

  routing: {
    enableSmartRouting: process.env.ENABLE_SMART_ROUTING === 'true',
    codeQueryThreshold:
      parseFloat(process.env.CODE_QUERY_CONFIDENCE_THRESHOLD) || 0.7,
  },

  // ── Object Storage (S3-compatible / OpenStack Swift) ──────────────────────
  objectStorage: {
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY,
    secretKey: process.env.OBJECT_STORAGE_SECRET_KEY,
    region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
    uploadsBucket: process.env.UPLOADS_BUCKET || 'alti-uploads',
    transcriptionBucket: process.env.TRANSCRIPTION_BUCKET || 'alti-transcription',
    knowledgeBankBucket: process.env.KNOWLEDGE_BANK_BUCKET || 'alti-knowledge-bank',
    knowledgebotBucket: process.env.KNOWLEDGEBOT_BUCKET || 'alti-knowledgebot',
    presentationBucket: process.env.PRESENTATION_BUCKET || 'alti-presentations',
  },

  shelfHfRagIndexing: process.env.SHELF_HF_RAG_INDEXING === 'true',
  mail: {
    smtp_password: process.env.SMTP_PASSWORD,
    smtp_user: process.env.SMTP_USER,
    smtp_host: process.env.SMTP_HOST,
    smtp_port: process.env.SMTP_PORT,
  },

  // ── Cloudflare ────────────────────────────────────────────────────────────
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
  },

  // ── Composio (Agentic Tool Execution & Auth) ─────────────────────────────
  composio: {
    apiKey: process.env.COMPOSIO_API_KEY,
    baseUrl: process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev',
    mcpUrl: process.env.COMPOSIO_MCP_URL || 'https://connect.composio.dev/mcp',
  },

  privacy: {
    neverCollectData: true,
    neverTrainOnUserData: true,
    dataRetentionDays: 0,
  },
};
