// Article Writer Configuration
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

// Article types
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

// Writing tones
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

// Article lengths
export const ARTICLE_LENGTHS = {
  SHORT: 'short', // 300-500 words
  MEDIUM: 'medium', // 500-1000 words
  LONG: 'long', // 1000-2000 words
  COMPREHENSIVE: 'comprehensive', // 2000+ words
};

// Conversation configuration
export const CONVERSATION_CATEGORY = 'article_writer';
export const CONVERSATION_MODEL = 'gemini-2.5-flash';

// Storage configuration
export const STORAGE_CONFIG = {
  TEMP_FOLDER: 'uploads/article_files',
};

// System prompts for article writing
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

// Response messages
export const RESPONSE_MESSAGES = {
  SUCCESS: 'Article generated successfully',
  FILE_REQUIRED: 'Either a file or message content is required',
  PROCESSING_ERROR: 'Error processing article request',
  FILE_UPLOAD_ERROR: 'Error uploading or processing file',
  CONVERSATION_ERROR: 'Error managing conversation',
};

// Default parameters
export const DEFAULT_PARAMS = {
  articleType: ARTICLE_TYPES.GENERAL,
  tone: WRITING_TONES.PROFESSIONAL,
  length: ARTICLE_LENGTHS.MEDIUM,
};
