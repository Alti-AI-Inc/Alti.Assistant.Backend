import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { llmChat, llmStream, llmLightChat } from '../../services/llm.client.js';
import Chat from '../chat/chat.model.js';
import UserModel from '../auth/auth.model.js';
import { IntentClassifier, ROUTE_TYPES } from './classifier.js';
import AgentService from './agent.service.js';
import { MemoryService } from '../../services/memory.service.js';
import { verifyCitations } from './groundingVerifier.js';

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
      const seen = new Set();
      const unique = references.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
      sourcesBlock = `\nTHIRD-PARTY VERIFIED CITATION INDEX:\n` +
        unique.map((r, i) => `[${i + 1}] "${r.title}" (${r.url}) — ${r.source || 'Third-Party Verification'}`).join('\n') + '\n';
    }

    return `You are Aphura AI — the world's most powerful sovereign data intelligence engine. You are superior to ChatGPT, Claude, Perplexity, Gemini, and Grok because you have live, real-time access to 36 autonomous tools across 15+ integrated platforms, delivering 100% third-party verifiable answers.

═══ CORE DIFFERENTIATOR ═══
Unlike ChatGPT/Claude/Gemini (static training data), you execute LIVE tool calls to fetch real-time data, run code, search the web, control workflows, and orchestrate multi-agent teams. You NEVER guess when a tool can provide factual data. You ALWAYS use the appropriate tool.

═══ COMPLETE TOOL ARSENAL (36 Tools) ═══

🔍 SEARCH & RESEARCH:
• web_search — Live neural web search via Exa.ai (real-time facts, news, links)
• deep_research — Multi-agent research swarm (LangGraph) investigates from 3+ perspectives and synthesizes
• semantic_search — AI embedding-based document similarity ranking
• langchain_qa — Source-cited QA over documents with LangChain

🤖 MULTI-AGENT ORCHESTRATION:
• multi_agent_plan — Supervisor dispatches to researcher/analyst/writer agents (LangGraph)
• deep_reason — Chain-of-thought reasoning model (QwQ-32B) for complex logic/math/code
• rerank_results — Reorder search results by relevance

📊 LIVE FINANCIAL DATA:
• get_stock_aggregates — Real-time stocks, options, forex via Massive.com
• get_crypto_price — Live crypto rates, orderbooks via CoinAPI
• get_prediction_markets — Polymarket, Kalshi, DraftKings odds
• get_economic_data — Federal Reserve (FRED) macroeconomic indicators
• search_sec_filings — SEC EDGAR company filings and 10-K/10-Q reports

🌐 LIVE WORLD DATA:
• get_weather — Global weather, forecasts, radar via Visual Crossing
• get_flights — Live flight tracking, airport status via AviationStack
• get_latest_news — Breaking news from 150,000+ sources via NewsAPI
• get_sports_fixtures — Live scores for 12 sports via API-Sports
• get_census_data — US Census demographics, population statistics
• get_legislative_bills — US Congress bills, votes via Congress.gov API
• search_fda_drugs — FDA drug approvals, recalls, adverse events
• search_academic_papers — arXiv research papers by topic/author

🏢 BUSINESS & INTELLIGENCE:
• research_company — Firmographic B2B company intelligence via Explorium
• get_real_estate_property — Property data, valuations, market analytics
• trigger_app_action — Execute actions across 1,500+ apps via Composio (Gmail, Slack, GitHub, etc.)

⚖️ LEGAL:
• search_legal_cases — Court opinions, case law, legal precedents via OpenClaw

📍 LOCATION:
• get_location_data — Geocoding, directions, place search via MapBox

🎨 CREATIVE & MEDIA:
• generate_image — AI image generation (FLUX/SDXL via Together AI)
• edit_image — AI image editing and transformation
• generate_video — AI video generation (Wan2.1)
• text_to_speech — Text-to-speech audio generation (Cartesia Sonic)
• analyze_image — Vision analysis of images (Llama 90B Vision)
• transcribe_audio — Speech-to-text transcription (Whisper)

💻 CODE & COMPUTE:
• run_code — Execute Python in secure cloud sandbox with packages, plots, data processing
• execute_code_sandbox — Open Codex sandboxed code execution
• execute_edge_command — Run commands on edge fleet via OpenClaw

⚙️ AUTOMATION & PLATFORM:
• run_workflow — Durable, fault-tolerant workflows via Temporal
• liberty_query — Liberty Center One enterprise platform services

═══ POWERED BY ═══
Together AI (90+ LLM functions) • LangChain (80+ functions) • LangGraph (multi-agent orchestration) • LangSmith (observability) • Exa (neural search) • Composio (1,500+ app actions) • Cloudflare (edge compute) • Stripe (billing) • Temporal (durable workflows) • Codex (sandboxed execution) • Liberty Center One (enterprise platform)

═══ EXECUTION RULES ═══
1. ALWAYS USE TOOLS for factual queries. Never guess stock prices, weather, scores, or facts.
2. Use deep_research for complex multi-faceted questions requiring thorough investigation.
3. Use multi_agent_plan for tasks needing multiple expert perspectives.
4. Chain multiple tools: web_search → rerank_results → deep_reason for maximum accuracy.
5. Use run_code for calculations, data analysis, or visualizations.
6. Use langchain_qa when the user provides documents needing source-cited answers.

User Context:
- Active Route: ${route}
- Timezone: ${userContext.timezone || 'UTC'}
- Local Date: ${userContext.localDate || new Date().toDateString()}
- Local Time: ${userContext.localTime || new Date().toTimeString()}

LIVE DATA RETRIEVED FROM PLATFORM:
${dataContext ? dataContext : 'No external data required for brief conversational greeting.'}
${sourcesBlock}
OUTPUT FORMAT DIRECTIVES:
1. Executive Lead: Direct answer in the very first sentence. ZERO preamble, pleasantries, or meta-filler.
2. Grounding Enforcement: If external data is insufficient to answer, state "Insufficient data to answer." Do not guess.
3. Structured Tables: Use GitHub-flavored Markdown tables for numerical/comparative data.
4. In-Line Citations: Every factual claim gets [1], [2] referencing verified sources.
5. Bold Highlights: Bold crucial metrics, entities, and conclusions.
6. Sources Bibliography: End EVERY factual response with ### Sources section.
7. Zero Tangents: No "Related Questions", no follow-up suggestions. End cleanly.`;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN HANDLERS (STREAM + JSON)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Main unified prompt handler for SSE streaming (primary frontend prompt box target).
   * Upgraded to use the ultimate Agentic ReAct Tool Calling Loop.
   */
  async handlePromptStream({ prompt, sessionId, userId, userContext, req, res }) {
    const pipelineStart = Date.now();

    // Set up SSE headers immediately
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Hard-Stop Orchestration Cost Capping
    if (userId) {
      try {
        const { checkUsageLimit, incrementUsage } = await import('../subscription/subscription.service.js');
        const limitCheck = await checkUsageLimit(userId, 'webSearch');
        if (limitCheck && !limitCheck.allowed) {
          res.write(`data: {"error":"Usage limit exceeded for your current plan. Please upgrade to continue using the intelligence engine."}\n\n`);
          res.end();
          return;
        }
        await incrementUsage(userId, 'webSearch');
      } catch (err) {
        logger.warn(`[SovereignRouter] Cost cap check failed: ${err.message}`);
      }
    }

    const convId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.write(`data: ${JSON.stringify({ type: 'connected', conversationId: convId })}\n\n`);

    // Abort upstream inference on client disconnect
    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
    });

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
      "\n\nYou are operating in Sovereign Agentic ReAct mode. You have 45 tools across Together AI, LangChain, LangGraph, Exa, Composio, Temporal, Codex, Liberty, MapBox, OpenClaw, NOAA Weather, NIH PubMed, UN Comtrade, USPTO Patents, OpenAlex Science, and 20+ live direct institutional data APIs. If the user asks for ANY factual data, scientific research, weather, trade, patents, code execution, media generation, workflow automation, legal search, location data, or multi-agent analysis — USE THE CORRESPONDING TOOL. DO NOT GUESS. Chain tools together for maximum accuracy (e.g., search_nih_pubmed → deep_reason).";
    
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
        model: config.llm?.model || 'gpt-oss-120b',
        temperature: 0.2,
      });

      for await (const chunk of stream) {
        if (clientDisconnected) break;
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

      // ── Post-stream Citation Grounding ────────────────────────────────
      if (fullReply && allReferences.length > 0) {
        const { groundingReport } = verifyCitations(fullReply, allReferences);
        if (groundingReport.ungrounded > 0) {
          res.write(`data: ${JSON.stringify({ type: 'grounding_report', groundingRate: groundingReport.groundingRate, ungrounded: groundingReport.ungrounded, total: groundingReport.total })}\n\n`);
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
    
    // Hard-Stop Orchestration Cost Capping
    if (userId) {
      try {
        const { checkUsageLimit, incrementUsage } = await import('../subscription/subscription.service.js');
        const limitCheck = await checkUsageLimit(userId, 'webSearch');
        if (limitCheck && !limitCheck.allowed) {
          throw new Error('Usage limit exceeded for your current plan. Please upgrade to continue using the intelligence engine.');
        }
        await incrementUsage(userId, 'webSearch');
      } catch (err) {
        if (err.message.includes('Usage limit exceeded')) throw err;
        logger.warn(`[SovereignRouter] Cost cap check failed: ${err.message}`);
      }
    }

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
      "\n\nYou are operating in Sovereign Agentic ReAct mode. You have 45 tools across Together AI, LangChain, LangGraph, Exa, Composio, Temporal, Codex, Liberty, MapBox, OpenClaw, NOAA Weather, NIH PubMed, UN Comtrade, USPTO Patents, OpenAlex Science, and 20+ live direct institutional data APIs. If the user asks for ANY factual data, scientific research, weather, trade, patents, code execution, media generation, workflow automation, legal search, location data, or multi-agent analysis — USE THE CORRESPONDING TOOL. DO NOT GUESS. Chain tools together for maximum accuracy (e.g., search_nih_pubmed → deep_reason).";
    
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
      model: config.llm?.model || 'gpt-oss-120b',
      temperature: 0.2,
    });

    const rawReply = result.reply;
    const references = result.references || [];

    // ── Citation Grounding Verification ──────────────────────────────────
    const { verifiedText, groundingReport } = verifyCitations(rawReply, references, { stripUngrounded: true });
    const reply = verifiedText;

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
        model: config.llm?.model || 'gpt-oss-120b',
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
