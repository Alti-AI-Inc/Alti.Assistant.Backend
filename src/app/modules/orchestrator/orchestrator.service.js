import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { paymentController } from '../payment/payment.controller.js';
import { SwarmService } from '../swarm/swarm.service.js';
import Conversation from '../conversations/conversation.model.js'; // OPTIMIZATION: For efficient lookups, ensure 'conversationId' and 'userId' are indexed in the Conversation model. A compound index { conversationId: 1, userId: 1 } is highly recommended.
import crypto from 'crypto';

import { userMemoryService } from '../conversations/userMemory.service.js';
import { captureException } from '../../../shared/sentry.js';
import { withTenantFilter, withTenantContext } from '../../helpers/tenantQuery.js';
import { decryptConversation } from '../conversations/conversation.helpers.js';
import { conversationService } from '../conversations/conversation.service.js';


// ═══════════════════════════════════════════════════════════════════════════════
// MODEL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The name of the Google Gemini model used for prompt classification.
 * Reads from environment variables `GEMINI_CLASSIFIER_MODEL` or `GEMINI_MODEL`,
 * defaulting to a fast and efficient model if not set.
 * @constant
 * @type {string}
 */
const CLASSIFIER_MODEL = process.env.GEMINI_CLASSIFIER_MODEL || process.env.GEMINI_MODEL || config.gemini_model || 'gemini-3.5-flash';

/**
 * The Google Generative AI client instance, authenticated with the secret key.
 * @constant
 * @type {GoogleGenerativeAI}
 */
const client = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * The specific Gemini model instance configured for high-accuracy, deterministic classification.
 * It is configured with a very low temperature and forced JSON output to ensure reliable parsing.
 * @constant
 * @type {import('@google/generative-ai').GenerativeModel}
 */
