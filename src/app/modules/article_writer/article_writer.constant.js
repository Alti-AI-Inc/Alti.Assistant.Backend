/**
 * @fileoverview Configuration constants for the article writer module.
 * This file defines various settings, types, tones, lengths, and system prompts
 * used throughout the article generation process.
 * It also includes base configurations for user-level limits and storage paths.
 */

/**
 * @typedef {object} ArticleWriterConfig
 * @property {string} MODEL The default AI model to use for article generation.
 * @property {number} TEMPERATURE The creativity temperature for the AI model. Higher values (e.g., 0.8) lead to more creative outputs.
 * @property {number} DEFAULT_MAX_OUTPUT_TOKENS The default maximum number of tokens the AI model can generate. This can be overridden by user tier limits.
 * @property {number} DEFAULT_MAX_FILE_SIZE The default maximum allowed file size in bytes. This can be overridden by user tier limits.
 * @property {number} DEFAULT_MAX_CONCURRENT_JOBS The default number of concurrent generation jobs allowed per user. This can be overridden by user tier limits.
 * @property {string[]} SUPPORTED_MIME_TYPES An array of supported MIME types for file uploads.
 * @property {string[]} SUPPORTED_FILE_EXTENSIONS An array of supported file extensions for file uploads.
 */

/**
 * Base Article Writer Configuration.
 * Defines default parameters and settings for the article generation process.
 * NOTE: Limits like tokens, file size, and concurrent jobs should be overridden by user-specific tier settings in the application logic.
 * @type {ArticleWriterConfig}
 */
export const ARTICLE_WRITER_CONFIG = {
  MODEL: 'gemini-3.5-flash',
  TEMPERATURE: 0.8, // Higher temperature for more creative writing
  DEFAULT_MAX_OUTPUT_TOKENS: 8192, // A safe default; Gemini 1.5 Flash supports much more, but this prevents runaway requests.
  DEFAULT_MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB default
  DEFAULT_MAX_CONCURRENT_JOBS: 1,
  SUPPORTED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
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
    '.md',
  ],
};

/**
 * Defines the user roles within the application hierarchy.
 * This is critical for authorization and applying role-based access control (RBAC).
 * @enum {string}
 */
export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin', // Platform owner, highest level of access.
  ADMIN: 'admin', // Workspace owner, manages users and billing for a workspace.
  MANAGER: 'manager', // Team lead, can view team usage and manage a subset of users.
  USER: 'user', // Standard user, creates content.
};

/**
 * @typedef {object} LimitConfig
 * @property {number} maxFileSize Maximum file size in bytes.
 * @property {number} maxOutputTokens Maximum output tokens for AI generation.
 * @property {number} maxConcurrentJobs Maximum number of concurrent jobs.
 */

/**
 * @typedef {object} PlatformLimits
 * @property {number} maxUsersPerWorkspace Default maximum users per workspace.
 * @property {number} maxTotalMonthlyTokens Default monthly token pool for a workspace.
 */

/**
 * @typedef {object} FeatureLimitsConfig
 * @property {LimitConfig & PlatformLimits} platform_defaults Default limits for the entire platform.
 * @property {Object<string, LimitConfig>} roles Base limits assigned to each user role.
 * @property {Object<string, LimitConfig>} tiers Subscription tier-based limits that override role defaults for applicable users.
 */

/**
 * Defines hierarchical limits for features based on roles and subscription tiers.
 * This structure is critical for ensuring that usage correctly maps to user entitlements
 * and respects the boundaries of their workspace and role.
 *
 * The application logic should resolve a user's final limits by:
 * 1. Starting with the base limits for their role (e.g., `limits.roles.user`).
 * 2. Overriding with their subscription tier limits if applicable (e.g., `limits.tiers.pro`).
 * 3. Ensuring their usage contributes to and is constrained by their workspace's aggregate limits
 *    (e.g., `maxTotalMonthlyTokens`), which are managed by the 'admin' role.
 * @type {FeatureLimitsConfig}
 */
