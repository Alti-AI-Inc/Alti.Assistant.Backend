import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import Chat from '../chat/chat.model.js';
import UserModel from '../auth/auth.model.js';
import AgentService from './agent.service.js';
import { MemoryService } from '../../services/memory.service.js';
import { verifyCitations } from './groundingVerifier.js';
import { PostHogService } from '../analytics/posthog.service.js';

/**
 * Aphura Sovereign Router Service (License: MIT)
 * Central Intelligence Orchestration Engine bridging all endpoints to the Agentic ReAct core.
 * Powered by Aphura Sovereign Router (MIT).
 */

const TELEMETRY_BUFFER_SIZE = 500;
const telemetryBuffer = [];

function recordTelemetry(entry) {
  telemetryBuffer.push({ ...entry, timestamp: new Date().toISOString() });
  if (telemetryBuffer.length > TELEMETRY_BUFFER_SIZE) telemetryBuffer.shift();
}

export const SovereignRouterService = {
  /**
   * Load recent conversation history from MongoDB for context-aware routing.
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
        if (r.reply) history.push({ role: 'assistant', content: r.reply.slice(0, 300) });
      }
      return history.slice(-6);
    } catch (err) {
      logger.warn(`[SovereignRouter] Context load failed: ${err.message}`);
      return [];
    }
  },

  /**
   * Build the sovereign system prompt with ground truth directives and citation standards.
   */
  buildSystemPrompt(userContext = {}) {
    return `You are Aphura AI — the world's most powerful sovereign data intelligence operating system.
You are running directly on bare-metal infrastructure with zero external data egress.
You have direct, real-time access to 256 verified open-source engines across 37 sovereign domains spanning ERP, Data Lakehouses, AST Code Intelligence, Core Banking, AI Cognition, and High-Speed Real-Time Communications.

CORE OPERATIONAL PRINCIPLES:
1. ALWAYS EXECUTE TOOLS: For any calculation, document generation, code refactoring, data query, or factual retrieval, call the appropriate tool. Never hallucinate outputs when a deterministic engine is available.
2. SPEED & QUALITY: Generate precise, executive-level responses. Lead with code, commands, or data tables immediately.
3. GROUNDING & CITATIONS: When references or data are returned by tools, embed inline bracketed citations [1], [2] linked to verified data points.
4. SOVEREIGN BOUNDARY: Never leak private tenant credentials, internal OpenStack topology, or infrastructure keys.

User Context:
- Timezone: ${userContext.timezone || 'UTC'}
- Local Date: ${userContext.localDate || new Date().toDateString()}
- Local Time: ${userContext.localTime || new Date().toTimeString()}`;
  },

  /**
   * Main unified prompt handler for SSE streaming.
   * Supports both object parameters and Express (req, res) signature.
   */
  async handlePromptStream(param1, param2) {
    const pipelineStart = Date.now();
    let prompt, sessionId, userId, userContext, req, res;

    // Check if called as handlePromptStream(req, res)
    if (param1 && param1.body && param2 && typeof param2.setHeader === 'function') {
      req = param1;
      res = param2;
      prompt = req.body.prompt || req.body.message;
      sessionId = req.body.sessionId || req.body.conversationId;
      userId = req.user?.userId || req.user?._id;
      userContext = {
        timezone: req.body.timezone || 'America/New_York',
        localDate: req.body.localDate,
        localTime: req.body.localTime,
        category: req.body.category,
        metadata: req.body.metadata,
      };
    } else {
      // Called with named options object
      const opts = param1 || {};
      prompt = opts.prompt;
      sessionId = opts.sessionId;
      userId = opts.userId;
      userContext = opts.userContext || {};
      req = opts.req;
      res = opts.res || param2;
    }

    if (!res || !prompt) {
      if (res && !res.headersSent) {
        res.status(400).json({ success: false, message: 'Prompt is required' });
      }
      return;
    }

    // Set up SSE headers immediately
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const convId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    res.write(`data: ${JSON.stringify({ type: 'connected', conversationId: convId })}\n\n`);

    // Abort handling on client disconnect
    let clientDisconnected = false;
    if (req && typeof req.on === 'function') {
      req.on('close', () => { clientDisconnected = true; });
    }
    if (res && typeof res.on === 'function') {
      res.on('close', () => { clientDisconnected = true; });
    }

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

    let systemPrompt = this.buildSystemPrompt(userContext);
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

    PostHogService.captureEvent(userId || 'anonymous', 'prompt_stream_initiated', { promptLength: prompt.length }).catch(() => {});

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
          if (chunk.references && chunk.references.length > 0) {
            allReferences.push(...chunk.references);
          }
          res.write(`data: ${JSON.stringify({
            type: 'metadata',
            route: 'SOVEREIGN_MOE',
            confidence: 1.0,
            reference: allReferences,
            citations: allReferences,
            conversationId: convId,
            ...chunk
          })}\n\n`);
        }
      }

      // Citation Grounding Verification
      if (fullReply && allReferences.length > 0) {
        const { groundingReport } = verifyCitations(fullReply, allReferences);
        if (groundingReport && groundingReport.ungrounded > 0) {
          res.write(`data: ${JSON.stringify({
            type: 'grounding_report',
            groundingRate: groundingReport.groundingRate,
            ungrounded: groundingReport.ungrounded,
            total: groundingReport.total
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
      type: 'prompt_stream',
      route: 'SOVEREIGN_MOE',
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
   * Main unified prompt handler for standard JSON response.
   */
  async handlePromptJson({ prompt, sessionId, userId, userContext }) {
    const pipelineStart = Date.now();
    const convId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const conversationHistory = await this.loadConversationContext(userId, convId);

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

    let systemPrompt = this.buildSystemPrompt(userContext);
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

    const rawReply = result.reply || '';
    const references = result.references || [];

    const { verifiedText } = verifyCitations(rawReply, references, { stripUngrounded: true });
    const reply = verifiedText || rawReply;
    const totalTime = ((Date.now() - pipelineStart) / 1000).toFixed(2);

    recordTelemetry({
      type: 'prompt_json',
      route: 'SOVEREIGN_MOE',
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
      route: 'SOVEREIGN_MOE',
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

  /**
   * Persists conversation into MongoDB Chat model.
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
   * Telemetry stats for health & monitoring.
   */
  getTelemetry() {
    return {
      total: telemetryBuffer.length,
      recent: telemetryBuffer.slice(-20),
      routeDistribution: telemetryBuffer.reduce((acc, t) => {
        if (t.route) acc[t.route] = (acc[t.route] || 0) + 1;
        return acc;
      }, {}),
    };
  },
};

export default SovereignRouterService;
