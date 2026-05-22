import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';

/**
 * Claude Service mapped to Google Generative AI
 * Handles all interactions with Gemini under the hood to completely replace Claude
 */
class ClaudeService {
  constructor() {
    this.modelName = 'gemini-3.5-flash';
    this.client = null;
    this.initialized = false;
  }

  /**
   * Initialize the Gemini client
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      console.log('🔧 Initializing Gemini service (mapped to Claude)...');
      console.log(`📍 Model: ${this.modelName}`);

      // Initialize Gemini client
      this.client = new GoogleGenerativeAI(config.gemini_secret_key || process.env.GEMINI_API_KEY);

      this.initialized = true;
      console.log('✅ Gemini service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Gemini service:', error);
      throw new Error(`Gemini initialization failed: ${error.message}`);
    }
  }

  /**
   * Call Gemini via direct Google Generative AI API with mocked Anthropic output structure
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Additional options (maxTokens, temperature, tools, etc.)
   * @returns {Promise<Object>} - Mocked Anthropic response
   */
  async callClaude(messages, options = {}) {
    await this.initialize();

    try {
      console.log(`🤖 Calling Gemini (mocked as Claude Sonnet 4.5)...`);
      console.log(`📝 Messages: ${messages.length} messages`);

      // Inject Massive.com real-time financial data if applicable
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      let enhancedSystem = options.system || '';
      if (lastUserMsg && lastUserMsg.content) {
        try {
          const userText = typeof lastUserMsg.content === 'string'
            ? lastUserMsg.content
            : lastUserMsg.content?.[0]?.text || '';
          const enhanced = await massiveSmartRouter.combinedRouteAndEnhancePrompt(userText);
          if (enhanced !== userText) {
            // Prepend Massive context as system-level instruction
            enhancedSystem = enhanced + '\n\n' + enhancedSystem;
          }
        } catch (err) {
          console.warn('Massive.com enhancement failed for Gemini, continuing:', err.message);
        }
      }

      // Convert messages to Gemini format (alternate user/model)
      const contents = [];
      for (const msg of messages) {
        if (msg.role === 'system') {
          const sysText = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
          if (sysText) {
            enhancedSystem = enhancedSystem ? `${sysText}\n\n${enhancedSystem}` : sysText;
          }
          continue;
        }
        
        let role = msg.role;
        if (role === 'assistant') {
          role = 'model';
        } else if (role !== 'user' && role !== 'model') {
          role = 'user';
        }
        
        const text = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
        
        // Gemini doesn't allow empty parts
        if (!text) continue;
        
        // Gemini expects alternate user/model roles. If last message had the same role, merge parts.
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts.push({ text });
        } else {
          contents.push({
            role,
            parts: [{ text }]
          });
        }
      }

      // Ensure valid alternation structure
      if (contents.length > 0 && contents[0].role === 'model') {
        contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
      }

      const modelOptions = { model: this.modelName };
      if (enhancedSystem) {
        modelOptions.systemInstruction = enhancedSystem;
      }

      const model = this.client.getGenerativeModel(modelOptions);

      const generationConfig = {
        maxOutputTokens: options.maxTokens || config.claude.maxTokens,
        temperature: options.temperature || config.claude.temperature,
      };
      if (options.topP !== undefined) generationConfig.topP = options.topP;

      const startTime = Date.now();
      const result = await model.generateContent({
        contents,
        generationConfig
      });
      const duration = Date.now() - startTime;

      const replyText = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Mock the response structure of Anthropic Claude so downstream callers continue to work
      const response = {
        id: `mock-claude-msg-${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: this.modelName,
        content: [
          {
            type: 'text',
            text: replyText
          }
        ],
        usage: {
          input_tokens: Math.round(contents.reduce((acc, c) => acc + (c.parts[0]?.text?.length || 0), 0) / 4),
          output_tokens: Math.round(replyText.length / 4)
        }
      };

      console.log(`✅ Gemini response received in ${duration}ms`);
      console.log(`📊 Tokens - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`);

      return response;
    } catch (error) {
      console.error('❌ Error calling Gemini:', error);
      throw new Error(`Gemini API call failed: ${error.message}`);
    }
  }

  /**
   * Call Gemini with streaming support, mocked as Anthropic
   */
  async streamClaude(messages, options = {}) {
    await this.initialize();

    try {
      console.log(`🌊 Streaming from Gemini (mocked as Claude Sonnet 4.5)...`);

      let enhancedSystem = options.system || '';
      const contents = [];
      for (const msg of messages) {
        if (msg.role === 'system') {
          const sysText = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
          if (sysText) {
            enhancedSystem = enhancedSystem ? `${sysText}\n\n${enhancedSystem}` : sysText;
          }
          continue;
        }
        
        let role = msg.role;
        if (role === 'assistant') {
          role = 'model';
        } else if (role !== 'user' && role !== 'model') {
          role = 'user';
        }
        
        const text = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
        if (!text) continue;
        
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts.push({ text });
        } else {
          contents.push({
            role,
            parts: [{ text }]
          });
        }
      }

      if (contents.length > 0 && contents[0].role === 'model') {
        contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
      }

      const modelOptions = { model: this.modelName };
      if (enhancedSystem) {
        modelOptions.systemInstruction = enhancedSystem;
      }

      const model = this.client.getGenerativeModel(modelOptions);

      const generationConfig = {
        maxOutputTokens: options.maxTokens || config.claude.maxTokens,
        temperature: options.temperature || config.claude.temperature,
      };

      const resultStream = await model.generateContentStream({
        contents,
        generationConfig
      });

      console.log('✅ Gemini streaming started');
      
      // We will create a custom async generator mapping the chunks to the expected Anthropic event style
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            yield {
              type: 'content_block_delta',
              delta: {
                type: 'text_delta',
                text: chunkText
              }
            };
          }
        }
      };

      return mockStream;
    } catch (error) {
      console.error('❌ Error streaming from Gemini:', error);
      throw new Error(`Gemini streaming failed: ${error.message}`);
    }
  }

  /**
   * Call Gemini with retry logic
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

        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Check if the service is properly configured
   */
  async checkConfiguration() {
    const status = {
      configured: false,
      modelName: this.modelName,
      apiKeyConfigured: !!(config.gemini_secret_key || process.env.GEMINI_API_KEY),
      errors: [],
    };

    try {
      if (!(config.gemini_secret_key || process.env.GEMINI_API_KEY)) {
        status.errors.push('Gemini API key not configured');
        return status;
      }

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
      provider: 'google',
    };
  }
}

// Export singleton instance
const claudeService = new ClaudeService();

export default claudeService;
export { ClaudeService };