export const FEATURE_LIMITS_CONFIG = {
  // Platform-level defaults, can be overridden by a super_admin in the platform settings.
  platform_defaults: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    maxOutputTokens: 8192,
    maxConcurrentJobs: 2,
    // Workspace-level aggregate limits (example defaults)
    maxUsersPerWorkspace: 50,
    maxTotalMonthlyTokens: 1000000,
  },
  // Role-based defaults. These define the base capabilities for each role.
  roles: {
    [USER_ROLES.USER]: {
      maxFileSize: 2 * 1024 * 1024, // 2MB
      maxOutputTokens: 2048,
      maxConcurrentJobs: 1,
    },
    [USER_ROLES.MANAGER]: {
      // Managers might have slightly higher personal limits for administrative tasks.
      // Their primary role is oversight, not necessarily higher generation limits.
      maxFileSize: 5 * 1024 * 1024, // 5MB
      maxOutputTokens: 4096,
      maxConcurrentJobs: 2,
    },
    [USER_ROLES.ADMIN]: { // Workspace Owner
      // Admins have high limits, reflecting their administrative role.
      // They also manage workspace-wide settings and billing.
      maxFileSize: 25 * 1024 * 1024, // 25MB
      maxOutputTokens: 16384,
      maxConcurrentJobs: 5,
    },
    [USER_ROLES.SUPER_ADMIN]: { // Platform Owner
      // Super admins typically have unrestricted or very high limits for testing and administration.
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxOutputTokens: 32768,
      maxConcurrentJobs: 10,
    },
  },
  // Subscription tiers that modify the base role limits for 'user' and 'manager' roles.
  // The application should apply the highest limit available from the user's role and tier.
  tiers: {
    free: {
      maxFileSize: 5 * 1024 * 1024, // 5MB
      maxOutputTokens: 4096,
      maxConcurrentJobs: 1,
    },
    pro: {
      maxFileSize: 20 * 1024 * 1024, // 20MB
      maxOutputTokens: 16384,
      maxConcurrentJobs: 3,
    },
    enterprise: {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxOutputTokens: 32768,
      maxConcurrentJobs: 5,
    },
  },
};

/**
 * @typedef {object} ArticleTypes
 * @property {string} BLOG_POST Represents a blog post article type.
 * @property {string} NEWS_ARTICLE Represents a news article type.
 * @property {string} TECHNICAL_ARTICLE Represents a technical article type.
 * @property {string} OPINION_PIECE Represents an opinion piece article type.
 * @property {string} HOW_TO_GUIDE Represents a how-to guide article type.
 * @property {string} LISTICLE Represents a listicle article type.
 * @property {string} CASE_STUDY Represents a case study article type.
 * @property {string} RESEARCH_ARTICLE Represents a research article type.
 * @property {string} GENERAL Represents a general article type, used when no specific type is chosen.
 */

/**
 * Defines the available types of articles that can be generated.
 * @type {ArticleTypes}
 */
export const ARTICLE_TYPES = {
  BLOG_POST: 'blog_post',
  NEWS_ARTICLE: 'news_article',
  TECHNICAL_ARTICLE: 'technical_article',
  OPINION_PIECE: 'opinion_piece',
  HOW_TO_GUIDE: 'how_to_guide',
  LISTICLE: 'listicle',
  CASE_STUDY: 'case_study',
  RESEARCH_ARTICLE: 'research_article',
  GENERAL: 'general',
};

/**
 * @typedef {object} WritingTones
 * @property {string} PROFESSIONAL Represents a professional writing tone.
 * @property {string} CASUAL Represents a casual writing tone.
 * @property {string} FORMAL Represents a formal writing tone.
 * @property {string} CONVERSATIONAL Represents a conversational writing tone.
 * @property {string} PERSUASIVE Represents a persuasive writing tone.
 * @property {string} INFORMATIVE Represents an informative writing tone.
 * @property {string} ENTERTAINING Represents an entertaining writing tone.
 * @property {string} ACADEMIC Represents an academic writing tone.
 */

/**
 * Defines the available writing tones for article generation.
 * @type {WritingTones}
 */
export const WRITING_TONES = {
  PROFESSIONAL: 'professional',
  CASUAL: 'casual',
  FORMAL: 'formal',
  CONVERSATIONAL: 'conversational',
  PERSUASIVE: 'persuasive',
  INFORMATIVE: 'informative',
  ENTERTAINING: 'entertaining',
  ACADEMIC: 'academic',
};

