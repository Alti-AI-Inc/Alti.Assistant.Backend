import Anthropic from '@anthropic-ai/sdk';
import config from '../../../../../config/index.js';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';

/**
 * Claude Service for Claude Sonnet 4.5
 * Handles all interactions with Claude via direct Anthropic API
 */
class ClaudeService {
  constructor() {
    this.modelName = 'claude-sonnet-4-5-20250929';
    this.client = null;
    this.initialized = false;
  }

  /**
   * Initialize the Anthropic client
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      console.log('🔧 Initializing Claude service...');
      console.log(`📍 Model: ${this.modelName}`);

      // Initialize Anthropic client
      this.client = new Anthropic({
        apiKey: config.anthropic.anthropic_api_key,
      });

      this.initialized = true;
      console.log('✅ Claude service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Claude service:', error);
      throw new Error(`Claude initialization failed: ${error.message}`);
    }
  }

  /**
   * Call Claude Sonnet 4.5 via direct Anthropic API
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Additional options (maxTokens, temperature, tools, etc.)
   * @returns {Promise<Object>} - Claude response
   */
  async callClaude(messages, options = {}) {
    await this.initialize();

    try {
      console.log(`🤖 Calling Claude Sonnet 4.5...`);
      console.log(`📝 Messages: ${messages.length} messages`);

      // Inject Massive.com real-time financial data if applicable
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      let enhancedSystem = options.system || '';
      if (lastUserMsg && lastUserMsg.content) {
        try {
          const userText = typeof lastUserMsg.content === 'string'
            ? lastUserMsg.content
            : lastUserMsg.content?.[0]?.text || '';
          const enhanced = await massiveSmartRouter.routeAndEnhancePrompt(userText);
          if (enhanced !== userText) {
            // Prepend Massive context as system-level instruction
            enhancedSystem = enhanced + '\n\n' + enhancedSystem;
          }
        } catch (err) {
          console.warn('Massive.com enhancement failed for Claude, continuing:', err.message);
        }
      }

      const requestParams = {
        model: this.modelName,
        max_tokens: options.maxTokens || config.claude.maxTokens,
        temperature: options.temperature || config.claude.temperature,
        messages: messages,
      };

      // Add system prompt (enhanced with Massive.com data if available)
      if (enhancedSystem) {
        requestParams.system = enhancedSystem;
      }

      // Add tools if provided
      if (options.tools && options.tools.length > 0) {
        requestParams.tools = options.tools;
      }

      // Add top_p if provided
      if (options.topP !== undefined) {
        requestParams.top_p = options.topP;
      }

      // Add top_k if provided
      if (options.topK !== undefined) {
        requestParams.top_k = options.topK;
      }

      const response = await this.client.messages.create(requestParams);

      console.log(`✅ Claude response received`);
      if (response.usage) {
        console.log(
          `📊 Tokens - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`
        );
      }

      return response;
    } catch (error) {
      console.error('❌ Error calling Claude:', error);
      throw new Error(`Claude API call failed: ${error.message}`);
    }
  }

  /**
   * Call Claude with streaming support
   * @param {Array} messages - Array of message objects
   * @param {Object} options - Additional options
   * @returns {Promise<Stream>} - Streaming response
   */
  async streamClaude(messages, options = {}) {
    await this.initialize();

    try {
      console.log(`🌊 Streaming from Claude Sonnet 4.5...`);

      const requestParams = {
        model: this.modelName,
        max_tokens: options.maxTokens || config.claude.maxTokens,
        temperature: options.temperature || config.claude.temperature,
        messages: messages,
        stream: true,
      };

      // Add system prompt if provided
      if (options.system) {
        requestParams.system = options.system;
      }

      // Add tools if provided
      if (options.tools && options.tools.length > 0) {
        requestParams.tools = options.tools;
      }

      const stream = await this.client.messages.stream(requestParams);

      console.log('✅ Streaming started');
      return stream;
    } catch (error) {
      console.error('❌ Error streaming from Claude:', error);
      throw new Error(`Claude streaming failed: ${error.message}`);
    }
  }

  /**
   * Call Claude with retry logic
   * @param {Function} fn - Function to execute
   * @param {Number} maxRetries - Maximum number of retries
   * @returns {Promise<any>} - Result of the function
   */
  async callWithRetry(fn, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        console.error(`❌ Attempt ${attempt + 1} failed:`, error.message);

        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Check if the service is properly configured
   * @returns {Promise<Object>} - Configuration status
   */
  async checkConfiguration() {
    const status = {
      configured: false,
      modelName: this.modelName,
      apiKeyConfigured: !!config.anthropic.anthropic_api_key,
      errors: [],
    };

    try {
      // Check if API key exists
      if (!config.anthropic.anthropic_api_key) {
        status.errors.push('Anthropic API key not configured');
        return status;
      }

      // Try to initialize
      await this.initialize();
      status.configured = true;
    } catch (error) {
      status.errors.push(error.message);
    }

    return status;
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      modelName: this.modelName,
      initialized: this.initialized,
      provider: 'anthropic',
    };
  }
}

// Export singleton instance
const claudeService = new ClaudeService();

export default claudeService;
export { ClaudeService };
