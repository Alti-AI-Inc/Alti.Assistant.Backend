import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { groqChat, groqStream, groqLightChat } from '../../services/groq.client.js';
import Chat from '../chat/chat.model.js';
import UserModel from '../auth/auth.model.js';
import { IntentClassifier, ROUTE_TYPES } from './classifier.js';
import AgentService from './agent.service.js';
import { MemoryService } from '../../services/memory.service.js';

// ─── Telemetry ─────────────────────────────────────────────────────────────────
const TELEMETRY_BUFFER_SIZE = 500;
const telemetryBuffer = [];

function recordTelemetry(entry) {
  telemetryBuffer.push({ ...entry, timestamp: new Date().toISOString() });
  if (telemetryBuffer.length > TELEMETRY_BUFFER_SIZE) telemetryBuffer.shift();
}

// ─── Lazy Service Loader ───────────────────────────────────────────────────────
const loadService = async (loader) => {
  try {
    return await loader();
  } catch (err) {
    logger.warn(`[SovereignRouter] Service load failed: ${err.message}`);
    return null;
  }
};

/**
 * Sovereign Router — Central Intelligence Engine v2
 *
 * Upgrades over v1:
 *  1. Hybrid LLM + heuristic classification (fast path + LLM escalation)
 *  2. Multi-route fan-out for compound prompts
 *  3. Context-aware routing from conversation history
 *  4. Search augmentation (parallel Exa enrichment) for all routes
 *  5. Confidence scoring + telemetry on every routing decision
 */
