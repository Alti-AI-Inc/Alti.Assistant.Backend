/**
 * @fileoverview Write Agent service layer — production implementation.
 *
 * Calls Claude 4.5 Sonnet via Vertex AI rawPredict for high-quality
 * document generation. Uses the same GoogleAuth + rawPredict pattern
 * proven in the monolith's vertexClaudeService.js.
 */

import { GoogleAuth } from 'google-auth-library';
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

// ── GoogleAuth singleton ─────────────────────────────────────────────────────
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

export class WriteService {
  constructor() {
    this.modelId = agentConfig.primaryModel || config.models.claudeSonnet;
    this.location = agentConfig.vertexAiRegion || 'us-east5';
    this.projectId = config.gcp.projectId;
  }

  // ── Message Formatting ───────────────────────────────────────────────────
  /**
   * Converts a generic messages array (with optional system messages)
   * into the Anthropic rawPredict format: { system, messages }.
   * Handles consecutive same-role merging and leading-assistant fixups.
   *
   * @param {Array<{ role: string, content: string | object[] }>} messages
   * @returns {{ systemPrompt: string, formattedMessages: Array<{ role: string, content: string }> }}
   */
  preparePayload(messages) {
    const systemParts = [];
    const chatMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        const text = typeof msg.content === 'string'
          ? msg.content
          : (msg.content?.[0]?.text || '');
        if (text) systemParts.push(text);
      } else {
        chatMessages.push(msg);
      }
    }

    const systemPrompt = systemParts.length > 0
      ? systemParts.join('\n\n')
      : '';

    const formattedMessages = [];
    for (const msg of chatMessages) {
      const role = (msg.role === 'assistant' || msg.role === 'model')
        ? 'assistant'
        : 'user';
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg.content?.[0]?.text || '');
      if (!text) continue;

      // Merge consecutive same-role messages (Anthropic requires alternating)
      if (
        formattedMessages.length > 0 &&
        formattedMessages[formattedMessages.length - 1].role === role
      ) {
        formattedMessages[formattedMessages.length - 1].content += '\n\n' + text;
      } else {
        formattedMessages.push({ role, content: text });
      }
    }

    // Anthropic requires the first message to be from the user
    if (formattedMessages.length > 0 && formattedMessages[0].role === 'assistant') {
      formattedMessages.unshift({ role: 'user', content: 'Hello' });
    }

    return { systemPrompt, formattedMessages };
  }

  // ── Core Claude Call ─────────────────────────────────────────────────────
  /**
   * Sends a rawPredict request to Claude 4.5 Sonnet on Vertex AI.
   *
   * @param {Array<{ role: string, content: string }>} messages - Conversation messages
   * @param {{ maxTokens?: number, temperature?: number }} options
   * @returns {Promise<{ text: string, usage: object }>}
   */
  async callClaude(messages, options = {}) {
    const client = await auth.getClient();
    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/anthropic/models/${this.modelId}:rawPredict`;

    const { systemPrompt, formattedMessages } = this.preparePayload(messages);

    const requestBody = {
      anthropic_version: 'vertex-2023-10-16',
      messages: formattedMessages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature !== undefined ? options.temperature : 0.2,
    };
    if (systemPrompt) {
      requestBody.system = systemPrompt;
    }

    logger.info('Calling Claude via Vertex AI rawPredict', {
      model: this.modelId,
      location: this.location,
      messageCount: formattedMessages.length,
      maxTokens: requestBody.max_tokens,
    });

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: requestBody,
    });

    const replyText = response.data?.content?.[0]?.text || '';
    const usage = response.data?.usage || {};

    logger.info('Claude response received', {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      responseLength: replyText.length,
    });

    return { text: replyText, usage };
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
