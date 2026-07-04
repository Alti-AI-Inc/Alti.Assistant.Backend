/**
 * @fileoverview Search service — production Gemini 3.5 Flash + Live Web Grounding.
 *
 * Mirrors the core pattern from the monolith's geminiGroundingService.js but
 * extracted into a clean, self-contained class for the agent microservice.
 *
 * Uses:
 *  - @google/genai (GoogleGenAI) — unified Gemini SDK
 *  - tools: [{ googleSearch: {} }] — native Web Search grounding
 */

import { GoogleGenAI } from '@google/genai';
import config from '../../../../shared/config/index.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('search-service');

// ── System Prompt (mirrored from monolith) ──────────────────────────────────
const SYSTEM_PROMPT = `You are an intelligent research assistant providing CONCRETE, specific answers with complete details.

═══════════════════════════════════════════════════════════════════════════════
CORE PRINCIPLES
═══════════════════════════════════════════════════════════════════════════════
✓ Direct essential information only - no fluff, no context unless critical
✓ Never mention "search results", "sources indicate", or reference search process
✓ State facts concisely - remove date qualifiers like "after today" or "next game after [date]"
✓ If incomplete info: "The exact date and time is not scheduled"

FORBIDDEN PHRASES:
❌ "Search results indicate..." | "Please refer to..." | "Check the official..."
❌ "According to search results..." | "Based on the information found..."
❌ "I cannot provide predictions/financial advice..." (provide data-driven analysis instead)
❌ "after [date]" | "next game after today" | Any unnecessary date qualifiers

═══════════════════════════════════════════════════════════════════════════════
RESPONSE MODE DIRECTIVES
═══════════════════════════════════════════════════════════════════════════════

**"PICK ONE" / "CHOOSE ONE":**
When user asks "pick one", "choose one", "which is better", or "A or B?":
→ ONE definitive choice ONLY. No explanations, comparisons, or "here's why" sections.
✅ GOOD: "Palo Alto, CA."
❌ BAD: "Palo Alto, CA, would be better because it's the heart of Silicon Valley..."

**"ANSWER ONLY":**
When user requests "answer only", "just answer", "one answer only", "short answer":
→ Single most definitive answer. No alternatives, no "it depends", no lists.
→ CRITICAL: Distinguish solution types (data providers ≠ databases ≠ platforms ≠ tools)

═══════════════════════════════════════════════════════════════════════════════
RESPONSE FORMATS BY CATEGORY
═══════════════════════════════════════════════════════════════════════════════

**SPORTS/EVENTS:**
Format: Date + Time + Opponent (all 3 required)
Verification: Use site-specific searches. Cross-check 2+ official sources.

**WEATHER:**
Format: Temperature, conditions (concise)

**BUSINESS/INVESTMENT/FINANCIAL:**
→ ALWAYS search for current market data, trends, expert opinions
→ Provide data-driven insights with specific metrics
→ End with clear synthesis: "**Bottom Line:** Current data suggests [insight]. Key: [1-3 points]"

**NEWS/FACTS:**
Core information only, no unnecessary context

═══════════════════════════════════════════════════════════════════════════════
SEARCH STRATEGY & CITATIONS
═══════════════════════════════════════════════════════════════════════════════
• Use multiple specific queries to find complete information
• Combine info from multiple sources for complete answers
• When providing facts, ensure citations are embedded naturally or format them clearly at the end.
• DO NOT hallucinate facts; rely strictly on the provided search grounding.

ALWAYS Search For:
✅ Sports schedules/games | Weather forecasts | News/current events
✅ Market/financial data (investment/crypto queries)
✅ Business trends | Tech developments | Any time-sensitive info

═══════════════════════════════════════════════════════════════════════════════
FINAL REMINDER: Minimal, direct answers. Essential details only. No fluff.
═══════════════════════════════════════════════════════════════════════════════`;

// ── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_OUTPUT_TOKENS = 8000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 60_000;