/**
 * @typedef {object} ArticleLengths
 * @property {string} SHORT Represents a short article length.
 * @property {string} MEDIUM Represents a medium article length.
 * @property {string} LONG Represents a long article length.
 * @property {string} COMPREHENSIVE Represents a comprehensive article length.
 */

/**
 * Defines the available lengths for generated articles.
 * @type {ArticleLengths}
 */
export const ARTICLE_LENGTHS = {
  SHORT: 'short',
  MEDIUM: 'medium',
  LONG: 'long',
  COMPREHENSIVE: 'comprehensive',
};

/**
 * Provides detailed descriptions for each article length to guide the AI.
 * @type {Object<string, string>}
 */
export const ARTICLE_LENGTH_DETAILS = {
  [ARTICLE_LENGTHS.SHORT]: 'approximately 300-500 words',
  [ARTICLE_LENGTHS.MEDIUM]: 'approximately 500-1000 words',
  [ARTICLE_LENGTHS.LONG]: 'approximately 1000-2000 words',
  [ARTICLE_LENGTHS.COMPREHENSIVE]: 'over 2000 words, providing in-depth coverage',
};

/**
 * The category identifier for conversations related to the article writer module.
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'article_writer';

/**
 * The AI model used for managing the conversation flow. Can be a faster, cheaper model.
 * @type {string}
 */
export const CONVERSATION_MODEL = 'gemini-3.5-flash';

/**
 * @typedef {object} StorageConfig
 * @property {string} BASE_UPLOAD_PATH The base path for temporary file uploads.
 */

/**
 * Configuration for file storage.
 * @type {StorageConfig}
 */
export const STORAGE_CONFIG = {
  // CRITICAL SECURITY WARNING: This is a base path. To ensure strict tenant data isolation,
  // the application logic MUST append a unique workspace/tenant identifier, followed by a user-specific
  // identifier to this path before saving files. Failure to do so will result in data leakage between workspaces.
  // Correct Example: `uploads/article_files/${workspaceId}/${userId}/`.
  BASE_UPLOAD_PATH: 'uploads/article_files',
};

/**
 * @typedef {object} SystemPrompts
 * @property {string} CONVERSATIONAL The initial system prompt for the AI assistant's persona.
 * @property {string} blog_post System prompt for generating blog posts.
 * @property {string} news_article System prompt for generating news articles.
 * @property {string} technical_article System prompt for generating technical articles.
 * @property {string} opinion_piece System prompt for generating opinion pieces.
 * @property {string} how_to_guide System prompt for generating how-to guides.
 * @property {string} listicle System prompt for generating listicles.
 * @property {string} case_study System prompt for generating case studies.
 * @property {string} research_article System prompt for generating research articles.
 * @property {string} general System prompt for general article generation.
 */

/**
 * Collection of system prompts to guide the AI model for different article types.
 * @type {SystemPrompts}
 */
export const SYSTEM_PROMPTS = {
  CONVERSATIONAL: `You are an expert article writer AI assistant. Your goal is to help users create high-quality, engaging articles. You can write from scratch, expand on uploaded documents, and adapt the tone, style, and length based on user preferences. Always be helpful and clear in your communication.`,

  [ARTICLE_TYPES.BLOG_POST]: `Write an engaging blog post that is conversational and relatable. Use a friendly tone, include personal anecdotes or examples where appropriate, and structure it with a clear introduction, body, and conclusion. Use headings and subheadings to improve readability.`,
  [ARTICLE_TYPES.NEWS_ARTICLE]: `Write a news article that is factual, objective, and follows the inverted pyramid structure. Lead with the most important information (the "leadin"), include relevant facts and quotes, and maintain a neutral, professional tone.`,
  [ARTICLE_TYPES.TECHNICAL_ARTICLE]: `Write a technical article that is clear, accurate, and informative. Use precise terminology, include formatted code examples or technical details where relevant, and break down complex concepts into understandable parts.`,
  [ARTICLE_TYPES.OPINION_PIECE]: `Write an opinion piece that clearly presents a viewpoint with strong arguments and supporting evidence. Be persuasive but respectful, acknowledge potential counterarguments, and maintain a confident yet thoughtful tone.`,
  [ARTICLE_TYPES.HOW_TO_GUIDE]: `Write a how-to guide with clear, step-by-step instructions. Use numbered lists for steps, include helpful tips and warnings, and use an instructional, encouraging tone.`,
  [ARTICLE_TYPES.LISTICLE]: `Write a listicle that presents information in an easy-to-scan, numbered or bulleted format. Make each point engaging and self-contained, use descriptive headings for each item, and maintain a lively, accessible tone.`,
  [ARTICLE_TYPES.CASE_STUDY]: `Write a case study that tells a compelling story of a real-world example. Structure it with: Background/Problem, Solution Implemented, and Results/Outcome. Use data and specific details to support the narrative.`,
  [ARTICLE_TYPES.RESEARCH_ARTICLE]: `Write a research article that is thorough, evidence-based, and academically rigorous. Include sections for an Abstract, Introduction, Methodology, Findings, and Conclusion. Maintain a formal, objective tone.`,
  [ARTICLE_TYPES.GENERAL]: `Write a well-structured article that is clear, engaging, and appropriate for the subject matter. Adapt the tone and style to best suit the content and intended audience.`,
};

