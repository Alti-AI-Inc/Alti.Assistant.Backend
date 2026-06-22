import { GoogleAuth } from 'google-auth-library';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

// Initialize GCP authentication
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

/**
 * Service to interact directly with Anthropic Claude models on Google Cloud Vertex AI Model Garden.
 */
class VertexClaudeService {
  constructor() {
    this.modelId = 'claude-4-5-sonnet@20250219';
    this.defaultLocation = 'us-east5'; // Default region where Claude 4.5 Sonnet is highly available
  }

  /**
   * Prepares and formats system and user messages for the Anthropic Messages API.
   * Ensures system instructions are pulled to the top-level, and roles strictly alternate.
   * 
   * @param {Array<object>} messages - Input message history [{ role, content }]
   * @returns {object} Formatted { systemPrompt, formattedMessages }
   */
  preparePayload(messages) {
    let systemPrompt = '';
    const formattedMessages = [];

    // 1. Extract system instructions
    const systemParts = [];
    const chatMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        const text = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
        if (text) systemParts.push(text);
      } else {
        chatMessages.push(msg);
      }
    }

    if (systemParts.length > 0) {
      systemPrompt = systemParts.join('\n\n');
    }

    // 2. Format and alternate roles (user vs assistant)
    for (const msg of chatMessages) {
      let role = msg.role;
      if (role === 'assistant' || role === 'model') {
        role = 'assistant';
      } else {
        role = 'user';
      }

      const text = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
      if (!text) continue; // Skip empty content blocks

      // If last message has the same role, merge their content to preserve alternation
      if (formattedMessages.length > 0 && formattedMessages[formattedMessages.length - 1].role === role) {
        formattedMessages[formattedMessages.length - 1].content += '\n\n' + text;
      } else {
        formattedMessages.push({
          role,
          content: text
        });
      }
    }

    // 3. Ensure the conversation starts with a user message
    if (formattedMessages.length > 0 && formattedMessages[0].role === 'assistant') {
      formattedMessages.unshift({
        role: 'user',
        content: 'Hello'
      });
    }

    return {
      systemPrompt,
      formattedMessages
    };
  }

  /**
   * Invokes Claude Sonnet 4.5 via Vertex AI rawPredict REST API.
   * 
   * @param {Array<object>} messages - Message history
   * @param {object} [options={}] - Custom generation parameters
   * @returns {Promise<object>} Response containing the generated text
   */
  async generateText(messages, options = {}) {
    try {
      const projectId = config.google.gcp_project_id || config.gcp.projectId || process.env.GCP_PROJECT_ID;
      const location = config.google.gcp_location || config.google.vertex_ai_region || config.gcp.location || this.defaultLocation;

      if (!projectId) {
        throw new Error('GCP Project ID is not configured.');
      }

      logger.info(`Vertex Claude: Sending request to Claude Sonnet 4.5 in region ${location}...`);

      const { systemPrompt, formattedMessages } = this.preparePayload(messages);

      const client = await auth.getClient();
      const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/anthropic/models/${this.modelId}:rawPredict`;

      const requestBody = {
        anthropic_version: 'vertex-2023-10-16',
        messages: formattedMessages,
        max_tokens: options.maxTokens || options.max_tokens || 4096,
        temperature: options.temperature !== undefined ? options.temperature : 0.2,
      };

      if (systemPrompt) {
        requestBody.system = systemPrompt;
      }

      const response = await client.request({
        url: endpoint,
        method: 'POST',
        data: requestBody
      });

      const responseData = response.data || {};
      const replyText = responseData.content?.[0]?.text || '';
      
      const usage = responseData.usage || {
        input_tokens: Math.round(JSON.stringify(formattedMessages).length / 4),
        output_tokens: Math.round(replyText.length / 4)
      };

      logger.info('Vertex Claude: Request processed successfully.');

      return {
        text: replyText,
        content: [
          {
            type: 'text',
            text: replyText
          }
        ],
        usage
      };
    } catch (err) {
      logger.error('Vertex Claude Service Error:', err);
      throw new Error(`Vertex Claude invocation failed: ${err.message}`);
    }
  }
}

export const vertexClaudeService = new VertexClaudeService();
export default vertexClaudeService;
