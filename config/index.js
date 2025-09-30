import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

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
    access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN,
    refresh_token: process.env.JWT_REFRESH_REFRESH_TOKEN,
    refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN,
  },
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
  mailgun: {
    mailgun_domain: process.env.MAILGUN_DOMAIN,
    mailgun_key: process.env.MAILGUN_KEY,
    mailgun_from: process.env.MAILGUN_FROM,
  },
  composio: {
    projectId: process.env.COMPOSIO_PROJECT_ID,
    clientId: process.env.COMPOSIO_CLIENT_ID,
    clientSecret: process.env.COMPOSIO_CLIENT_SECRET,
    apiKey: process.env.COMPOSIO_API_KEY,
    orgApiKey: process.env.COMPOSIO_ORG_API_KEY,
    gmailAuthConfigId: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
  },
  groq_api_key: process.env.GROQ_API_KEY,
  tavily_api_key: process.env.TAVILY_API_KEY,
  serper_api_key: process.env.SERPER_API_KEY,
  together_secret_key: process.env.TOGETHER_API_KEY,
  gemini_secret_key: process.env.GEMINI_API_KEY,
  deepseek_secret_key: process.env.DEEPSEEK_API_KEY,
  openai_secret_key: process.env.OPENAI_API_KEY,
  browser_use_secret_key: process.env.BROWSER_USE_SECRET_KEY,
  cyberdesk_api_key: process.env.CYBERDESK_API_KEY,
  stripe: {
    stripe_secret_key: process.env.STRIPE_SECRET_KEY,
    stripe_webhook_secret_key: process.env.STRIPE_WEBHOOK_SECRET,
  },
  openai: {
    openai_api_key: process.env.OPENAI_API_KEY,
  },
  anthropic: {
    anthropic_api_key: process.env.ANTHROPIC_API_KEY,
  },
  google: {
    google_application_credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    gcp_project_id: process.env.GCP_PROJECT_ID,
    gcp_location: process.env.GCP_LOCATION,
    vertex_ai_endpoint: process.env.VERTEX_AI_ENDPOINT,
    vertex_ai_region: process.env.VERTEX_AI_LOCATION,
    model_id: process.env.MODEL_ID,
  }
};
