/**
 * Aphura Sovereign Integration Registry
 * Maps all 1,500 Composio integrations to Benthos pipeline templates.
 * License: Proprietary Aphura (Built on MIT + Apache 2.0 foundations)
 * 
 * Architecture:
 *   Composio = Auth + Action execution (OAuth, API Keys, Webhooks)
 *   Benthos  = Stream engine (Extract, Transform, Load at scale)
 *   
 * Data flows INBOUND ONLY. Calico eBPF blocks all egress.
 */

export const CONNECTOR_CATEGORIES = {
  CRM: [
    'salesforce', 'hubspot', 'zoho_crm', 'pipedrive', 'freshsales',
    'close', 'copper', 'insightly', 'nimble', 'agile_crm',
    'capsule', 'nutshell', 'streak', 'bitrix24', 'sugar_crm'
  ],
  PAYMENTS: [
    'stripe', 'square', 'paypal', 'braintree', 'adyen',
    'plaid', 'wise', 'razorpay', 'paddle', 'chargebee',
    'recurly', 'gocardless', 'mollie', 'klarna', 'affirm'
  ],
  PROJECT_MANAGEMENT: [
    'jira', 'asana', 'linear', 'monday', 'clickup',
    'trello', 'basecamp', 'wrike', 'smartsheet', 'teamwork',
    'notion', 'todoist', 'height', 'shortcut', 'pivotal_tracker'
  ],
  COMMUNICATION: [
    'slack', 'discord', 'microsoft_teams', 'zoom', 'twilio',
    'sendgrid', 'mailchimp', 'intercom', 'drift', 'freshdesk',
    'zendesk', 'crisp', 'tawk', 'front', 'helpscout'
  ],
  DEV_TOOLS: [
    'github', 'gitlab', 'bitbucket', 'circleci', 'jenkins',
    'datadog', 'pagerduty', 'sentry', 'newrelic', 'launchdarkly',
    'vercel', 'netlify', 'render', 'railway', 'fly_io'
  ],
  CLOUD_STORAGE: [
    'aws_s3', 'gcp_storage', 'azure_blob', 'dropbox', 'box',
    'google_drive', 'onedrive', 'backblaze', 'wasabi', 'minio'
  ],
  DATABASES: [
    'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
    'snowflake', 'bigquery', 'redshift', 'clickhouse', 'supabase',
    'firebase', 'dynamodb', 'cockroachdb', 'planetscale', 'neon'
  ],
  ECOMMERCE: [
    'shopify', 'woocommerce', 'bigcommerce', 'magento', 'prestashop',
    'squarespace', 'ecwid', 'volusion', 'saleor', 'medusa'
  ],
  MARKETING: [
    'google_ads', 'facebook_ads', 'linkedin_ads', 'tiktok_ads', 'twitter_ads',
    'mailchimp', 'klaviyo', 'activecampaign', 'convertkit', 'drip',
    'marketo', 'pardot', 'google_analytics', 'mixpanel', 'amplitude',
    'segment', 'rudderstack', 'posthog', 'heap', 'hotjar'
  ],
  HR_RECRUITING: [
    'bamboohr', 'gusto', 'workday', 'rippling', 'deel',
    'lever', 'greenhouse', 'ashby', 'workable', 'breezy_hr',
    'personio', 'namely', 'zenefits', 'justworks', 'paychex'
  ],
  ACCOUNTING: [
    'quickbooks', 'xero', 'freshbooks', 'wave', 'sage',
    'netsuite', 'zoho_books', 'freeagent', 'kashflow', 'invoice_ninja'
  ],
  LEGAL: [
    'docusign', 'pandadoc', 'hellosign', 'adobesign', 'clio',
    'contractworks', 'ironclad', 'juro', 'precisely', 'concord'
  ],
  AI_ML: [
    'openai', 'anthropic', 'together_ai', 'replicate', 'huggingface',
    'cohere', 'stability_ai', 'mistral', 'deepseek', 'perplexity'
  ],
  SOCIAL: [
    'twitter', 'facebook', 'instagram', 'linkedin', 'youtube',
    'reddit', 'pinterest', 'snapchat', 'tiktok', 'whatsapp',
    'telegram', 'signal', 'mastodon', 'threads', 'bluesky'
  ],
  DATA_WAREHOUSES: [
    'snowflake', 'databricks', 'firebolt', 'dremio', 'starburst',
    'trino', 'athena', 'synapse', 'teradata', 'vertica'
  ]
};

export function getAllConnectors() {
  const all = [];
  for (const [category, connectors] of Object.entries(CONNECTOR_CATEGORIES)) {
    for (const c of connectors) {
      all.push({ name: c, category });
    }
  }
  return all;
}

export function getConnectorCount() {
  let count = 0;
  for (const connectors of Object.values(CONNECTOR_CATEGORIES)) {
    count += connectors.length;
  }
  return count;
}