export class SearchService {
  constructor() {
    if (!config.gemini.apiKey) {
      throw new Error('GEMINI_API_KEY is required — set it in .env');
    }
    this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.model = config.models.flash || 'gemini-3.5-flash';
    logger.info('SearchService initialised', { model: this.model });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Public: non-streaming search
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Execute a grounded search and return the complete result.
   * @param {string} prompt  — user query
   * @param {object} userContext — forwarded from gateway (userId, email, plan)
   * @param {object} [options]  — { conversationHistory, temperature, maxOutputTokens }
   * @returns {Promise<object>} { content, references, citations, metadata }
   */
  async executeSearch(prompt, userContext, options = {}) {
    const startTime = Date.now();
    const {
      conversationHistory = [],
      temperature = DEFAULT_TEMPERATURE,
      maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
    } = options;

    logger.info('executeSearch start', {
      userId: userContext?.userId,
      promptLength: prompt?.length,
      historyLength: conversationHistory.length,
      model: this.model,
    });

    const contents = this.formatContents(conversationHistory, prompt);

    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this._callWithTimeout(
          () =>
            this.ai.models.generateContent({
              model: this.model,
              contents,
              config: {
                temperature,
                maxOutputTokens,
                systemInstruction: SYSTEM_PROMPT,
                tools: [{ googleSearch: {} }],
              },
            }),
          REQUEST_TIMEOUT_MS,
        );

        const text = this._extractText(result);
        if (!text) {
          throw new Error('Empty response from model');
        }

        const groundingMetadata = result.candidates?.[0]?.groundingMetadata ?? null;
        const references = this.extractReferences(groundingMetadata);
        const citations = this._extractCitations(groundingMetadata);
        const searchQueries = groundingMetadata?.webSearchQueries ?? [];

        const elapsed = Date.now() - startTime;
        logger.info('executeSearch complete', {
          attempt,
          elapsed,
          contentLength: text.length,
          totalSources: references.length,
        });

        return {
          content: text,
          references,
          citations,
          metadata: {
            model: this.model,
            agent: 'search',
            grounded: true,
            totalSources: references.length,
            searchQueries,
            elapsed,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        lastError = error;
        logger.warn(`executeSearch attempt ${attempt}/${MAX_RETRIES} failed`, {
          error: error.message,
        });
        if (attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    logger.error('executeSearch exhausted retries', { error: lastError?.message });
    throw lastError;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Public: streaming search (async generator)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Execute a grounded search with streaming.
   * Yields objects: { type: 'text'|'thinking'|'metadata', content|data, timestamp }
   */
  async *executeStreamingSearch(prompt, userContext, options = {}) {
    const startTime = Date.now();
    const {
      conversationHistory = [],
      temperature = DEFAULT_TEMPERATURE,
      maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
    } = options;

    logger.info('executeStreamingSearch start', {
      userId: userContext?.userId,
      promptLength: prompt?.length,
      model: this.model,
    });

    const contents = this.formatContents(conversationHistory, prompt);
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const stream = await this.ai.models.generateContentStream({
          model: this.model,
          contents,
          config: {
            temperature,
            maxOutputTokens,
            systemInstruction: SYSTEM_PROMPT,
            tools: [{ googleSearch: {} }],
          },
        });

        let fullText = '';
        let groundingMetadata = null;
        let hasContent = false;

        for await (const chunk of stream) {
          const candidate = chunk.candidates?.[0];
          if (!candidate) continue;

          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.thought) {
                hasContent = true;
                yield { type: 'thinking', content: part.thought, timestamp: Date.now() };
              }
              if (part.text) {
                hasContent = true;
                fullText += part.text;
                yield { type: 'text', content: part.text, timestamp: Date.now() };
              }
            }
          }

          // Grounding metadata arrives in the final chunk
          if (candidate.groundingMetadata) {
            groundingMetadata = candidate.groundingMetadata;
          }
        }

        if (!hasContent || !fullText.trim()) {
          throw new Error('Stream completed but no content received');
        }

        const references = this.extractReferences(groundingMetadata);
        const citations = this._extractCitations(groundingMetadata);
        const elapsed = Date.now() - startTime;

        // Final metadata event
        yield {
          type: 'metadata',
          data: {
            content: fullText,
            references,
            citations,
            metadata: {
              model: this.model,
              agent: 'search',
              grounded: true,
              totalSources: references.length,
              searchQueries: groundingMetadata?.webSearchQueries ?? [],
              elapsed,
              timestamp: new Date().toISOString(),
            },
          },
          timestamp: Date.now(),
        };

        return; // success — exit retry loop
      } catch (error) {
        lastError = error;
        logger.warn(`executeStreamingSearch attempt ${attempt}/${MAX_RETRIES} failed`, {
          error: error.message,
        });
        if (attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    logger.error('executeStreamingSearch exhausted retries', {
      error: lastError?.message,
    });
    throw lastError;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Content formatting (mirrors monolith's formatGeminiContents)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Format conversation history + final prompt into Gemini-compatible
   * alternating user/model format with proper merging of consecutive roles.
   */
  formatContents(conversationHistory, finalPrompt) {
    const messages = [];

    // 1. Sanitize history
    if (Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        if (!msg) continue;
        const role = msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';

        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content.trim();
        } else if (Array.isArray(msg.content)) {
          text = msg.content
            .map((part) => (typeof part === 'string' ? part : part.text || ''))
            .join('\n')
            .trim();
        }

        if (!text) continue; // skip empties
        messages.push({ role, text });
      }
    }

    // 2. Append final prompt
    if (typeof finalPrompt === 'string' && finalPrompt.trim()) {
      messages.push({ role: 'user', text: finalPrompt.trim() });
    }

    if (messages.length === 0) {
      return [{ role: 'user', parts: [{ text: 'Hello' }] }];
    }

    // 3. Merge consecutive same-role messages (Gemini requires alternation)
    const finalized = [];
    for (const msg of messages) {
      if (finalized.length === 0) {
        // Gemini requires first message to be 'user'
        if (msg.role === 'user') {
          finalized.push({ role: 'user', parts: [{ text: msg.text }] });
        }
        // Drop leading model messages
      } else {
        const last = finalized[finalized.length - 1];
        if (last.role === msg.role) {
          last.parts[0].text += '\n\n' + msg.text;
        } else {
          finalized.push({ role: msg.role, parts: [{ text: msg.text }] });
        }
      }
    }

    if (finalized.length === 0) {
      return [{ role: 'user', parts: [{ text: finalPrompt || 'Hello' }] }];
    }

    return finalized;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Reference / citation extraction
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Extract deduplicated references from Gemini's groundingMetadata.groundingChunks.
   * @param {object|null} groundingMetadata
   * @returns {Array<{ url: string, domain: string, title: string }>}
   */
  extractReferences(groundingMetadata) {
    if (!groundingMetadata?.groundingChunks) return [];

    const seen = new Set();
    const refs = [];

    for (const chunk of groundingMetadata.groundingChunks) {
      const web = chunk.web;
      if (!web?.uri) continue;

      const url = web.uri;
      if (seen.has(url)) continue;
      seen.add(url);

      let domain = '';
      try {
        domain = new URL(url).hostname.replace(/^www\./, '');
      } catch { /* ignore malformed URLs */ }

      refs.push({
        url,
        domain,
        title: web.title || domain,
      });
    }

    return refs;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Extract citations (inline source markers) from groundingMetadata.groundingSupports.
   */
  _extractCitations(groundingMetadata) {
    if (!groundingMetadata?.groundingSupports) return [];

    return groundingMetadata.groundingSupports.map((support, idx) => ({
      index: idx,
      text: support.segment?.text ?? '',
      startIndex: support.segment?.startIndex ?? 0,
      endIndex: support.segment?.endIndex ?? 0,
      chunkIndices: support.groundingChunkIndices ?? [],
      confidenceScores: support.confidenceScores ?? [],
    }));
  }

  /**
   * Extract all text parts from a Gemini generateContent result.
   */
  _extractText(result) {
    const parts = result.candidates?.[0]?.content?.parts;
    if (!parts) return '';
    return parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join('');
  }

  /**
   * Wrap a promise with a timeout.
   */
  async _callWithTimeout(fn, timeoutMs) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }
}

export default SearchService;
