// Knowledge Module Configuration
export const KNOWLEDGE_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  EMBEDDING_MODEL: 'text-embedding-004',
  TEMPERATURE: 0.2,
  MAX_OUTPUT_TOKENS: 8192,
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
    '.pdf', '.docx', '.doc', '.txt',
    '.xlsx', '.xls', '.pptx', '.ppt',
    '.csv', '.json', '.xml', '.html', '.md'
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

// RAG Database Configuration
export const RAG_DATABASE_CONFIG = {
  HOST: '34.135.175.69',
  PORT: 5432,
  DATABASE: 'rag_database',
  USERNAME: 'postgres',
  PASSWORD: 'Em0nd4r0ck@2',
};

// Search types
export const SEARCH_TYPES = {
  SEMANTIC: 'semantic',
  KEYWORD: 'keyword',
  HYBRID: 'hybrid',
};

// Query modes
export const QUERY_MODES = {
  SIMPLE: 'simple',           // Basic Q&A
  CONVERSATIONAL: 'conversational', // With context
  SUMMARIZE: 'summarize',     // Document summary
  EXTRACT: 'extract',         // Information extraction
};

// File visibility
export const FILE_VISIBILITY = {
  PRIVATE: 'private',   // Only owner
  SHARED: 'shared',     // Shared with specific users
  PUBLIC: 'public',     // Public access
};

// Folder colors
export const FOLDER_COLORS = [
  '#1890ff', '#52c41a', '#faad14', '#f5222d',
  '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16',
];
