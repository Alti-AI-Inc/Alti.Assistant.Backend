/**
 * @fileoverview Configuration constants for the article writer module.
 * This file defines various settings, types, tones, lengths, and system prompts
 * used throughout the article generation process.
 */

/**
 * @typedef {object} ArticleWriterConfig
 * @property {string} MODEL The AI model to use for article generation (e.g., 'gemini-2.5-flash').
 * @property {number} TEMPERATURE The creativity temperature for the AI model. Higher values (e.g., 0.8) lead to more creative and diverse outputs.
 * @property {number} MAX_OUTPUT_TOKENS The maximum number of tokens the AI model can generate in a single response.
 * @property {number} MAX_FILE_SIZE The maximum allowed size for uploaded files in bytes (e.g., 10MB).
 * @property {string[]} SUPPORTED_MIME_TYPES An array of MIME types for files that can be processed by the article writer.
 * @property {string[]} SUPPORTED_FILE_EXTENSIONS An array of file extensions for files that can be processed by the article writer.
 */

/**
 * Article Writer Configuration.
 * Defines parameters and settings for the article generation process,
 * including AI model specifics, file handling, and supported formats.
 * @type {ArticleWriterConfig}
 */
export const ARTICLE_WRITER_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  TEMPERATURE: 0.8, // Higher temperature for more creative writing
  MAX_OUTPUT_TOKENS: 16384,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
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
  ],
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
 * Each property represents a distinct article format or purpose.
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
 * These tones influence the style and vocabulary used in the generated content.
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
 * @property {string} SHORT Represents a short article length (e.g., 300-500 words).
 * @property {string} MEDIUM Represents a medium article length (e.g., 500-1000 words).
 * @property {string} LONG Represents a long article length (e.g., 1000-2000 words).
 * @property {string} COMPREHENSIVE Represents a comprehensive article length (e.g., 2000+ words).
 */

/**
 * Defines the available lengths for generated articles.
 * These lengths provide a general guideline for the AI's output verbosity.
 * @type {ArticleLengths}
 */
export const ARTICLE_LENGTHS = {
  SHORT: 'short', // 300-500 words
  MEDIUM: 'medium', // 500-1000 words
  LONG: 'long', // 1000-2000 words
  COMPREHENSIVE: 'comprehensive', // 2000+ words
};

/**
 * The category identifier for conversations related to the article writer module.
 * Used for organizing and retrieving conversation history.
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'article_writer';

/**
 * The AI model specifically used for managing the conversation flow within the article writer module.
 * This might be different from the model used for final article generation.
 * @type {string}
 */
export const CONVERSATION_MODEL = 'gemini-2.5-flash';

/**
 * @typedef {object} StorageConfig
 * @property {string} TEMP_FOLDER The path to the temporary folder where uploaded article files are stored.
 */

/**
 * Configuration for file storage within the article writer module.
 * Specifies paths for temporary file storage.
 * @type {StorageConfig}
 */
export const STORAGE_CONFIG = {
  TEMP_FOLDER: 'uploads/article_files',
};

/**
 * @typedef {object} SystemPrompts
 * @property {string} CONVERSATIONAL The initial system prompt for the AI, setting its persona as an expert article writer assistant.
 * @property {string} blog_post System prompt specifically for generating blog posts.
 * @property {string} news_article System prompt specifically for generating news articles.
 * @property {string} technical_article System prompt specifically for generating technical articles.
 * @property {string} opinion_piece System prompt specifically for generating opinion pieces.
 * @property {string} how_to_guide System prompt specifically for generating how-to guides.
 * @property {string} listicle System prompt specifically for generating listicles.
 * @property {string} case_study System prompt specifically for generating case studies.
 * @property {string} research_article System prompt specifically for generating research articles.
 * @property {string} general System prompt for general article generation when no specific type is chosen.
 */

/**
 * Collection of system prompts used to guide the AI model for different article types and overall interaction.
 * These prompts define the AI's role and specific instructions for generating various content formats.
 * @type {SystemPrompts}
 */