export const SovereignRouterService = {

  // Legacy intent classification and fan-out code deleted.
  // AgentService now natively handles all tools dynamically.

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. SEARCH AUGMENTATION (PARALLEL EXA ENRICHMENT)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enrich any route's response with parallel Exa web search.
   * Returns additional references without blocking the primary subsystem fetch.
   */
  async fetchSearchAugmentation(prompt) {
    try {
      const { ExaSearchService } = await import('../ExaSearch/exaSearch.service.js');
      const searchRes = await ExaSearchService.searchDirectly(prompt, { numResults: 3 });
      const results = searchRes?.results || [];
      return results.map(r => ({
        title: r.title || 'Web Source',
        url: r.url || 'https://exa.ai',
        snippet: r.summary || r.text?.slice(0, 200) || '',
        source: 'Exa Neural Search (Augmentation)'
      }));
    } catch (err) {
      logger.warn(`[SovereignRouter] Search augmentation failed: ${err.message}`);
      return [];
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CONTEXT-AWARE ROUTING (CONVERSATION HISTORY)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load recent conversation history from MongoDB for context-aware routing.
   * Returns the last 3 exchanges as [{role, content}] for the classifier.
   */
  async loadConversationContext(userId, sessionId) {
    if (!userId || !sessionId) return [];
    try {
      const chatSession = await Chat.findOne({ user: userId, sessionId }).lean();
      if (!chatSession?.responses?.length) return [];

      const recent = chatSession.responses.slice(-3);
      const history = [];
      for (const r of recent) {
        if (r.prompt) history.push({ role: 'user', content: r.prompt });
        if (r.reply) history.push({ role: 'assistant', content: r.reply.slice(0, 200) }); // Truncate to save tokens
      }
      return history.slice(-6); // Max 6 messages (3 exchanges)
    } catch (err) {
      logger.warn(`[SovereignRouter] Context load failed: ${err.message}`);
      return [];
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM PROMPT BUILDER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build the Perplexity-beating system prompt with live grounded context & mandatory citations
   */
  buildSystemPrompt(route, dataContext, references = [], userContext = {}) {
    const isChitchat = route === 'CHITCHAT';

    let sourcesBlock = '';
    if (references && references.length > 0) {
      // Deduplicate by URL
      const seen = new Set();
      const unique = references.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
      sourcesBlock = `\nTHIRD-PARTY VERIFIED CITATION INDEX:\n` +
        unique.map((r, i) => `[${i + 1}] "${r.title}" (${r.url}) — ${r.source || 'Third-Party Verification'}`).join('\n') + '\n';
    }

    return `You are Aphura (Aphura AI), the sovereign data intelligence search & answer engine, engineered to surpass Perplexity in factual accuracy, real-time depth, and verifiable citations.

CORE PRODUCT MOAT — 100% THIRD-PARTY VERIFIABILITY:
The foundational moat of this platform is that EVERY answer is verifiable with third-party checks. We never output unverified hallucinations. Every single statement, statistic, calculation, finding, and factual claim is backed by independent third-party sources.

Platform Subsystems Connected:
1. Massive.com (Live Stocks, Options, Forex)
2. CoinAPI.io (Live Crypto Exchange Rates, Orderbooks)
3. API-Sports.io (Real-Time Scores & Live Fixtures for 12 Sports)
4. PredictionData.io (Polymarket, Kalshi, DraftKings Odds)
5. Visual Crossing (Global Weather, Forecasts, Radar)
6. AviationStack (Live Flight Tracking, Airport Radar)
7. NewsAPI.ai (Breaking News, Global Events)
8. Mapbox (Geospatial POIs, Directions, Isochrones)
9. Explorium AgentSource v2 (B2B Firmographics, Prospects)
10. Exa.ai (Neural Web Search & Instant Crawling)
11. Open Codex (Sandboxed Code Execution)
12. Composio (1,500+ App Actions)
13. OpenStack Cloud (Heavy Sovereign Compute)
14. LlamaIndex (Knowledge RAG)

User Context:
- Active Route: ${route}
- Timezone: ${userContext.timezone || 'UTC'}
- Local Date: ${userContext.localDate || new Date().toDateString()}
- Local Time: ${userContext.localTime || new Date().toTimeString()}

LIVE DATA RETRIEVED FROM PLATFORM:
${dataContext ? dataContext : 'No external data required for brief conversational greeting.'}
${sourcesBlock}
Directives for World-Class Output:
1. Executive Lead: Provide the direct, definitive answer in the very first sentence. Never begin with conversational filler ("Sure!", "Here is...", "Based on...").
2. Structured Markdown Tables: Whenever displaying numerical, multi-attribute, or comparative data (weather forecasts, stock quotes, crypto prices, flight statuses, sports fixtures, prediction odds), you MUST present it in a clean, professional GitHub-flavored Markdown table.
3. In-Line Numbered Citations: Every single factual assertion, statistic, score, price, date, and claim MUST feature an in-text numbered citation badge like [1], [2] referencing the verified third-party source list.
4. Bold Highlights: Bold crucial metrics, key entities, and critical conclusions.
5. Verifiable Sources Bibliography: Conclude EVERY response with a "### Sources" section formatted as:
   [1] [Source Title](url) — Platform/Publisher Name
   [2] [Source Title](url) — Platform/Publisher Name
6. Zero Tangents & No Follow-Ups: Do NOT append any 'Related Questions', suggested prompts, next steps, or conversational closing remarks. End cleanly after the ### Sources section.`;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN HANDLERS (STREAM + JSON)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Main unified prompt handler for SSE streaming (primary frontend prompt box target).
   * Upgraded to use the ultimate Agentic ReAct Tool Calling Loop.
   */
  async handlePromptStream({ prompt, sessionId, userId, userContext, res }) {
    const pipelineStart = Date.now();

    // Set up SSE headers immediately
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const convId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.write(`data: ${JSON.stringify({ type: 'connected', conversationId: convId })}\n\n`);

    const conversationHistory = await this.loadConversationContext(userId, convId);
    
    // Fetch Long-Term Memory (Mem0)
    let memoryContext = '';
    if (userId) {
      try {
        const memories = await MemoryService.searchMemories(userId, 'agentic_loop', prompt, 5);
        if (memories && memories.length > 0) {
          memoryContext = '\n\nLONG-TERM MEMORY RECALL:\n' + memories.map(m => `- ${m.memory}`).join('\n');
        }
      } catch (err) {
        logger.warn(`[SovereignRouter] Memory fetch failed: ${err.message}`);
      }
    }
    
    // Use the generic AGENT route for the system prompt
    let systemPrompt = this.buildSystemPrompt('AGENTIC_LOOP', '', [], userContext) + 
      "\n\nYou are operating in Agentic ReAct mode. You have access to tools for web search, triggering apps, weather, flights, code sandbox, edge VMs, company research, crypto, stocks, sports, prediction markets, and news. If the user asks for ANY of these domains, USE THE CORRESPONDING TOOL. DO NOT GUESS.";
    
    if (memoryContext) {
      systemPrompt += memoryContext;
    }
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: prompt }
    ];

    let fullReply = '';
    const allReferences = [];
    const streamStart = Date.now();

    try {
      const stream = AgentService.runAgentStream(messages, {
        model: config.groq?.model || 'gpt-oss-120b',
        temperature: 0.2,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullReply += chunk.content;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        } else if (chunk.type === 'metadata') {
          allReferences.push(...(chunk.references || []));
          res.write(`data: ${JSON.stringify({
            type: 'metadata',
            route: 'AGENTIC_LOOP',
            classifier: 'react_agent',
            confidence: 1.0,
            reference: allReferences,
            citations: allReferences,
            conversationId: convId
          })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (err) {
      logger.error(`[SovereignRouter] Agent stream error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ type: 'text', content: '\n\n*Error generating live response: ' + err.message + '*' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } finally {
      res.end();
    }

    const totalTime = ((Date.now() - pipelineStart) / 1000).toFixed(2);
    recordTelemetry({
      type: 'prompt',
      route: 'AGENTIC_LOOP',
      classifier: 'react_agent',
      confidence: 1.0,
      referenceCount: allReferences.length,
      totalTimeMs: Date.now() - pipelineStart,
      streamTimeMs: Date.now() - streamStart,
      prompt: prompt.slice(0, 80),
    });

    this.persistChat(userId, convId, prompt, fullReply, allReferences, totalTime).catch(err => {
      logger.warn(`[SovereignRouter] Chat persistence error: ${err.message}`);
    });

    if (userId && fullReply) {
      MemoryService.addMemory(userId, 'agentic_loop', [
        { role: 'user', content: prompt },
        { role: 'assistant', content: fullReply }
      ]).catch(err => {
        logger.warn(`[SovereignRouter] Memory saving error: ${err.message}`);
      });
    }
  },

  /**
   * Main unified prompt handler for JSON response (non-streaming fallback).
   */
  async handlePromptJson({ prompt, sessionId, userId, userContext }) {
    const pipelineStart = Date.now();
    const convId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Load conversation context
    const conversationHistory = await this.loadConversationContext(userId, convId);

    // Fetch Long-Term Memory (Mem0)
    let memoryContext = '';
    if (userId) {
      try {
        const memories = await MemoryService.searchMemories(userId, 'agentic_loop', prompt, 5);
        if (memories && memories.length > 0) {
          memoryContext = '\n\nLONG-TERM MEMORY RECALL:\n' + memories.map(m => `- ${m.memory}`).join('\n');
        }
      } catch (err) {
        logger.warn(`[SovereignRouter] Memory fetch failed: ${err.message}`);
      }
    }

    let systemPrompt = this.buildSystemPrompt('AGENTIC_LOOP', '', [], userContext) + 
      "\n\nYou are operating in Agentic ReAct mode. You have access to tools for web search, triggering apps, weather, flights, code sandbox, edge VMs, company research, crypto, stocks, sports, prediction markets, and news. If the user asks for ANY of these domains, USE THE CORRESPONDING TOOL. DO NOT GUESS.";
    
    if (memoryContext) {
      systemPrompt += memoryContext;
    }
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: prompt }
    ];

    const llmStart = Date.now();
    const result = await AgentService.runAgentJson(messages, {
      model: config.groq?.model || 'gpt-oss-120b',
      temperature: 0.2,
    });

    const reply = result.reply;
    const references = result.references || [];
    const totalTime = ((Date.now() - pipelineStart) / 1000).toFixed(2);

    // Telemetry
    recordTelemetry({
      type: 'prompt_json',
      route: 'AGENTIC_LOOP',
      referenceCount: references.length,
      totalTimeMs: Date.now() - pipelineStart,
      llmTimeMs: Date.now() - llmStart,
      prompt: prompt.slice(0, 80),
    });

    await this.persistChat(userId, convId, prompt, reply, references, totalTime);

    if (userId && reply) {
      MemoryService.addMemory(userId, 'agentic_loop', [
        { role: 'user', content: prompt },
        { role: 'assistant', content: reply }
      ]).catch(err => {
        logger.warn(`[SovereignRouter] Memory saving error: ${err.message}`);
      });
    }

    return {
      prompt,
      sessionId: convId,
      conversationId: convId,
      route: 'AGENTIC_LOOP',
      classification: {
        route: 'AGENTIC_LOOP',
        confidence: 1,
        classifier: 'Agentic_ReAct',
        reasoning: 'Unified agent loop',
        search_augmentation: false,
      },
      reply,
      responseMessage: {
        answer: reply,
        reference: references,
      },
      references,
      citations: references,
      total_time: totalTime,
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE + TELEMETRY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Asynchronously persists Q&A into MongoDB Chat model
   */
  async persistChat(userId, sessionId, prompt, reply, references, totalTime) {
    if (!userId || !sessionId) return;
    try {
      const searchResults = (references || []).map((r, idx) => ({
        title: r.title || 'Source',
        link: r.url || '',
        snippet: r.snippet || '',
        position: idx + 1,
      }));

      const responseRecord = {
        prompt,
        model: config.groq?.model || 'gpt-oss-120b',
        reply,
        search_results: searchResults,
        total_time: String(totalTime),
      };

      let chatSession = await Chat.findOne({ user: userId, sessionId });
      if (chatSession) {
        chatSession.responses.push(responseRecord);
        await chatSession.save();
      } else {
        chatSession = await Chat.create({
          user: userId,
          sessionId,
          responses: [responseRecord],
        });
        await UserModel.findByIdAndUpdate(userId, {
          $push: { chatAiSessions: chatSession._id },
        });
      }
    } catch (err) {
      logger.warn(`[SovereignRouter] persistChat error: ${err.message}`);
    }
  },

  /**
   * Get telemetry data for monitoring dashboard.
   */
  getTelemetry() {
    return {
      total: telemetryBuffer.length,
      recent: telemetryBuffer.slice(-20),
      routeDistribution: telemetryBuffer.reduce((acc, t) => {
        if (t.route) acc[t.route] = (acc[t.route] || 0) + 1;
        return acc;
      }, {}),
      classifierDistribution: telemetryBuffer.reduce((acc, t) => {
        if (t.classifier) acc[t.classifier] = (acc[t.classifier] || 0) + 1;
        return acc;
      }, {}),
      avgConfidence: telemetryBuffer.filter(t => t.confidence).reduce((sum, t, _, arr) => sum + t.confidence / arr.length, 0).toFixed(3),
    };
  },
};

export default SovereignRouterService;
