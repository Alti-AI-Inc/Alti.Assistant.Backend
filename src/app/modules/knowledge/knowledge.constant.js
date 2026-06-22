// Knowledge Module Configuration
export const KNOWLEDGE_CONFIG = {
  MODEL: 'gemini-3.5-flash',
  COMPLEX_MODEL: 'gemini-2.5-pro', // For complex queries
  EMBEDDING_MODEL: 'text-embedding-004',
  TEMPERATURE: 0.2,
  MAX_OUTPUT_TOKENS: 8192,
  COMPLEXITY_THRESHOLD: 0.6, // Threshold for determining complexity
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  SUPPORTED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'text/csv',
    'application/json',
    'application/xml',
    'text/html',
    'text/markdown',
  ],
  SUPPORTED_FILE_EXTENSIONS: [
    '.pdf',
    '.docx',
    '.doc',
    '.txt',
    '.xlsx',
    '.xls',
    '.pptx',
    '.ppt',
    '.csv',
    '.json',
    '.xml',
    '.html',
    '.md',
  ],
  CHUNK_SIZE: 1000,
  CHUNK_OVERLAP: 200,
};

// Storage configuration
export const STORAGE_CONFIG = {
  GCS_BUCKET: 'alti_assistant_knowledge_bot_files',
  TEMP_FOLDER: 'uploads/knowledge',
  USER_FILES_PREFIX: 'users',
  BOT_FILES_PREFIX: 'bots',
};

// Asynchronous Processing Configuration (GCP Pub/Sub & Cloud Tasks)
// Configuration for offloading long-running tasks like file parsing, chunking, and embedding.
export const ASYNC_PROCESSING_CONFIG = {
  // GCP Project ID is required for both Pub/Sub and Cloud Tasks clients.
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,

  // Pub/Sub topic for triggering knowledge file processing when a file is uploaded.
  // This decouples the upload API from the processing workload, enabling stateless scaling.
  PUBSUB_TOPIC_FILE_PROCESS: process.env.PUBSUB_TOPIC_FILE_PROCESS || 'knowledge-file-processing',

  // Cloud Tasks queue for handling processing, especially for retries, scheduled jobs, or as an HTTP-based alternative to Pub/Sub.
  CLOUD_TASKS_QUEUE_FILE_PROCESS: process.env.CLOUD_TASKS_QUEUE_FILE_PROCESS || 'knowledge-processing-queue',
  CLOUD_TASKS_LOCATION: process.env.CLOUD_TASKS_LOCATION || 'us-central1',
};

// Owner types for unified knowledge system
export const OWNER_TYPES = {
  USER: 'user',
  BOT: 'bot',
};

// Processing status
export const PROCESSING_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

// RAG Database Configuration (AlloyDB / Cloud SQL PostgreSQL)
export const RAG_DATABASE_CONFIG = {
  // SECURITY FIX: Removed hardcoded fallback values for HOST, DATABASE, and USERNAME.
  // This prevents accidental connection to a production or shared database from a local/dev environment
  // and enforces proper configuration management through environment variables.
  HOST: process.env.ALLOYDB_HOST || process.env.RAG_DATABASE_HOST,
  PORT: parseInt(process.env.ALLOYDB_PORT || process.env.RAG_DATABASE_PORT || '5432'),
  DATABASE: process.env.ALLOYDB_DATABASE || process.env.RAG_DATABASE_NAME,
  USERNAME: process.env.ALLOYDB_USER || process.env.RAG_DATABASE_USER,
  // Passwords should always be sourced from environment variables for security.
  PASSWORD: process.env.ALLOYDB_PASSWORD || process.env.RAG_DATABASE_PASSWORD,
};

// Search types
export const SEARCH_TYPES = {
  SEMANTIC: 'semantic',
  KEYWORD: 'keyword',
  HYBRID: 'hybrid',
};

// Query modes
export const QUERY_MODES = {
  SIMPLE: 'simple', // Basic Q&A
  CONVERSATIONAL: 'conversational', // With context
  SUMMARIZE: 'summarize', // Document summary
  EXTRACT: 'extract', // Information extraction
};

// Complexity detection keywords (indicates complex queries)
export const COMPLEXITY_INDICATORS = {
  HIGH_COMPLEXITY_KEYWORDS: [
    'analyze',
    'compare',
    'contrast',
    'evaluate',
    'assess',
    'examine',
    'synthesize',
    'integrate',
    'relationship',
    'correlation',
    'implications',
    'comprehensive',
    'detailed analysis',
    'pros and cons',
    'advantages and disadvantages',
    'critical analysis',
    'in-depth',
    'complex',
    'multi-faceted',
    'nuanced',
    'strategic',
    'recommend',
    'recommendation',
    'strategy',
    'approach',
    'cross-reference',
    'conflicting',
    'inconsistencies',
    'patterns across',
  ],
  MEDIUM_COMPLEXITY_KEYWORDS: [
    'explain',
    'describe',
    'summarize',
    'outline',
    'discuss',
    'how does',
    'why',
    'what are the differences',
    'multiple',
  ],
  SIMPLE_KEYWORDS: [
    'what',
    'when',
    'where',
    'who',
    'list',
    'find',
    'show',
    'tell me',
  ],
};

// File visibility
export const FILE_VISIBILITY = {
  // INTEGRATION FIX: Revised visibility levels to align with the platform's multi-tenant and hierarchical structure.
  // The previous 'PUBLIC' level was ambiguous and posed a security risk by not respecting tenant boundaries.
  // These new levels allow for granular control that maps to user, manager, and admin roles.
  PRIVATE: 'private', // Accessible only by the owner (the user who uploaded it).
  SHARED: 'shared', // Accessible by the owner and specific users/teams it's explicitly shared with.
  WORKSPACE: 'workspace', // Accessible by all members within the same workspace/tenant.
};

// Folder colors
export const FOLDER_COLORS = [
  '#1890ff',
  '#52c41a',
  '#faad14',
  '#f5222d',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
  '#fa8c16',
];