const model = client.getGenerativeModel({
  model: CLASSIFIER_MODEL,
  generationConfig: {
    temperature: 0.1, // extremely low temp for high deterministic accuracy
    responseMimeType: "application/json",
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE REGISTRY — Single source of truth for all routable modules
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A registry of all available backend modules that can handle a user's prompt.
 * This object serves as the single source of truth for routing decisions.
 * Each key is a unique module name, and the value is an object containing:
 * - `description`: A brief explanation of the module's capability, used to build the LLM prompt.
 * - `dispatch`: The target service to which the request should be routed ('swarm' or 'composio').
 * - `requireSearch`: (Optional) A boolean indicating if the module inherently requires a web search.
 * @constant
 * @type {Object.<string, {description: string, dispatch: 'swarm' | 'composio', requireSearch?: boolean}>}
 */
const MODULE_REGISTRY = {
  general_chat:      { description: 'Standard conversational AI queries, greetings, opinions, explanations, Q&A', dispatch: 'swarm' },
  web_search:        { description: 'Queries requiring real-time internet data: news, prices, weather, scores, current events', dispatch: 'swarm', requireSearch: true },
  image_generation:  { description: 'Requests to create, generate, design, draw, or modify images, logos, art, illustrations', dispatch: 'swarm' },
  document_analysis: { description: 'Requests to summarize, analyze, extract from, or read uploaded files and documents', dispatch: 'swarm' },
  legal_contract:    { description: 'Drafting, reviewing, or analyzing legal contracts, NDAs, terms of service, legal agreements', dispatch: 'swarm' },
  code_generation:   { description: 'Writing, debugging, refactoring, or explaining code in any programming language', dispatch: 'swarm' },
  connected_apps:    { description: 'Actions on third-party apps: sending emails (Gmail), posting to Slack, creating GitHub/Jira issues, HubSpot contacts, calendar events, etc.', dispatch: 'composio' },
  deep_research:     { description: 'In-depth research requiring multiple searches, analysis, and synthesis of complex topics', dispatch: 'swarm', requireSearch: true },
  brainstorm:        { description: 'Brainstorming sessions, ideation, generating creative ideas, mind mapping, exploring possibilities', dispatch: 'swarm' },
  presentation:      { description: 'Creating slide decks, presentations, pitch decks, PowerPoint-style content', dispatch: 'swarm' },
  video:             { description: 'Video generation, editing, or video-related content creation requests', dispatch: 'swarm' },
  plan_generator:    { description: 'Project planning, creating roadmaps, timelines, action plans, strategic planning', dispatch: 'swarm' },
  translation:       { description: 'Translating text between languages', dispatch: 'swarm' },
  transcription:     { description: 'Transcribing audio or video content to text', dispatch: 'swarm' },
  creative_writing:  { description: 'Writing stories, poems, scripts, screenplays, song lyrics, creative fiction', dispatch: 'swarm' },
  article_writer:    { description: 'Writing blog posts, articles, essays, long-form content, SEO content', dispatch: 'swarm' },
  document_drafting: { description: 'Drafting formal documents: reports, proposals, memos, business letters, policies', dispatch: 'swarm' },
  document_review:   { description: 'Reviewing, editing, proofreading, or providing feedback on existing documents', dispatch: 'swarm' },
};

/**
 * An array of valid module names, derived from the keys of `MODULE_REGISTRY`.
 * Used for validating the output of the classification model.
 * @constant
 * @type {string[]}
 */
const VALID_MODULES = Object.keys(MODULE_REGISTRY);

// ═══════════════════════════════════════════════════════════════════════════════
// LLM SYSTEM PROMPT — Dynamically generated from registry
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The system prompt provided to the Gemini model for classification.
 * It is dynamically generated from the `MODULE_REGISTRY` to ensure the LLM
 * is always aware of the available modules, their descriptions, and the rules for classification.
 * It strictly enforces a JSON output format.
 * @constant
 * @type {string}
 */
const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Master Orchestrator (Synapse) for the Alti Assistant platform.
Your job is to analyze the user's prompt, classify it into one of the supported modules, judge its complexity, select the appropriate model tier and required data sources, and extract query parameters.

Supported Modules:
${VALID_MODULES.map((name, i) => `${i + 1}. "${name}" - ${MODULE_REGISTRY[name].description}`).join('\n')}

Classification Rules:
- If the user mentions a previous conversation topic, maintain continuity with the same module.
- "deep_research" is for complex multi-faceted questions requiring comprehensive investigation, NOT simple factual lookups.
- "web_search" is for queries needing real-time/current data. If unsure whether data is current, prefer "web_search".
- "connected_apps" is ONLY for actions on third-party services (Gmail, Slack, GitHub, Jira, etc.), NOT for general questions about those services.
- "brainstorm" is for open-ended ideation. "plan_generator" is for structured planning with deliverables.
- "creative_writing" is for fiction/poetry/scripts. "article_writer" is for non-fiction/blog content. "document_drafting" is for formal business documents.
- Default to "general_chat" if the intent is ambiguous or purely conversational.

Complexity & Model Tier Rules:
- "complexity" must be "simple" (greetings, simple factual questions, brief Q&A, basic computations) or "complex" (coding, writing formal documents, creative writing, detailed project planning, document summaries, deep analytical research).
- "model_tier" must be "fast" (greetings, basic Q&A, simple lookup tasks) or "pro" (coding, deep analysis, legal/contract reviews, multi-step generation). Generally, route "simple" complexity to "fast" tier and "complex" complexity to "pro" tier.

Data Source Rules:
- "data_sources" is an array containing:
  - "web_search" if the query requires real-time information or web-based grounding.
  - "knowledge_base" if the query requires parsing uploaded files or documents.
  - Keep the array empty [] if no external data sources are required.

You MUST respond strictly with valid JSON matching this schema:
{
  "target_module": "string (must be one of the exact module names above)",
  "confidence": number (0.0 to 1.0, how confident you are in the classification),
  "complexity": "string (simple or complex)",
  "model_tier": "string (fast or pro)",
  "data_sources": ["string (web_search, knowledge_base)"],
  "parameters": {
    "query": "The optimized or extracted search/generation query string",
    "require_search": boolean
  }
}
Do NOT wrap the JSON in markdown blocks. Return pure raw JSON string.`;

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL KEYWORD CLASSIFIER (Zero-dependency fallback)
// Uses word-boundary matching to reduce false positives.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A utility function to check if a text matches any of a given set of patterns.
 * @param {string} text The text to check.
 * @param {(string|RegExp)[]} patterns An array of strings or regular expressions to match against.
 * @returns {boolean} True if any pattern is found in the text, false otherwise.
 */
const matchesPattern = (text, patterns) => {
  return patterns.some(pat => {
    if (pat instanceof RegExp) return pat.test(text);
    return text.includes(pat);
  });
};

/**
 * A local, rule-based intent classifier that serves as a fallback if the primary LLM classifier fails.
 * It uses a series of keyword and regex matches to determine the most likely module.
 * The rules are ordered by specificity to reduce misclassification.
 * @param {string} prompt The user's input prompt.
 * @returns {{target_module: string, confidence: number, parameters: {query: string, require_search?: boolean}}} The classification result.
 */
const localClassifyIntentRaw = (prompt) => {
  const p = prompt.toLowerCase();

  // Connected apps / automations — highest specificity first
  if (matchesPattern(p, [
    'send email', 'send a message', 'send an email', 'post to slack',
    'create a ticket', 'create jira', 'github issue', 'hubspot',
    'connect my', 'link my', 'automate', 'schedule a meeting',
    'add to calendar', 'create a task in', 'push to',
  ])) {
    return { target_module: 'connected_apps', confidence: 0.85, parameters: { query: prompt } };
  }

  // Image generation — visual creation
  if (matchesPattern(p, [
    'generate an image', 'create an image', 'make a picture', 'generate image',
    'illustration of', 'design a logo', 'create art', /\b(draw|paint|sketch)\b.*\b(of|a|an|the|me)\b/,
    'image of', 'photo of', 'picture of', 'render a', 'visual of',
  ])) {
    return { target_module: 'image_generation', confidence: 0.9, parameters: { query: prompt } };
  }

  // Video generation
  if (matchesPattern(p, [
    'generate a video', 'create a video', 'make a video', 'video of',
    'animate', 'animation of', 'clip of',
  ])) {
    return { target_module: 'video', confidence: 0.85, parameters: { query: prompt } };
  }

  // Presentation/slides
  if (matchesPattern(p, [
    'create a presentation', 'make a presentation', 'slide deck', 'pitch deck',
    'powerpoint', 'slides about', 'presentation on', 'create slides',
  ])) {
    return { target_module: 'presentation', confidence: 0.9, parameters: { query: prompt } };
  }

  // Deep research
  if (matchesPattern(p, [
    'deep research', 'comprehensive research', 'in-depth analysis',
    'research report on', 'investigate thoroughly', 'deep dive into',
    'analyze extensively', 'detailed report on',
  ])) {
    return { target_module: 'deep_research', confidence: 0.85, parameters: { query: prompt, require_search: true } };
  }

  // Brainstorm
  if (matchesPattern(p, [
    'brainstorm', 'give me ideas', 'help me think of', 'ideation',
    'creative ideas for', 'what are some ideas', 'mind map',
    'come up with ideas', 'suggest ideas',
  ])) {
    return { target_module: 'brainstorm', confidence: 0.85, parameters: { query: prompt } };
  }

  // Plan generator
  if (matchesPattern(p, [
    'create a plan', 'project plan', 'roadmap', 'action plan',
    'strategic plan', 'timeline for', 'create a roadmap',
    'plan for', 'planning',
  ])) {
    return { target_module: 'plan_generator', confidence: 0.8, parameters: { query: prompt } };
  }

  // Translation
  if (matchesPattern(p, [
    'translate', 'translation', /\btranslate\b.*\bto\b/, 'in spanish',
    'in french', 'in german', 'in chinese', 'in japanese', 'in arabic',
    'in portuguese', 'in korean', 'in hindi',
  ])) {
    return { target_module: 'translation', confidence: 0.9, parameters: { query: prompt } };
  }

  // Transcription
  if (matchesPattern(p, [
    'transcribe', 'transcription', 'convert audio', 'convert video to text',
    'speech to text', 'audio to text',
  ])) {
    return { target_module: 'transcription', confidence: 0.9, parameters: { query: prompt } };
  }

  // Code generation — use word boundaries to avoid false matches
  if (matchesPattern(p, [
    'write code', 'write a function', /\bdebug\b/, 'fix this code',
    /\bimplement\b/, /\brefactor\b/, 'python script', /\bjavascript\b/,
    /\btypescript\b/, 'react component', 'api endpoint', /\balgorithm\b/,
    'code for', 'program that', 'write a script', 'code snippet',
  ])) {
    return { target_module: 'code_generation', confidence: 0.85, parameters: { query: prompt } };
  }

  // Creative writing
  if (matchesPattern(p, [
    'write a story', 'write a poem', 'write a script', 'write a song',
    'short story', 'creative writing', 'fiction about', 'screenplay',
    'write lyrics', 'haiku', 'sonnet',
  ])) {
    return { target_module: 'creative_writing', confidence: 0.85, parameters: { query: prompt } };
  }

  // Article writing
  if (matchesPattern(p, [
    'write an article', 'blog post', 'write a blog', 'seo content',
    'long-form content', 'write an essay', 'opinion piece',
  ])) {
    return { target_module: 'article_writer', confidence: 0.85, parameters: { query: prompt } };
  }

  // Document drafting
  if (matchesPattern(p, [
    'draft a report', 'draft a proposal', 'write a memo', 'business letter',
    'draft a document', 'write a policy', 'formal document',
  ])) {
    return { target_module: 'document_drafting', confidence: 0.8, parameters: { query: prompt } };
  }

  // Document review
  if (matchesPattern(p, [
    'review this document', 'proofread', 'edit this', 'provide feedback on',
    'review my writing', 'check this document',
  ])) {
    return { target_module: 'document_review', confidence: 0.8, parameters: { query: prompt } };
  }

  // Web search intent — queries needing real-time data
  if (matchesPattern(p, [
    'search for', 'look up', 'find information', 'what is the latest',
    'current price', 'news about', "today's", 'right now', 'real-time',
    'live score', 'weather in', 'stock price', 'how much does', 'who won',
    /\b(latest|current|today|tonight|yesterday|this week)\b/,
  ])) {
    return { target_module: 'web_search', confidence: 0.8, parameters: { query: prompt, require_search: true } };
  }

  // Legal / contract
  if (matchesPattern(p, [
    'draft a contract', 'review this contract', /\bnda\b/, 'terms of service',
    'legal agreement', 'liability clause', 'legal document', 'contract for',
  ])) {
    return { target_module: 'legal_contract', confidence: 0.85, parameters: { query: prompt } };
  }

  // Document analysis
  if (matchesPattern(p, [
    'summarize this document', 'analyze this file', 'extract from pdf',
    'read this document', 'what does this file say', 'summarize this pdf',
  ])) {
    return { target_module: 'document_analysis', confidence: 0.8, parameters: { query: prompt } };
  }

  // Default: general chat (safe default that always works)
  return { target_module: 'general_chat', confidence: 0.5, parameters: { query: prompt } };
};

const localClassifyIntent = (prompt) => {
  const result = localClassifyIntentRaw(prompt);
  const mapModuleToMetadata = (mod) => {
    switch (mod) {
      case 'image_generation':
      case 'video':
      case 'presentation':
      case 'plan_generator':
      case 'code_generation':
      case 'creative_writing':
      case 'article_writer':
      case 'document_drafting':
      case 'legal_contract':
      case 'connected_apps':
        return { complexity: 'complex', model_tier: 'pro', data_sources: [] };
      case 'deep_research':
        return { complexity: 'complex', model_tier: 'pro', data_sources: ['web_search'] };
      case 'document_analysis':
      case 'document_review':
        return { complexity: 'complex', model_tier: 'pro', data_sources: ['knowledge_base'] };
      case 'web_search':
        return { complexity: 'simple', model_tier: 'fast', data_sources: ['web_search'] };
      default:
        return { complexity: 'simple', model_tier: 'fast', data_sources: [] };
    }
  };
  const meta = mapModuleToMetadata(result.target_module);
  return {
    ...result,
    complexity: meta.complexity,
    model_tier: meta.model_tier,
    data_sources: meta.data_sources,
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CLASSIFICATION & DISPATCH ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The core orchestration function. It takes a user prompt, classifies its intent,
 * dispatches it to the appropriate backend module, persists the conversation,
 * and returns a structured response.
 *
 * @description
 * This function follows a multi-step process:
 * 1.  **Fast-Path**: Immediately handles common greetings and short queries.
 * 2.  **Context Loading**: Fetches recent messages from the conversation history to provide context to the classifier.
 * 3.  **Classification**: Attempts to classify the prompt using a powerful LLM (Gemini). If that fails, it uses a local, rule-based fallback classifier.
 * 4.  **Credit Check**: Performs a non-blocking check to increment the user's prompt usage count.
 * 5.  **Dispatch**: Routes the request to the determined module (e.g., `SwarmService` for generation/search, `aiClassificationService` for connected apps).
 * 6.  **Persistence**: Saves the user's prompt and the assistant's final response to the database.
 * 7.  **Memory Extraction**: Asynchronously triggers a service to extract and store key facts from the conversation.
 *
 * @multi-tenant
 * This service is multi-tenant. The `userId` parameter is crucial for scoping all
 * data operations, including fetching conversation history, checking credits, and
 * saving new messages, to the currently authenticated user.
 *
 * @param {string} prompt The user's input message.
 * @param {string} sessionId The session identifier for the user's connection.
 * @param {string} userId The unique identifier for the authenticated user.
 * @param {string} conversationId The unique identifier for the current conversation. Can be 'new-chat' for the first message.
 * @returns {Promise<object>} A promise that resolves to a structured response object.
 * @property {string|null} conversationId The ID of the conversation, which will be newly generated for the first message.
 * @property {string} orchestrator_decision The name of the module chosen to handle the prompt.
 * @property {object} extracted_parameters The parameters extracted from the prompt for the target module.
 * @property {string} original_prompt The user's original input prompt.
 * @property {string} reply The final, user-facing response from the assistant.
 * @property {object} responseMessage A structured message object.
 * @property {string} responseMessage.answer The final answer text.
 * @property {Array} responseMessage.reference An array for references (if any).
 * @property {object} classification Metadata about the classification process.
 * @property {string} classification.source The source of the classification decision ('fast-path', 'gemini', 'local-fallback', 'error').
 * @property {string} classification.model The model used for classification.
 * @property {number|null} classification.confidence The confidence score of the classification (0.0 to 1.0).
 * @property {number} classification.latency_ms The time taken for classification in milliseconds.
 * @property {number} total_time_ms The total processing time for the entire request in milliseconds.
 * @property {any} [executionResult] Optional result from connected app execution.
 * @property {Array} [toolResults] Optional tool results from connected app execution.
 * @property {Array} [webSearchQueries] Optional list of queries used for web search.
 * @property {Array} [relatedQuestions] Optional list of suggested follow-up questions.
 */
const classifyAndDispatch = async (prompt, sessionId, userId, conversationId, tenantId = null, category = null, req = null) => {
  const startTime = Date.now();
  let classificationSource = 'unknown';
  let classificationMs = 0;

  try {
    // ── 0. INPUT VALIDATION ──
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return {
        conversationId: conversationId || null,
        orchestrator_decision: 'general_chat',
        extracted_parameters: {},
        original_prompt: prompt || '',
        reply: "It looks like you sent an empty message. How can I help you today?",
        responseMessage: { answer: "It looks like you sent an empty message. How can I help you today?", reference: [] },
      };
    }

    // ── 1. LIGHTNING FAST PATH FOR GREETINGS & SIMPLE TIME/DATE QUERIES ──
    const cleanedPrompt = prompt.trim().toLowerCase().replace(/[?.!]/g, '');
    const commonGreetings = ['hi', 'hello', 'hey', 'yo', 'sup', 'hola', 'bonjour', 'howdy', 'greetings', 'help', 'who are you', 'how are you', 'what is this'];
    const timeQueries = [
      'what time is it', 'what is the time', 'whats the time', 'current time',
      'what day is it', 'what is the date', 'whats the date', 'what is todays date', 'what is today'
    ];
    const isShortQuery = cleanedPrompt.length <= 15;
    const isCommonGreeting = commonGreetings.includes(cleanedPrompt) || commonGreetings.some(greet => cleanedPrompt.startsWith(greet + ' ') || cleanedPrompt.endsWith(' ' + greet));
    const isTimeQuery = timeQueries.includes(cleanedPrompt);
    
    let intentPayload;
    if (isShortQuery || isCommonGreeting || isTimeQuery) {
      classificationSource = 'fast-path';
      classificationMs = Date.now() - startTime;
      // GCP Logging: Use structured JSON for logs.
      logger.info({ message: 'Fast-path classification triggered', component: 'Orchestrator', prompt, latency_ms: classificationMs });
      intentPayload = { 
        target_module: 'general_chat', 
        confidence: 1.0, 
        complexity: 'simple',
        model_tier: 'fast',
        data_sources: [],
        parameters: { query: prompt } 
      };
    } else {
      // ── 2. LOAD CONVERSATION CONTEXT ──
      let conversationContext = '';
      if (conversationId && conversationId !== 'new-chat') {
        try {
          // OPTIMIZATION: Use .lean() for read-only queries to return plain JavaScript objects, improving performance.
          // This query only fetches data for context and does not modify the Mongoose document.
          const query = { conversationId, userId };
          const conversation = await Conversation.findOne(
            tenantId ? { ...query, $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] } : query,
            { messages: { $slice: -6 } } // Last 3 exchanges (user+assistant each)
          ).lean();
          const decryptedConversation = decryptConversation(conversation);
          if (decryptedConversation?.messages?.length > 0) {
            conversationContext = '\n\nRecent conversation context:\n' +
              decryptedConversation.messages
                .map(m => `${m.role}: ${(m.content || '').substring(0, 200)}`)
                .join('\n');
          }
        } catch (ctxErr) {
          // GCP Logging: Use structured JSON for logs.
          logger.warn({ message: 'Failed to load conversation context', component: 'Orchestrator', error: { message: ctxErr.message, stack: ctxErr.stack } });
        }
      }

      // ── 3. LLM CLASSIFICATION (Gemini → Local fallback) ──
      // GCP Logging: Use structured JSON for logs.
      logger.info({ message: 'Classifying prompt', component: 'Orchestrator', userId, model: CLASSIFIER_MODEL });
      const classifyStart = Date.now();
      let rawJson = '{}';

      // Try Gemini first
      try {
        const classificationPrompt = conversationContext
          ? `${conversationContext}\n\nNew user message to classify:\n${prompt}`
          : prompt;

        const classificationResult = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: classificationPrompt }] }],
          systemInstruction: { role: "system", parts: [{ text: ORCHESTRATOR_SYSTEM_PROMPT }] }
        });
        rawJson = classificationResult?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        classificationSource = 'gemini';
        // GCP Logging: Use structured JSON for logs.
        logger.info({ message: 'Gemini classification successful', component: 'Orchestrator', latency_ms: Date.now() - classifyStart });
      } catch (geminiErr) {
        // GCP Logging: Use structured JSON for logs.
        logger.warn({ message: 'Gemini classification failed, defaulting to local classifier', component: 'Orchestrator', error: { message: geminiErr.message, stack: geminiErr.stack } });
        captureException(geminiErr, { stage: 'orchestrator-gemini', model: CLASSIFIER_MODEL });
        rawJson = '{}';
      }

      // Clean markdown blocks if LLM ignored instructions
      rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        intentPayload = JSON.parse(rawJson);

        // Validate target_module against allowed enum
        if (!intentPayload.target_module || !VALID_MODULES.includes(intentPayload.target_module)) {
          // GCP Logging: Use structured JSON for logs.
          logger.warn({ message: 'LLM returned invalid module, falling back to local', component: 'Orchestrator', invalidModule: intentPayload.target_module });
          throw new Error(`Invalid target_module: ${intentPayload.target_module}`);
        }

        if (classificationSource === 'unknown') classificationSource = 'llm';
      } catch (e) {
        // LLM classification unavailable or returned invalid module — use local fallback
        logger.warn({ message: 'LLM returned invalid module, falling back to local', component: 'Orchestrator', error: { message: e.message } });
        classificationSource = 'local-fallback';
        intentPayload = localClassifyIntent(prompt);
        // GCP Logging: Use structured JSON for logs.
        logger.info({ message: 'Using local fallback for classification', component: 'Orchestrator', targetModule: intentPayload.target_module, confidence: intentPayload.confidence });
      }

      classificationMs = Date.now() - classifyStart;
    }

    const { target_module, parameters, confidence } = intentPayload;
    const complexity = intentPayload.complexity || 'simple';
    const model_tier = intentPayload.model_tier || 'fast';
    const data_sources = intentPayload.data_sources || [];

    const dispatchConfig = MODULE_REGISTRY[target_module] || MODULE_REGISTRY.general_chat;

    // Determine the target model name based on model_tier
    const targetModel = model_tier === 'pro' 
      ? (config.gemini_pro_model || 'gemini-2.5-pro') 
      : (config.gemini_model || 'gemini-3.5-flash');

    // Decide if search/grounding is required
    const requireSearch = !!parameters?.require_search || !!dispatchConfig.requireSearch || data_sources.includes('web_search');

    // GCP Logging: Use structured JSON for logs.
    logger.info({ message: 'Classification decision made', component: 'Orchestrator', targetModule: target_module, source: classificationSource, latency_ms: classificationMs, confidence: confidence || null, complexity, model_tier, data_sources });

    // ── 4. CHECK CREDITS (fire-and-forget — truly non-blocking) ──
    if (userId) {
      paymentController.incrementPromptsUsed(userId).catch(paymentErr => {
        // GCP Logging: Use structured JSON for logs.
        logger.warn({ message: 'Payment check failed', component: 'Orchestrator', error: { message: paymentErr.message, stack: paymentErr.stack } });
      });
    }

    // ── 5. DISPATCH TO CORRECT MODULE ──
    let finalResponse;

    try {
      if (dispatchConfig.dispatch === 'composio') {
        // Connected apps path — Composio has been removed, fall back to Swarm
        logger.info({ message: 'Dispatching to connected apps, but Composio is disabled. Falling back to Swarm.', component: 'Orchestrator', prompt_snippet: `${prompt.substring(0, 60)}...` });
        finalResponse = await SwarmService.executeSwarmSync(prompt, [], userId, { model: targetModel });
      } else {
        // Swarm path — for all other modules
        finalResponse = await SwarmService.executeSwarmSync(
          parameters?.query || prompt,
          [],
          userId,
          { 
            model: targetModel,
            requireSearch: requireSearch
          }
        );
      }
    } catch (dispatchErr) {
      // GCP Logging: Use structured JSON for logs.
      logger.error({ message: 'Dispatch failed', component: 'Orchestrator', targetModule: target_module, error: { message: dispatchErr.message, stack: dispatchErr.stack } });
      captureException(dispatchErr, { stage: 'orchestrator-dispatch', target_module });
      finalResponse = {
        reply: `I'm currently experiencing a temporary issue connecting to my AI backend services. This typically resolves itself within a few minutes.\n\n**What you can try:**\n• Send your message again in a moment\n• Refresh the page and retry\n\nIf this persists, please contact support.`,
        reference: [],
        citations: [],
        relatedQuestions: [],
      };
    }

    // ── 6. PERSIST CHAT TO DATABASE ──
    let finalConversationId = conversationId;
    try {
      if (userId) {
        let conversation;
        let conversationExists = false;
        if (finalConversationId && finalConversationId !== 'new-chat') {
          // This findOne is for updating an existing document, so .lean() should NOT be used here.
          const query = { conversationId: finalConversationId, userId };
          conversation = await Conversation.findOne(
            tenantId ? { ...query, $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] } : query
          );
          if (conversation) {
            conversationExists = true;
          }
        }

        const mapTargetModuleToCategory = (targetModule) => {
          switch (targetModule) {
            case 'image_generation':
              return 'image_generation';
            case 'video':
              return 'video';
            case 'code_generation':
              return 'code';
            case 'connected_apps':
              return 'composio';
            case 'document_analysis':
              return 'document_analysis';
            case 'legal_contract':
              return 'legal_contract';
            case 'brainstorm':
              return 'brainstorm';
            case 'presentation':
              return 'presentation';
            case 'plan_generator':
              return 'plan_generation';
            case 'translation':
              return 'translation';
            case 'transcription':
              return 'composio';
            case 'creative_writing':
              return 'creative_writing';
            case 'article_writer':
              return 'article_writer';
            case 'document_drafting':
              return 'document_drafting';
            case 'document_review':
              return 'document_review';
            default:
              return 'search';
          }
        };

        const resolvedCategory = category
          ? category
          : mapTargetModuleToCategory(target_module);
        
        const assistantMetadata = {
          reference: [],
          webSearchQueries: finalResponse.webSearchQueries || [],
          searchEntryPoint: finalResponse.searchEntryPoint || null,
          relatedQuestions: finalResponse.relatedQuestions || [],
          model: finalResponse.model || CLASSIFIER_MODEL,
          financialTicker: finalResponse.financialTicker || null,
          domain: finalResponse.domain || null,
          homeTeam: finalResponse.homeTeam || null,
          address: finalResponse.address || null,
          cveId: finalResponse.cveId || null,
          brainstormData: finalResponse.brainstormData || null,
          ideaAnalysis: finalResponse.ideaAnalysis || null,
          planData: finalResponse.planData || null,
          planAnalysis: finalResponse.planAnalysis || null,
          planBrainstorm: finalResponse.planBrainstorm || null,
          video: finalResponse.video || null,
          document: finalResponse.document || null,
          classificationSource,
          classificationMs,
        };

        if (conversationExists && conversation) {
          conversation.addMessage('user', prompt);
          conversation.addMessage('assistant', finalResponse.reply, assistantMetadata);
          
          if (!conversation.metadata) {
            conversation.metadata = {};
          }
          if (!conversation.metadata.category) {
            conversation.metadata.category = resolvedCategory;
            if (typeof conversation.markModified === 'function') {
              conversation.markModified('metadata');
            }
          }
          
          await conversation.save();
        } else {
          if (!finalConversationId || finalConversationId === 'new-chat') {
            finalConversationId = crypto.randomUUID();
          }
          let formattedPrefix = '';
          if (resolvedCategory === 'search') formattedPrefix = 'Search: ';
          else if (resolvedCategory === 'code') formattedPrefix = 'Code: ';
          else if (resolvedCategory === 'image') formattedPrefix = 'Image: ';
          else if (resolvedCategory === 'deep_research') formattedPrefix = 'Deep Research: ';
          
          const cleanTitle = prompt.length > 40 ? `${prompt.substring(0, 40)}...` : prompt;
          const finalTitle = `${formattedPrefix}${cleanTitle}`;

          const createdConvData = await conversationService.createConversation({
            userId,
            title: finalTitle,
            metadata: { category: resolvedCategory },
            is_deep_search: false,
            initialMessage: { role: 'user', content: prompt }
          }, finalConversationId, req);

          // createConversation returns a POJO, so we need to fetch the document to add the assistant message
          conversation = await Conversation.findOne({ conversationId: finalConversationId });
          if (conversation) {
            conversation.addMessage('assistant', finalResponse.reply, assistantMetadata);
            await conversation.save();
          }
        }
      }
    } catch (dbErr) {
      // GCP Logging: Use structured JSON for logs.
      logger.error({ message: 'Failed to persist chat history', component: 'Orchestrator', error: { message: dbErr.message, stack: dbErr.stack } });
      // Do not crash the entire response if database save fails
    }

    // ── 7. ASYNC MEMORY EXTRACTION ──
    if (userId && finalResponse.reply) {
      userMemoryService.asyncExtractFacts(userId, prompt, finalResponse.reply);
    }

    // ── 8. RETURN STRUCTURED RESPONSE ──
    const totalMs = Date.now() - startTime;
    return {
      conversationId: finalConversationId || null,
      orchestrator_decision: target_module,
      extracted_parameters: parameters,
      original_prompt: prompt,
      reply: finalResponse.reply,
      responseMessage: { 
        answer: finalResponse.reply,
        reference: []
      },
      classification: {
        source: classificationSource,
        model: classificationSource === 'gemini' ? CLASSIFIER_MODEL : classificationSource,
        confidence: confidence || null,
        latency_ms: classificationMs,
        complexity,
        model_tier,
        data_sources,
      },
      total_time_ms: totalMs,
      ...finalResponse
    };
  } catch (err) {
    // Safety net — should be effectively unreachable
    // GCP Logging: Use structured JSON for logs.
    logger.error({ message: 'Unexpected top-level error (safety net)', component: 'Orchestrator', error: { message: err.message, stack: err.stack } });
    captureException(err, { stage: 'orchestrator-top-level', prompt: prompt?.substring(0, 100) });

    const safeResponse = `I received your message but encountered an unexpected issue. Please try again — I'm here to help!`;

    return {
      conversationId: (!conversationId || conversationId === 'new-chat') ? crypto.randomUUID() : conversationId,
      orchestrator_decision: 'general_chat',
      extracted_parameters: {},
      original_prompt: prompt,
      reply: safeResponse,
      responseMessage: { answer: safeResponse, reference: [] },
      classification: {
        source: 'error',
        latency_ms: Date.now() - startTime,
      },
    };
  }
};