/**
 * A template for constructing the final, detailed prompt for article generation.
 * This should be populated by the application logic with user-selected options.
 * @type {string}
 */
export const ARTICLE_GENERATION_PROMPT_TEMPLATE = `
Generate an article based on the following specifications.

**Primary Goal:** Create a high-quality, well-structured article ready for publication.
**Output Format:** The final article MUST be in Markdown format. Use headings (#, ##), lists (* or 1.), bold (**text**), italics (*text*), and code blocks (\`\`\`language\ncode\n\`\`\`) where appropriate to enhance readability and structure.

**Article Specifications:**
- **Article Type:** {{articleType}}
- **Instructions for this type:** {{articleTypeInstructions}}
- **Writing Tone:** {{tone}}
- **Target Length:** {{length}} ({{lengthDetails}})

**Source Material:**
Use the following content as the basis for the article. Extract key information, expand on the ideas, and structure it according to the specifications above.
---
{{sourceMaterial}}
---

Now, generate the complete article in Markdown format.
`;

/**
 * @typedef {object} ResponseMessages
 * @property {string} SUCCESS Message for successful article generation.
 * @property {string} INPUT_REQUIRED Message when neither a file nor text is provided.
 * @property {string} PROCESSING_ERROR Message for a general processing error.
 * @property {string} FILE_UPLOAD_ERROR Message for file upload or processing errors.
 * @property {string} CONVERSATION_ERROR Message for conversation management errors.
 * @property {string} FILE_LIMIT_EXCEEDED Message when the uploaded file is too large.
 * @property {string} INVALID_INPUT Message for invalid or missing request parameters.
 * @property {string} RATE_LIMIT_EXCEEDED Message when the user exceeds their allowed usage rate.
 * @property {string} WORKSPACE_LIMIT_EXCEEDED Message when the workspace has exceeded its aggregate usage limit.
 */

/**
 * Standardized API response messages.
 * @type {ResponseMessages}
 */
export const RESPONSE_MESSAGES = {
  SUCCESS: 'Article generated successfully',
  INPUT_REQUIRED: 'Either a file or message content is required to generate an article',
  PROCESSING_ERROR: 'An unexpected error occurred while processing your request',
  FILE_UPLOAD_ERROR: 'Error uploading or processing the provided file',
  CONVERSATION_ERROR: 'Error managing conversation state',
  FILE_LIMIT_EXCEEDED: 'File size exceeds the maximum allowed limit for your account',
  INVALID_INPUT: 'Invalid parameters provided. Please check the article type, tone, and length.',
  RATE_LIMIT_EXCEEDED: 'You have reached the maximum number of concurrent requests. Please wait for the current job to complete.',
  WORKSPACE_LIMIT_EXCEEDED: 'This action cannot be completed as the workspace has reached its usage limit.',
};

/**
 * @typedef {object} DefaultParams
 * @property {string} articleType The default article type.
 * @property {string} tone The default writing tone.
 * @property {string} length The default article length.
 */

/**
 * Default parameters for article generation, used when not specified by the user.
 * @type {DefaultParams}
 */
export const DEFAULT_PARAMS = {
  articleType: ARTICLE_TYPES.GENERAL,
  tone: WRITING_TONES.PROFESSIONAL,
  length: ARTICLE_LENGTHS.MEDIUM,
};