export const SYSTEM_PROMPTS = {
  CONVERSATIONAL: `You are an expert article writer AI assistant. You help users write high-quality, engaging articles based on their input. You can:
1. Write articles from scratch based on user descriptions
2. Expand on uploaded documents or text snippets into full articles
3. Adapt the tone, style, and length based on user preferences
4. Create different types of articles (blog posts, technical articles, guides, etc.)

When writing articles:
- Focus on clarity, engagement, and proper structure
- Use appropriate headings, subheadings, and paragraphs
- Ensure the content flows naturally and is well-organized
- Match the requested tone and style
- Include relevant examples and explanations when appropriate
- Return the article in plain text format

If a file is uploaded, extract its content and use it as the basis for the article.
If the user provides text directly, use that as your source material.
Always ask for clarification if the requirements are unclear.`,

  [ARTICLE_TYPES.BLOG_POST]: `Write an engaging blog post that is conversational, relatable, and captures the reader's attention. Use a friendly tone, include personal anecdotes or examples where appropriate, and structure it with an introduction, body paragraphs, and conclusion.`,

  [ARTICLE_TYPES.NEWS_ARTICLE]: `Write a news article that is factual, objective, and follows the inverted pyramid structure. Lead with the most important information, include relevant facts and quotes, and maintain a neutral, professional tone.`,

  [ARTICLE_TYPES.TECHNICAL_ARTICLE]: `Write a technical article that is clear, accurate, and informative. Use precise terminology, include code examples or technical details where relevant, break down complex concepts into understandable parts, and structure it logically.`,

  [ARTICLE_TYPES.OPINION_PIECE]: `Write an opinion piece that clearly presents a viewpoint with strong arguments and supporting evidence. Be persuasive but respectful, acknowledge counterarguments, and maintain a confident yet thoughtful tone.`,

  [ARTICLE_TYPES.HOW_TO_GUIDE]: `Write a how-to guide that provides clear, step-by-step instructions. Use numbered lists for steps, include helpful tips and warnings, anticipate common questions or problems, and use an instructional yet friendly tone.`,

  [ARTICLE_TYPES.LISTICLE]: `Write a listicle that presents information in an easy-to-scan, numbered or bulleted format. Make each point engaging and self-contained, use descriptive headings, and maintain a lively, accessible tone.`,

  [ARTICLE_TYPES.CASE_STUDY]: `Write a case study that tells a compelling story of a real-world example. Include background, challenges, solutions, and results. Use data and specific details to support the narrative.`,

  [ARTICLE_TYPES.RESEARCH_ARTICLE]: `Write a research article that is thorough, evidence-based, and academically rigorous. Include an abstract, methodology, findings, and conclusions. Cite sources appropriately and maintain a formal, objective tone.`,

  [ARTICLE_TYPES.GENERAL]: `Write a well-structured article that is clear, engaging, and appropriate for the subject matter. Adapt the tone and style to best suit the content and intended audience.`,
};

/**
 * @typedef {object} ResponseMessages
 * @property {string} SUCCESS Message indicating successful article generation.
 * @property {string} FILE_REQUIRED Message indicating that either a file or message content is mandatory.
 * @property {string} PROCESSING_ERROR Message for a general error during article request processing.
 * @property {string} FILE_UPLOAD_ERROR Message for errors encountered during file upload or processing.
 * @property {string} CONVERSATION_ERROR Message for errors related to managing the conversation.
 */

/**
 * Standardized response messages used by the article writer module.
 * These messages provide consistent feedback for various outcomes of an article generation request.
 * @type {ResponseMessages}
 */
export const RESPONSE_MESSAGES = {
  SUCCESS: 'Article generated successfully',
  FILE_REQUIRED: 'Either a file or message content is required',
  PROCESSING_ERROR: 'Error processing article request',
  FILE_UPLOAD_ERROR: 'Error uploading or processing file',
  CONVERSATION_ERROR: 'Error managing conversation',
};

/**
 * @typedef {object} DefaultParams
 * @property {string} articleType The default article type to use if not specified by the user.
 * @property {string} tone The default writing tone to use if not specified by the user.
 * @property {string} length The default article length to use if not specified by the user.
 */

/**
 * Default parameters for article generation.
 * These values are used when the user does not explicitly specify preferences for article type, tone, or length.
 * @type {DefaultParams}
 */
export const DEFAULT_PARAMS = {
  articleType: ARTICLE_TYPES.GENERAL,
  tone: WRITING_TONES.PROFESSIONAL,
  length: ARTICLE_LENGTHS.MEDIUM,
};