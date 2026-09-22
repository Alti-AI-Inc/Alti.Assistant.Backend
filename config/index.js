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
  database_local:
    process.env.DATABASE_LOCAL ||
    process.env.MONGODB_URI ||
    process.env.MONGODB_URL,
  port: process.env.PORT,
  client_url: process.env.CLIENT_URL,

  // ── Auth (JWT) ────────────────────────────────────────────────────────────
  jwt: {
    access_token: process.env.JWT_ACCESS_TOKEN,
    access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    refresh_token: process.env.JWT_REFRESH_REFRESH_TOKEN,
    refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || 'admin@insohq.com',

  // ── Email (Nodemailer SMTP) ───────────────────────────────────────────────
  mail: {
    smtp_host: process.env.SMTP_HOST,
    smtp_port: process.env.SMTP_PORT,
    smtp_user: process.env.SMTP_USER,
    smtp_password: process.env.SMTP_PASSWORD,
    sender_mail: process.env.SENDER_MAIL,
    confirm_reg_email: process.env.CONFIRM_REG_EMAIL,
  },

  // ── Redis ─────────────────────────────────────────────────────────────────
  redis: {
    url: process.env.REDIS_URL,
    expires_in: process.env.REDIS_TOKEN_EXPIRES_IN,
  },
  redis_url: process.env.REDIS_URL,

  // ── Groq (LLM — single source of truth) ───────────────────────────────────
  // gpt-oss-120b: 120B MoE, 500 tok/s, 128k context — heavy reasoning & code
  // gpt-oss-20b:  20B dense, 1200 tok/s, 128k context — fast classification
  // whisper-large-v3-turbo: Speech-to-text
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'gpt-oss-120b',
    lightModel: process.env.GROQ_LIGHT_MODEL || 'gpt-oss-20b',
    sttModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
    temperature: parseFloat(process.env.GROQ_TEMPERATURE) || 0.2,
  },
  llmProvider: 'groq',

  // ── Exa (Neural Search + Grounding) ───────────────────────────────────────
  exa_api_key: process.env.EXA_API_KEY,

  // ── Composio (Agentic Tool Execution & Auth) ──────────────────────────────
  composio: {
    apiKey: process.env.COMPOSIO_API_KEY,
    baseUrl: process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev',
    mcpUrl: process.env.COMPOSIO_MCP_URL || 'https://connect.composio.dev/mcp',
  },

  // ── Stripe (Payments) ─────────────────────────────────────────────────────
  stripe: {
    stripe_secret_key: process.env.STRIPE_SECRET_KEY,
    webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
    webhook_secret_fallback: process.env.STRIPE_WEBHOOK_SECRET_FALLBACK,
    security_alert_webhook: process.env.SECURITY_ALERT_WEBHOOK,
  },

  // ── Cloudflare (CDN + Workers AI Embeddings) ──────────────────────────────
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
  },

  // ── Liberty Center One / Object Storage (MinIO → OpenStack Swift) ─────────
  objectStorage: {
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    port: parseInt(process.env.OBJECT_STORAGE_PORT, 10) || 443,
    accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY,
    secretKey: process.env.OBJECT_STORAGE_SECRET_KEY,
    region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
    uploadsBucket: process.env.UPLOADS_BUCKET || 'aphura-uploads',
    transcriptionBucket: process.env.TRANSCRIPTION_BUCKET || 'aphura-transcription',
    knowledgeBankBucket: process.env.KNOWLEDGE_BANK_BUCKET || 'aphura-knowledge-bank',
    knowledgebotBucket: process.env.KNOWLEDGEBOT_BUCKET || 'aphura-knowledgebot',
    presentationBucket: process.env.PRESENTATION_BUCKET || 'aphura-presentations',
  },

  // ── Liberty Center One / OpenStack Native Resources ───────────────────────
  openstack: {
    authUrl: process.env.OPENSTACK_AUTH_URL || 'https://identity.libertycenterone.com/v3',
    novaUrl: process.env.OPENSTACK_NOVA_URL || 'https://compute.libertycenterone.com/v2.1',
    cinderUrl: process.env.OPENSTACK_CINDER_URL || 'https://volume.libertycenterone.com/v3',
    glanceUrl: process.env.OPENSTACK_GLANCE_URL || 'https://image.libertycenterone.com/v2',
    barbicanUrl: process.env.OPENSTACK_BARBICAN_URL || 'https://key-manager.libertycenterone.com/v1',
    octaviaUrl: process.env.OPENSTACK_OCTAVIA_URL || 'https://load-balancer.libertycenterone.com/v2',
    heatUrl: process.env.OPENSTACK_HEAT_URL || 'https://orchestration.libertycenterone.com/v1',
    neutronUrl: process.env.OPENSTACK_NEUTRON_URL || 'https://network.libertycenterone.com/v2.0',
    username: process.env.OPENSTACK_USERNAME,
    password: process.env.OPENSTACK_PASSWORD,
    projectName: process.env.OPENSTACK_PROJECT_NAME,
    userDomainName: process.env.OPENSTACK_USER_DOMAIN_NAME || 'Default',
  },

  // ── Temporal (Durable Workflows) ──────────────────────────────────────────
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
  },

  realestateapi: {
    key: process.env.REALESTATE_API_KEY || 'dummy_realestate_key',
    baseUrl: process.env.REALESTATE_API_URL || 'https://api.realestateapi.com',
  },

  fred: {
    key: process.env.FRED_API_KEY || 'dummy_fred_key',
    baseUrl: 'https://api.stlouisfed.org/fred',
  },

  arxiv: {
    baseUrl: 'http://export.arxiv.org/api',
  },

  congress: {
    key: process.env.CONGRESS_API_KEY || 'dummy_congress_key',
    baseUrl: 'https://api.congress.gov/v3',
  },

  // ── Smart Routing ─────────────────────────────────────────────────────────
  routing: {
    enableSmartRouting: process.env.ENABLE_SMART_ROUTING === 'true',
    codeQueryThreshold:
      parseFloat(process.env.CODE_QUERY_CONFIDENCE_THRESHOLD) || 0.7,
  },

  // ── LangSmith (Observability) ─────────────────────────────────────────────
  langsmith: {
    tracing: process.env.LANGSMITH_TRACING === 'true',
    apiKey: process.env.LANGSMITH_API_KEY,
    project: process.env.LANGSMITH_PROJECT || 'default',
  },

  // ── Privacy Policy ────────────────────────────────────────────────────────
  privacy: {
    neverCollectData: true,
    neverTrainOnUserData: true,
    dataRetentionDays: 0,
  },
};
