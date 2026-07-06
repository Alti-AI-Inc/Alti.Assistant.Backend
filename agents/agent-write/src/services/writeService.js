/**
 * @fileoverview Write Agent service layer — production implementation.
 *
 * Calls Gemini 1.5 Pro via Vertex AI for high-quality
 * document generation.
 */

import { GoogleGenAI } from '@google/genai';
import { createLogger } from '../../../../shared/logging/index.js';
import config from '../../../../shared/config/index.js';
import agentConfig from '../config/index.js';

const { logger } = createLogger('write-service');

// ── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert professional writer and document creator. You produce polished,
well-structured documents tailored to the audience and purpose.

Capabilities:
- Business documents (proposals, reports, memos, executive summaries)
- Creative writing (articles, blog posts, marketing copy, storytelling)
- Technical writing (documentation, guides, specifications, white papers)
- Academic writing (research summaries, literature reviews, abstracts)
- Communication (emails, presentations, speeches, press releases)

Rules:
- Always structure documents with clear headings and sections
- Use appropriate tone for the audience
- Include relevant details and examples
- Ensure logical flow and coherent arguments
- Use markdown formatting for structure`;

export class WriteService {
  constructor() {
    this.ai = new GoogleGenAI({ 
      vertexai: { project: config.gcp.projectId, location: config.gcp.vertexAiRegion || 'us-central1' } 
    });
    this.modelId = 'gemini-1.5-pro';

    logger.info('WriteService initialized with Vertex AI Gemini', {
      model: this.modelId,
      location: config.gcp.vertexAiRegion || 'us-central1',
      projectId: config.gcp.projectId ? '***' : 'NOT SET',
    });
  }

  // ── Core Gemini Call ─────────────────────────────────────────────────────
  /**
   * Sends a request to Gemini on Vertex AI.
   *
   * @param {string} systemInstruction - The system instructions
   * @param {string} userPrompt - The user's prompt
   * @param {{ maxTokens?: number, temperature?: number }} options
   * @returns {Promise<{ text: string, usage: object }>}
   */
  async callGemini(systemInstruction, userPrompt, options = {}) {
    if (!config.gcp.projectId) {
      throw new Error('GCP_PROJECT_ID is not set — cannot call Vertex AI.');
    }

    const requestConfig = {
      systemInstruction: systemInstruction,
      maxOutputTokens: options.maxTokens || 4096,
      temperature: options.temperature !== undefined ? options.temperature : 0.2,
    };

    logger.info('Calling Gemini via Vertex AI', {
      model: this.modelId,
      maxTokens: requestConfig.maxOutputTokens,
    });

    const startTime = Date.now();
    const result = await this.ai.models.generateContent({
      model: this.modelId,
      contents: userPrompt,
      config: requestConfig
    });
    const latencyMs = Date.now() - startTime;

    const replyText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = result.usageMetadata || {};

    logger.info('Gemini response received', {
      latencyMs,
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
      responseLength: replyText.length,
    });

    return { 
      text: replyText, 
      usage: {
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: usage.candidatesTokenCount || 0
      }
    };
  }

  // ── Document Generation ──────────────────────────────────────────────────
  /**
   * Full document generation pipeline via the LangGraph workflow.
   * Falls back to a direct single-call if the workflow is not available.
   *
   * @param {string} prompt - The user's writing prompt / instructions
   * @param {{ userId?: string, email?: string, plan?: string }} userContext
   * @param {{ documentType?: string, tone?: string, maxLength?: number, audience?: string }} options
   * @returns {Promise<{ content: string, outline: string, metadata: object }>}
   */
  async generateDocument(prompt, userContext, options = {}) {
    const startTime = Date.now();

    logger.info('Starting document generation', {
      userId: userContext?.userId,
      documentType: options.documentType || 'general',
      model: this.modelId,
    });

    // Import workflow dynamically to avoid circular deps
    const { writeGraph } = await import('../agent/workflow.js');

    const result = await writeGraph.invoke({
      prompt,
      documentType: options.documentType || 'general',
      tone: options.tone || 'professional',
      audience: options.audience || 'general',
      maxLength: options.maxLength || 0,
      userContext: JSON.stringify(userContext || {}),
    });

    const durationMs = Date.now() - startTime;

    logger.info('Document generation complete', {
      userId: userContext?.userId,
      durationMs,
      finalDocumentLength: result.finalDocument?.length || 0,
    });

    return {
      content: result.finalDocument,
      outline: result.outline,
      metadata: {
        model: this.modelId,
        agent: 'write',
        documentType: result.documentType,
        tone: result.tone,
        audience: result.audience,
        durationMs,
        generatedAt: new Date().toISOString(),
        userId: userContext?.userId,
        usage: result.usage || {},
      },
    };
  }

  // ── Document Export ──────────────────────────────────────────────────────
  /**
   * Export a document to the specified format.
   * Currently supports markdown (passthrough), HTML, and plain text.
   *
   * @param {string} content - The document content (markdown)
   * @param {'markdown' | 'html' | 'text'} format - Target export format
   * @returns {Promise<{ content: string, format: string, metadata: object }>}
   */
  async exportDocument(content, format = 'markdown') {
    logger.info('Exporting document', { format, contentLength: content.length });

    let exported;

    switch (format) {
      case 'html':
        exported = this._markdownToHtml(content);
        break;
      case 'text':
        exported = this._markdownToText(content);
        break;
      case 'markdown':
      default:
        exported = content;
        break;
    }

    return {
      content: exported,
      format,
      metadata: {
        agent: 'write',
        exportedAt: new Date().toISOString(),
        contentLength: exported.length,
        originalLength: content.length,
      },
    };
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Basic markdown → HTML conversion.
   * Handles headings, bold, italic, lists, code blocks, and paragraphs.
   */
  _markdownToHtml(md) {
    let html = md
      // Code blocks (fenced)
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // Headings
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold & italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Unordered lists
      .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
      // Horizontal rules
      .replace(/^---$/gm, '<hr>')
      // Line breaks → paragraphs (double newline)
      .replace(/\n\n/g, '</p><p>');

    // Wrap list items in <ul>
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Document</title></head>
<body>
<p>${html}</p>
</body>
</html>`;
  }

  /**
   * Strip markdown formatting to produce plain text.
   */
  _markdownToText(md) {
    return md
      .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').trim())
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^\s*[-*] /gm, '• ')
      .replace(/^---$/gm, '────────────────────')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
  }
}

export default WriteService;
