import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { paymentController } from '../payment/payment.controller.js';
import { SwarmService } from '../swarm/swarm.service.js';
import Conversation from '../conversations/conversation.model.js';
import crypto from 'crypto';
import { aiClassificationService } from '../composio_v2/aiClassification.service.js';
import { userMemoryService } from '../conversations/userMemory.service.js';
import { captureException } from '../../../shared/sentry.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Read model from env or default to gemini-2.5-flash (the current valid model)
const CLASSIFIER_MODEL = process.env.GEMINI_CLASSIFIER_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const client = new GoogleGenerativeAI(config.gemini_secret_key);

// For lightning-fast classification, use Flash and force strict JSON response
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

const VALID_MODULES = Object.keys(MODULE_REGISTRY);

// ═══════════════════════════════════════════════════════════════════════════════
// LLM SYSTEM PROMPT — Dynamically generated from registry
// ═══════════════════════════════════════════════════════════════════════════════

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Master Orchestrator (Synapse) for the Alti Assistant platform.
Your ONLY job is to classify the user's prompt into one of the supported backend modules and extract the required parameters.

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

You MUST respond strictly with valid JSON matching this schema:
{
  "target_module": "string (must be one of the exact module names above)",
  "confidence": number (0.0 to 1.0, how confident you are in the classification),
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

const matchesPattern = (text, patterns) => {
  return patterns.some(pat => {
    if (pat instanceof RegExp) return pat.test(text);
    return text.includes(pat);
  });
};

const localClassifyIntent = (prompt) => {
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CLASSIFICATION & DISPATCH ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const classifyAndDispatch = async (prompt, sessionId, userId, conversationId) => {
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

    // ── 1. LIGHTNING FAST PATH FOR GREETINGS ──
    const trimmedPrompt = prompt.trim().toLowerCase();
    const commonGreetings = ['hi', 'hello', 'hey', 'yo', 'sup', 'hola', 'bonjour', 'howdy', 'greetings', 'help', 'who are you', 'how are you', 'what is this'];
    const isShortQuery = trimmedPrompt.length <= 15;
    const isCommonGreeting = commonGreetings.includes(trimmedPrompt) || commonGreetings.some(greet => trimmedPrompt.startsWith(greet + ' ') || trimmedPrompt.endsWith(' ' + greet));
    
    let intentPayload;
    if (isShortQuery || isCommonGreeting) {
      classificationSource = 'fast-path';
      classificationMs = Date.now() - startTime;
      logger.info(`[Orchestrator] ⚡ Fast-path: "${prompt}" (${classificationMs}ms)`);
      intentPayload = { target_module: 'general_chat', confidence: 1.0, parameters: { query: prompt } };
    } else {
      // ── 2. LOAD CONVERSATION CONTEXT ──
      let conversationContext = '';
      if (conversationId && conversationId !== 'new-chat') {
        try {
          const conversation = await Conversation.findOne(
            { conversationId, userId },
            { messages: { $slice: -6 } } // Last 3 exchanges (user+assistant each)
          ).lean();
          if (conversation?.messages?.length > 0) {
            conversationContext = '\n\nRecent conversation context:\n' +
              conversation.messages
                .map(m => `${m.role}: ${(m.content || '').substring(0, 200)}`)
                .join('\n');
          }
        } catch (ctxErr) {
          logger.warn(`[Orchestrator] Failed to load conversation context: ${ctxErr.message}`);
        }
      }

      // ── 3. LLM CLASSIFICATION (Gemini → Azure → Local fallback) ──
      logger.info(`[Orchestrator] Classifying prompt from user ${userId} (model: ${CLASSIFIER_MODEL})...`);
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
        logger.info(`[Orchestrator] ✅ Gemini classified in ${Date.now() - classifyStart}ms`);
      } catch (geminiErr) {
        logger.warn(`[Orchestrator] ⚠️ Gemini failed (${geminiErr.message}). Trying Azure...`);
        captureException(geminiErr, { stage: 'orchestrator-gemini', model: CLASSIFIER_MODEL });

        // Try Azure fallback
        try {
          if (!config.azure?.endpoint || !config.azure?.apiKey) {
            throw new Error('Azure AI Foundry not configured');
          }

          const { endpoint, apiKey, deploymentOrModel, apiVersion } = config.azure;
          const isAzureOpenAI = endpoint.includes('openai.azure.com') || endpoint.includes('deployments');

          let requestUrl = endpoint;
          const headers = { 'Content-Type': 'application/json' };

          if (isAzureOpenAI) {
            headers['api-key'] = apiKey;
            if (!requestUrl.includes('/openai/deployments/')) {
              const baseUrl = requestUrl.split('/openai')[0];
              requestUrl = `${baseUrl}/openai/deployments/${deploymentOrModel}/chat/completions?api-version=${apiVersion}`;
            }
          } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
            if (!requestUrl.includes('/chat/completions')) {
              requestUrl = requestUrl.replace(/\/$/, '') + '/chat/completions';
            }
          }

          const classificationPrompt = conversationContext
            ? `${conversationContext}\n\nNew user message to classify:\n${prompt}`
            : prompt;

          const response = await fetch(requestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...(isAzureOpenAI ? {} : { model: deploymentOrModel }),
              messages: [
                { role: 'system', content: ORCHESTRATOR_SYSTEM_PROMPT },
                { role: 'user', content: classificationPrompt }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1
            })
          });

          if (response.ok) {
            const data = await response.json();
            rawJson = data.choices?.[0]?.message?.content || '{}';
            classificationSource = 'azure';
            logger.info(`[Orchestrator] ✅ Azure classified in ${Date.now() - classifyStart}ms`);
          } else {
            const errBody = await response.text();
            throw new Error(`Azure returned ${response.status}: ${errBody}`);
          }
        } catch (azureErr) {
          logger.error(`[Orchestrator] ❌ Azure also failed: ${azureErr.message}`);
          captureException(azureErr, { stage: 'orchestrator-azure' });
          rawJson = '{}';
        }
      }

      // Clean markdown blocks if LLM ignored instructions
      rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        intentPayload = JSON.parse(rawJson);

        // Validate target_module against allowed enum
        if (!intentPayload.target_module || !VALID_MODULES.includes(intentPayload.target_module)) {
          logger.warn(`[Orchestrator] LLM returned invalid module: "${intentPayload.target_module}". Falling back to local.`);
          throw new Error(`Invalid target_module: ${intentPayload.target_module}`);
        }

        if (classificationSource === 'unknown') classificationSource = 'llm';
      } catch (e) {
        // LLM classification unavailable or returned invalid module — use local fallback
        classificationSource = 'local-fallback';
        intentPayload = localClassifyIntent(prompt);
        logger.info(`[Orchestrator] 🔄 Local fallback → ${intentPayload.target_module} (confidence: ${intentPayload.confidence})`);
      }

      classificationMs = Date.now() - classifyStart;
    }

    const { target_module, parameters, confidence } = intentPayload;
    logger.info(`[Orchestrator] 🎯 ${target_module} (via ${classificationSource}, ${classificationMs}ms, confidence: ${confidence || 'N/A'})`);

    // ── 4. CHECK CREDITS (fire-and-forget — truly non-blocking) ──
    if (userId) {
      paymentController.incrementPromptsUsed(userId).catch(paymentErr => {
        logger.warn(`[Orchestrator] Payment check failed: ${paymentErr.message}`);
      });
    }

    // ── 5. DISPATCH TO CORRECT MODULE ──
    let finalResponse;
    const dispatchConfig = MODULE_REGISTRY[target_module] || MODULE_REGISTRY.general_chat;

    try {
      if (dispatchConfig.dispatch === 'composio') {
        // Connected apps path
        logger.info(`[Orchestrator] → Connected apps for: "${prompt.substring(0, 60)}..."`);
        try {
          const composioResult = await aiClassificationService.processUserInputService(
            prompt,
            { userId, conversationId, isGuest: false },
            null
          );
          if (composioResult.success) {
            finalResponse = {
              reply: composioResult.data?.responseMessage?.message || 'Action completed successfully.',
              executionResult: composioResult.data?.executionResult,
              toolResults: composioResult.data?.responseMessage?.toolResults || [],
            };
          } else {
            throw new Error(composioResult.error || 'Connected apps execution failed');
          }
        } catch (composioErr) {
          logger.error(`[Orchestrator] Connected apps failed: ${composioErr.message}. Falling back to Swarm...`);
          finalResponse = await SwarmService.executeSwarmSync(prompt, [], userId);
        }
      } else {
        // Swarm path — for all other modules
        finalResponse = await SwarmService.executeSwarmSync(
          parameters?.query || prompt,
          [],
          userId,
          { requireSearch: !!parameters?.require_search || !!dispatchConfig.requireSearch }
        );
      }
    } catch (dispatchErr) {
      logger.error(`[Orchestrator] ❌ Dispatch to ${target_module} failed: ${dispatchErr.message}`);
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
        if (finalConversationId && finalConversationId !== 'new-chat') {
          conversation = await Conversation.findOne({ conversationId: finalConversationId, userId });
        }
        
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

        if (conversation) {
          conversation.addMessage('user', prompt);
          conversation.addMessage('assistant', finalResponse.reply, assistantMetadata);
          await conversation.save();
        } else {
          finalConversationId = crypto.randomUUID();
          const cleanTitle = prompt.length > 40 ? `${prompt.substring(0, 40)}...` : prompt;
          conversation = new Conversation({
            conversationId: finalConversationId,
            userId,
            title: cleanTitle,
            messages: [
              { role: 'user', content: prompt, timestamp: new Date() },
              { role: 'assistant', content: finalResponse.reply, metadata: assistantMetadata, timestamp: new Date() }
            ],
            status: 'active'
          });
          await conversation.save();
        }
      }
    } catch (dbErr) {
      logger.error('[Orchestrator] Failed to persist chat history:', dbErr);
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
      },
      total_time_ms: totalMs,
      ...finalResponse
    };
  } catch (err) {
    // Safety net — should be effectively unreachable
    logger.error('[Orchestrator] ‼️ Unexpected top-level error (safety net):', err);
    captureException(err, { stage: 'orchestrator-top-level', prompt: prompt?.substring(0, 100) });

    const safeResponse = `I received your message but encountered an unexpected issue. Please try again — I'm here to help!`;

    return {
      conversationId: conversationId || crypto.randomUUID(),
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

export const orchestratorService = {
  classifyAndDispatch,
};
