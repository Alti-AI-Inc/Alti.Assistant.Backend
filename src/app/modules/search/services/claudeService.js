import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';

/**
 * Claude Service mapped to Google Generative AI.
 * Handles all interactions with Gemini under the hood to completely replace Claude.
 * This service provides methods to interact with the Gemini API,
 * while mimicking the response structure of Anthropic's Claude API
 * for seamless integration with existing systems expecting Claude's output.
 * @class
 */
class ClaudeService {
  /**
   * Creates an instance of ClaudeService.
   * Initializes the model name, client, and sets the initialized flag to false.
   */
  constructor() {
    /**
     * The name of the Gemini model to use.
     * @type {string}
     */
    this.modelName = 'gemini-2.5-flash';
    /**
     * The GoogleGenerativeAI client instance.
     * @type {GoogleGenerativeAI|null}
     */
    this.client = null;
    /**
     * Flag indicating whether the Gemini client has been initialized.
     * @type {boolean}
     */
    this.initialized = false;
  }

  /**
   * Initializes the Gemini client.
   * This method ensures the client is only initialized once.
   * It retrieves the API key from configuration or environment variables.
   * @async
   * @returns {Promise<void>} A promise that resolves when the client is initialized.
   * @throws {Error} If the Gemini API key is missing or initialization fails.
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
   * Calls Gemini via the Google Generative AI API with a mocked Anthropic output structure.
   * This method processes messages, optionally enhances the prompt with Massive.com data,
   * converts messages to Gemini's format, and then calls the Gemini API.
   * The response is then transformed to resemble Anthropic's Claude API response.
   * @async
   * @param {Array<Object>} messages - An array of message objects, each with a `role` and `content`.
   * @param {string} messages[].role - The role of the message sender (e.g., 'user', 'assistant', 'system').
   * @param {string|Array<Object>} messages[].content - The content of the message. Can be a string or an array of content blocks (e.g., `{ type: 'text', text: '...' }`).
   * @param {Object} [options={}] - Additional options for the API call.
   * @param {string} [options.system] - An optional system instruction to prepend to the prompt.
   * @param {number} [options.maxTokens] - The maximum number of tokens to generate in the response. Defaults to `config.claude?.maxTokens` or 4096.
   * @param {number} [options.temperature] - The sampling temperature to use for generation. Defaults to `config.claude?.temperature` or 0.7.
   * @param {number} [options.topP] - The top-p value to use for sampling.
   * @returns {Promise<Object>} A promise that resolves to a mocked Anthropic response object.
   * @returns {string} return.id - A unique identifier for the message.
   * @returns {string} return.type - The type of the response, typically 'message'.
   * @returns {string} return.role - The role of the assistant, 'assistant'.
   * @returns {string} return.model - The name of the model used (e.g., 'gemini-2.5-flash').
   * @returns {Array<Object>} return.content - An array of content blocks.
   * @returns {string} return.content[].type - The type of content, typically 'text'.
   * @returns {string} return.content[].text - The generated text content.
   * @returns {Object} return.usage - Token usage statistics.
   * @returns {number} return.usage.input_tokens - The number of input tokens.
   * @returns {number} return.usage.output_tokens - The number of output tokens.
   * @throws {Error} If the Gemini API call fails.
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
        maxOutputTokens: options.maxTokens || config.claude?.maxTokens || 4096,
        temperature: options.temperature || config.claude?.temperature || 0.7,
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
   * Calls Gemini with streaming support, mocking the Anthropic streaming event structure.
   * This method processes messages, converts them to Gemini's format, and then initiates a streaming call to the Gemini API.
   * It returns an async generator that yields chunks of text in a format similar to Anthropic's `content_block_delta` events.
   * @async
   * @param {Array<Object>} messages - An array of message objects, each with a `role` and `content`.
   * @param {string} messages[].role - The role of the message sender (e.g., 'user', 'assistant', 'system').
   * @param {string|Array<Object>} messages[].content - The content of the message. Can be a string or an array of content blocks.
   * @param {Object} [options={}] - Additional options for the API call.
   * @param {string} [options.system] - An optional system instruction to prepend to the prompt.
   * @param {number} [options.maxTokens] - The maximum number of tokens to generate in the response. Defaults to `config.claude?.maxTokens` or 4096.
   * @param {number} [options.temperature] - The sampling temperature to use for generation. Defaults to `config.claude?.temperature` or 0.7.
   * @returns {Promise<AsyncGenerator<Object>>} A promise that resolves to an async generator yielding mocked Anthropic streaming events.
   * @returns {string} yield.type - The type of streaming event, e.g., 'content_block_delta'.
   * @returns {Object} yield.delta - The delta object containing the change.
   * @returns {string} yield.delta.type - The type of delta, e.g., 'text_delta'.
   * @returns {string} yield.delta.text - The streamed text content.
   * @throws {Error} If the Gemini streaming call fails.
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
        maxOutputTokens: options.maxTokens || config.claude?.maxTokens || 4096,
        temperature: options.temperature || config.claude?.temperature || 0.7,
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
   * Executes an asynchronous function with retry logic using exponential backoff.
   * @template T
   * @async
   * @param {function(): Promise<T>} fn - The asynchronous function to execute.
   * @param {number} [maxRetries=2] - The maximum number of retry attempts.
   * @returns {Promise<T>} A promise that resolves with the result of `fn` upon successful execution.
   * @throws {Error} If the function fails after all retry attempts.
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
   * Checks if the service is properly configured, including the API key and initialization status.
   * @async
   * @returns {Promise<Object>} A promise that resolves to an object containing configuration status.
   * @returns {boolean} return.configured - True if the service is configured and initialized, false otherwise.
   * @returns {string} return.modelName - The name of the Gemini model being used.
   * @returns {boolean} return.apiKeyConfigured - True if an API key is found, false otherwise.
   * @returns {Array<string>} return.errors - An array of error messages if configuration failed.
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
   * Retrieves information about the service.
   * @returns {Object} An object containing information about the service.
   * @returns {string} return.modelName - The name of the Gemini model being used.
   * @returns {boolean} return.initialized - True if the service has been initialized.
   * @returns {string} return.provider - The underlying AI provider, 'google'.
   */
  getServiceInfo() {
    return {
      modelName: this.modelName,
      initialized: this.initialized,
      provider: 'google',
    };
  }
}

/**
 * The singleton instance of the ClaudeService.
 * This instance is used throughout the application to interact with the Gemini API,
 * while maintaining a consistent interface that mimics Anthropic's Claude.
 * @type {ClaudeService}
 * @constant
 */
const claudeService = new ClaudeService();

export default claudeService;
export { ClaudeService };