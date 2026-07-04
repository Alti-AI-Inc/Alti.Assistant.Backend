import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// ── Strip BOM (\uFEFF) from all environment variables ───────────────────────
// GCP Secret Manager injected via PowerShell pipes can prepend a BOM.
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
  google_search_api_key: process.env.GOOGLE_SEARCH_API_KEY,
  google_engine_id: process.env.GOOGLE_CSE_ID,
  jwt: {
    access_token: process.env.JWT_ACCESS_TOKEN,
    access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    refresh_token: process.env.JWT_REFRESH_REFRESH_TOKEN,
    refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || 'admin@insoai.com',
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
  redis: {
    url: process.env.REDIS_URL,
    expires_in: process.env.REDIS_TOKEN_EXPIRES_IN,
  },
  // Top-level alias for backwards-compat with modules using config.redis_url
  redis_url: process.env.REDIS_URL,
  alloydb: {
    host: process.env.ALLOYDB_HOST || '34.135.175.69',
    port: parseInt(process.env.ALLOYDB_PORT || '5432'),
    database: process.env.ALLOYDB_DATABASE || 'rag_database',
    user: process.env.ALLOYDB_USER || 'postgres',
    password: process.env.ALLOYDB_PASSWORD || 'Em0nd4r0ck@2',
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

  gemini_secret_key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  google_api_key: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,

  // ── Gemini Model Config (single source of truth — update here only) ──────
  // Flash: fastest & cheapest — use for 90% of requests
  // Pro:   deep reasoning, complex tasks, document review, agentic workflows
  gemini_model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  gemini_pro_model: process.env.GEMINI_PRO_MODEL || 'gemini-2.5-pro',
  gemini: {
    model_name: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    pro_model: process.env.GEMINI_PRO_MODEL || 'gemini-2.5-pro',
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.2,
  },
  realestate_api_key: process.env.REALESTATE_API_KEY,

  llmProvider: 'gcp', // Enforced GCP provider for exclusive Google Cloud architecture

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
  google: {
    google_application_credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    gcp_project_id: process.env.GCP_PROJECT_ID,
    gcp_location: process.env.GCP_LOCATION,
    vertex_ai_endpoint: process.env.VERTEX_AI_ENDPOINT,
    vertex_ai_region: process.env.VERTEX_AI_LOCATION,
    model_id: process.env.MODEL_ID,
  },
  gcs: {
    uploads_bucket: process.env.GCS_UPLOADS_BUCKET || 'insoai_assistant_uploads',
    transcription_bucket:
      process.env.GCS_TRANSCRIPTION_BUCKET || 'insoai_assistant_transcription',
    knowledge_bank_bucket:
      process.env.GCS_KNOWLEDGE_BANK_BUCKET || 'insoai_knowledge_bank_files',
    knowledgebot_bucket:
      process.env.GCS_KNOWLEDGEBOT_BUCKET ||
      'insoai_assistant_knowledge_bot_files',
    presentation_bucket:
      process.env.GCS_PRESENTATION_BUCKET || 'insoai_assistant_presentation',
    datasetStorageClass: process.env.GCS_DATASET_STORAGE_CLASS || 'ARCHIVE',
  },
  shelfHfRagIndexing: process.env.SHELF_HF_RAG_INDEXING === 'true',
  mail: {
    google_smtp_password: process.env.GOOGLE_SMTP_PASSWORD,
    google_smtp_user: process.env.GOOGLE_SMTP_USER,
    google_smtp_host: process.env.GOOGLE_SMTP_HOST,
    google_smtp_port: process.env.GOOGLE_SMTP_PORT,
  },
  gcp: {
    projectId: process.env.GCP_PROJECT_ID,
    project_id: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_LOCATION || 'us-central1',
    saKeyPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './insoai_gcp.json',
    pubsub: {
      subscriptionTopic:
        process.env.GCP_PUBSUB_SUBSCRIPTION_TOPIC ||
        'stripe-subscription-updates',
      stripe_webhook_topic:
        process.env.STRIPE_WEBHOOK_TOPIC || 'stripe-webhook-events',
    },
    tasks_queue: process.env.GCP_TASKS_QUEUE || 'stripe-tasks-queue',
    tasks_worker_url:
      process.env.GCP_TASKS_WORKER_URL ||
      'https://insoai-backend.onrender.com/api/v1/stripe/tasks-worker',
    tasks_service_account_email: process.env.GCP_TASKS_SERVICE_ACCOUNT_EMAIL,
  },
  privacy: {
    neverCollectData: true,
    neverTrainOnUserData: true,
    dataRetentionDays: 0,
  },
};