/**
 * Executes a collaborative multi-agent execution pipeline streaming SSE chunks to the client.
 */
const classifyAndDispatchStream = async (prompt, sessionId, userId, conversationId, tenantId = null, category = null, req = null, res) => {
  const startTime = Date.now();
  let classificationSource = 'unknown';
  let classificationMs = 0;

  try {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      const reply = "It looks like you sent an empty message. How can I help you today?";
      res.write(`data: ${JSON.stringify({ type: 'text', content: reply })}\n\n`);
      res.end();
      return;
    }

    // ── 1. LIGHTNING FAST PATH FOR GREETINGS & SIMPLE TIME/DATE QUERIES ──
    const cleanedPrompt = prompt.trim().toLowerCase().replace(/[?.!]/g, '');
    const commonGreetings = ['hi', 'hello', 'hey', 'yo', 'sup', 'hola', 'bonjour', 'howdy', 'greetings', 'help', 'who are you', 'how are you', 'what is this'];
    const timeQueries = [
      'what time is it', 'what is the time', 'whats the time', 'current time',
      'what day is it', 'what is the date', 'whats the date', 'what is todays date', 'what is today'
    ];
    const isShortQuery = cleanedPrompt.length <= 15;
    const isCommonGreeting = commonGreetings.includes(cleanedPrompt) || commonGreetings.some(greet => cleanedPrompt.startsWith(greet + ' ') || cleanedPrompt.endsWith(' ' + greet));
    const isTimeQuery = timeQueries.includes(cleanedPrompt);
    
    let intentPayload;
    if (isShortQuery || isCommonGreeting || isTimeQuery) {
      classificationSource = 'fast-path';
      classificationMs = Date.now() - startTime;
      logger.info({ message: 'Fast-path classification triggered (Stream)', component: 'Orchestrator', prompt, latency_ms: classificationMs });
      intentPayload = { 
        target_module: 'general_chat', 
        confidence: 1.0, 
        complexity: 'simple',
        model_tier: 'fast',
        data_sources: [],
        parameters: { query: prompt } 
      };
    } else {
      // ── 2. LOAD CONVERSATION CONTEXT ──
      let conversationContext = '';
      if (conversationId && conversationId !== 'new-chat') {
        try {
          const query = { conversationId, userId };
          const conversation = await Conversation.findOne(
            tenantId ? { ...query, $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] } : query,
            { messages: { $slice: -6 } }
          ).lean();
          const decryptedConversation = decryptConversation(conversation);
          if (decryptedConversation?.messages?.length > 0) {
            conversationContext = '\n\nRecent conversation context:\n' +
              decryptedConversation.messages
                .map(m => `${m.role}: ${(m.content || '').substring(0, 200)}`)
                .join('\n');
          }
        } catch (ctxErr) {
          logger.warn({ message: 'Failed to load conversation context (Stream)', component: 'Orchestrator', error: { message: ctxErr.message } });
        }
      }

      // ── 3. LLM CLASSIFICATION ──
      logger.info({ message: 'Classifying prompt (Stream)', component: 'Orchestrator', userId, model: CLASSIFIER_MODEL });
      const classifyStart = Date.now();
      let rawJson = '{}';

      try {
        const classificationPrompt = conversationContext
          ? `${conversationContext}\n\nNew user message to classify:\n${prompt}`
          : prompt;

        const classificationResult = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: classificationPrompt }] }],
          systemInstruction: { role: "system", parts: [{ text: ORCHESTRATOR_SYSTEM_PROMPT }] }
        });
        rawJson = classificationResult?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        classificationSource = 'gemini';
      } catch (geminiErr) {
        logger.warn({ message: 'Gemini classification failed (Stream), defaulting to local classifier', component: 'Orchestrator', error: { message: geminiErr.message } });
        rawJson = '{}';
      }

      rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        intentPayload = JSON.parse(rawJson);
        if (!intentPayload.target_module || !VALID_MODULES.includes(intentPayload.target_module)) {
          throw new Error(`Invalid target_module: ${intentPayload.target_module}`);
        }
      } catch (e) {
        classificationSource = 'local-fallback';
        intentPayload = localClassifyIntent(prompt);
      }
      classificationMs = Date.now() - classifyStart;
    }

    const { target_module, parameters, confidence } = intentPayload;
    const complexity = intentPayload.complexity || 'simple';
    const model_tier = intentPayload.model_tier || 'fast';
    const data_sources = intentPayload.data_sources || [];
    const dispatchConfig = MODULE_REGISTRY[target_module] || MODULE_REGISTRY.general_chat;
    const targetModel = model_tier === 'pro' 
      ? (config.gemini_pro_model || 'gemini-2.5-pro') 
      : (config.gemini_model || 'gemini-3.5-flash');

    const requireSearch = !!parameters?.require_search || !!dispatchConfig.requireSearch || data_sources.includes('web_search');

    logger.info({ message: 'Classification decision made (Stream)', component: 'Orchestrator', targetModule: target_module, source: classificationSource, latency_ms: classificationMs });

    // ── 4. CHECK CREDITS (non-blocking) ──
    if (userId) {
      paymentController.incrementPromptsUsed(userId).catch(paymentErr => {
        logger.warn({ message: 'Payment check failed (Stream)', component: 'Orchestrator', error: { message: paymentErr.message } });
      });
    }

    // ── 5. PERSIST INITIAL CONVERSATION TO DB IF NEW CHAT ──
    let finalConversationId = conversationId;
    let resolvedCategory = category || 'search';
    if (target_module) {
      const mapTargetModuleToCategory = (mod) => {
        switch (mod) {
          case 'image_generation': return 'image_generation';
          case 'video': return 'video';
          case 'code_generation': return 'code';
          case 'document_analysis': return 'document_analysis';
          case 'legal_contract': return 'legal_contract';
          case 'brainstorm': return 'brainstorm';
          case 'presentation': return 'presentation';
          case 'plan_generator': return 'plan_generation';
          case 'translation': return 'translation';
          case 'creative_writing': return 'creative_writing';
          case 'article_writer': return 'article_writer';
          case 'document_drafting': return 'document_drafting';
          case 'document_review': return 'document_review';
          default: return 'search';
        }
      };
      resolvedCategory = category || mapTargetModuleToCategory(target_module);
    }

    let conversationExists = false;
    if (userId && finalConversationId && finalConversationId !== 'new-chat') {
      const query = { conversationId: finalConversationId, userId };
      const conversation = await Conversation.findOne(
        tenantId ? { ...query, $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] } : query
      );
      if (conversation) {
        conversationExists = true;
        conversation.addMessage('user', prompt);
        await conversation.save();
      }
    }

    if (userId && (!conversationExists)) {
      if (!finalConversationId || finalConversationId === 'new-chat') {
        finalConversationId = crypto.randomUUID();
      }
      let formattedPrefix = '';
      if (resolvedCategory === 'search') formattedPrefix = 'Search: ';
      else if (resolvedCategory === 'code') formattedPrefix = 'Code: ';
      else if (resolvedCategory === 'image') formattedPrefix = 'Image: ';
      else if (resolvedCategory === 'deep_research') formattedPrefix = 'Deep Research: ';
      
      const cleanTitle = prompt.length > 40 ? `${prompt.substring(0, 40)}...` : prompt;
      const finalTitle = `${formattedPrefix}${cleanTitle}`;

      await conversationService.createConversation({
        userId,
        title: finalTitle,
        metadata: { category: resolvedCategory },
        is_deep_search: false,
        initialMessage: { role: 'user', content: prompt }
      }, finalConversationId, req);
    }

    // Send initial connected event
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      conversationId: finalConversationId,
      timestamp: Date.now()
    })}\n\n`);

    // Get conversation history for streaming context
    let conversationHistory = [];
    if (finalConversationId && finalConversationId !== 'new-chat') {
      try {
        const query = { conversationId: finalConversationId, userId };
        const conversationDoc = await Conversation.findOne(
          tenantId ? { ...query, $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] } : query,
          { messages: { $slice: -6 } }
        ).lean();
        const decryptedDoc = decryptConversation(conversationDoc);
        if (decryptedDoc?.messages?.length > 0) {
          let messagesToUse = decryptedDoc.messages;
          const lastMsg = messagesToUse[messagesToUse.length - 1];
          if (lastMsg && lastMsg.role === 'user' && lastMsg.content === prompt) {
            messagesToUse = messagesToUse.slice(0, -1);
          }
          conversationHistory = messagesToUse.map(m => ({
            role: m.role,
            content: m.content
          }));
        }
      } catch (histErr) {
        logger.warn({ message: 'Failed to load history for streaming context', component: 'Orchestrator', error: histErr.message });
      }
    }

    // ── 6. DISPATCH STREAM ──
    let fullText = '';
    let finalReferences = [];
    let finalCitations = [];

    const streamOptions = {
      model: targetModel,
      requireSearch: requireSearch
    };

    try {
      for await (const chunk of SwarmService.executeSwarmStream(
        parameters?.query || prompt,
        conversationHistory,
        userId,
        streamOptions
      )) {
        if (chunk.type === 'text') {
          fullText += chunk.content;
          res.write(`data: ${JSON.stringify({
            type: 'text',
            content: chunk.content,
            timestamp: Date.now()
          })}\n\n`);
        } else if (chunk.type === 'metadata') {
          finalReferences = chunk.reference || [];
          finalCitations = chunk.citations || [];
          res.write(`data: ${JSON.stringify({
            type: 'metadata',
            reference: finalReferences,
            citations: finalCitations,
            timestamp: chunk.timestamp
          })}\n\n`);
        }
      }
    } catch (streamErr) {
      logger.error({ message: 'Orchestrator streaming dispatch failed', component: 'Orchestrator', error: streamErr.message });
      const errorReply = `\n\nI encountered a temporary issue generating the response. Please try sending your message again.`;
      fullText += errorReply;
      res.write(`data: ${JSON.stringify({ type: 'text', content: errorReply })}\n\n`);
    }

    // ── 7. PERSIST ASSISTANT REPLY TO DATABASE ──
    try {
      if (userId && finalConversationId) {
        const conversation = await Conversation.findOne({ conversationId: finalConversationId, userId });
        if (conversation) {
          const assistantMetadata = {
            reference: finalReferences,
            citations: finalCitations,
            model: targetModel,
            classificationSource,
            classificationMs,
            streamingMode: true,
          };
          conversation.addMessage('assistant', fullText, assistantMetadata);
          await conversation.save();
        }
      }
    } catch (dbErr) {
      logger.error({ message: 'Failed to persist streaming assistant response', component: 'Orchestrator', error: dbErr.message });
    }

    // ── 8. ASYNC MEMORY EXTRACTION ──
    if (userId && fullText) {
      userMemoryService.asyncExtractFacts(userId, prompt, fullText);
    }

    res.end();
  } catch (err) {
    logger.error({ message: 'Unexpected streaming error', component: 'Orchestrator', error: err.message });
    const safeResponse = `I received your message but encountered an unexpected issue. Please try again.`;
    res.write(`data: ${JSON.stringify({ type: 'text', content: safeResponse })}\n\n`);
    res.end();
  }
};

/**
 * The Orchestrator Service, responsible for classifying user prompts and dispatching
 * them to the appropriate backend modules for processing.
 * @exports orchestratorService
 */
export const orchestratorService = {
  classifyAndDispatch,
  classifyAndDispatchStream,
};