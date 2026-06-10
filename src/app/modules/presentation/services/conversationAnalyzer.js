import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  PRESENTATION_INTENTS,
  TEMPLATES,
  THEMES,
  TONES,
  VERBOSITY_OPTIONS,
  IMAGE_TYPES,
  EXPORT_FORMATS,
} from '../presentation.constant.js';

// Token limits and thresholds
/**
 * @const {number} MAX_TOKENS_FOR_CONTEXT
 * @description A conservative token limit for the context sent to the AI model to prevent exceeding its capacity.
 * Gemini 2.5 Flash supports a much larger context window, but this keeps requests fast and manageable.
 */
const MAX_TOKENS_FOR_CONTEXT = 6000;

/**
 * @const {number} SUMMARIZATION_THRESHOLD
 * @description The token count at which the conversation history should be summarized to reduce context size.
 */
const SUMMARIZATION_THRESHOLD = 5000;

/**
 * @const {number} MAX_USER_MESSAGE_LENGTH
 * @description The maximum character length for a single user message to prevent abuse or excessive token usage.
 */
const MAX_USER_MESSAGE_LENGTH = 20000;

/**
 * @const {number} MAX_HISTORY_MESSAGES
 * @description The maximum number of recent messages to keep in the conversation history to protect performance and manage context.
 */
const MAX_HISTORY_MESSAGES = 15;

/**
 * AI-powered conversation analyzer for presentation generation.
 * This class uses Google's Gemini models to understand user intent, extract parameters for presentation creation,
 * and manage conversation context.
 * @class ConversationAnalyzer
 */
class ConversationAnalyzer {
  /**
   * Initializes the ConversationAnalyzer by setting up the Gemini AI models.
   * @constructor
   */
  constructor() {
    const apiKey = config.gemini_secret_key;
    if (!apiKey) {
      logger.error('Gemini API key is missing in configuration');
    }

    /**
     * The primary model for intent analysis and parameter extraction.
     * Configured with a lower temperature for more deterministic and structured output.
     * @type {ChatGoogleGenerativeAI}
     */
    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: apiKey || 'dummy-key-to-prevent-crash',
      temperature: 0.3, // Lower temperature for more consistent parameter extraction
      maxOutputTokens: 2048,
    });

    /**
     * A separate model instance used specifically for summarizing long conversations.
     * @type {ChatGoogleGenerativeAI}
     */
    this.summarizerModel = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: apiKey || 'dummy-key-to-prevent-crash',
      temperature: 0.5,
      maxOutputTokens: 1000,
    });
  }

  /**
   * Estimates the token count of a given text.
   * This is a rough approximation where 1 token is about 4 characters.
   * @private
   * @param {string} text - The text to estimate tokens for.
   * @returns {number} The estimated token count.
   */
  _estimateTokens(text) {
    if (typeof text !== 'string') return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculates the total estimated token count for the conversation history and existing parameters.
   * @private
   * @param {Array<Object>} conversationHistory - An array of message objects.
   * @param {Object} existingParams - The currently collected parameters.
   * @returns {number} The total estimated token count.
   */
  _calculateConversationTokens(conversationHistory, existingParams) {
    let totalTokens = 0;

    // Estimate tokens for conversation history
    if (Array.isArray(conversationHistory)) {
      conversationHistory.forEach((msg) => {
        if (msg && msg.content) {
          totalTokens += this._estimateTokens(msg.content);
        }
      });
    }

    // Estimate tokens for parameters
    if (existingParams) {
      totalTokens += this._estimateTokens(JSON.stringify(existingParams));
    }

    // Add system prompt tokens (approximately 800 tokens)
    totalTokens += 800;

    return totalTokens;
  }

  /**
   * Summarizes the conversation history to reduce token usage when it becomes too long.
   * @async
   * @param {Array<Object>} conversationHistory - The full conversation history.
   * @param {Object} existingParams - The parameters collected so far.
   * @returns {Promise<string>} A summarized version of the conversation.
   */
  async summarizeConversation(conversationHistory, existingParams) {
    try {
      if (!config.gemini_secret_key) {
        throw new Error('Gemini API key is not configured.');
      }

      const safeHistory = Array.isArray(conversationHistory)
        ? conversationHistory.slice(-MAX_HISTORY_MESSAGES)
        : [];

      const conversationText = safeHistory
        .filter(msg => msg && msg.role && msg.content)
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n');

      const prompt = `Summarize the following conversation about presentation generation. Focus on:
1. The main topic/content the user wants in their presentation
2. Any specific requirements mentioned (slides, template, theme, tone, etc.)
3. Key decisions made
4. Current stage of the conversation

Keep the summary concise but include all important details.

Conversation:
${conversationText}

Parameters collected so far:
${JSON.stringify(existingParams || {}, null, 2)}

Provide a brief summary (max 200 words):`;

      const response = await this.summarizerModel.invoke(prompt);
      const summary = response.content.trim();

      logger.info('Conversation summarized', {
        originalMessages: safeHistory.length,
        summaryLength: summary.length,
        estimatedTokens: this._estimateTokens(summary),
      });

      return summary;
    } catch (error) {
      logger.error('Error summarizing conversation:', error);
      // Fallback: return a basic summary to ensure user session is not interrupted
      return `Previous conversation about creating a presentation. Parameters: ${JSON.stringify(existingParams || {})}`;
    }
  }

  /**
   * Analyzes the user's message to determine their intent and extract relevant parameters for presentation generation.
   * @async
   * @param {string} userMessage - The current message from the user.
   * @param {Array<Object>} [conversationHistory=[]] - The history of the conversation.
   * @param {Object} [existingParams={}] - Parameters that have already been collected in the conversation.
   * @param {string|null} [conversationSummary=null] - An optional pre-computed summary of the conversation to save tokens.
   * @returns {Promise<Object>} An object containing the analysis result, including intent, parameters, missing fields, and a follow-up question.
   * @property {string} intent - The detected user intent (e.g., 'generate', 'edit').
   * @property {Object} parameters - The extracted parameters for the presentation.
   * @property {Array<string>} missingRequired - A list of required parameters that are still missing.
   * @property {string|null} followUpQuestion - A suggested question to ask the user to gather missing information.
   * @property {number} confidence - The AI's confidence in its analysis (0.0 to 1.0).
   * @property {string} reasoning - The AI's reasoning for its conclusion.
   */
  async analyzeIntent(
    userMessage,
    conversationHistory = [],
    existingParams = {},
    conversationSummary = null
  ) {
    try {
      if (!config.gemini_secret_key) {
        throw new Error('Gemini API key is not configured.');
      }

      // Input validation and sanitization to prevent prompt injection or memory exhaustion
      const sanitizedMessage = typeof userMessage === 'string'
        ? userMessage.substring(0, MAX_USER_MESSAGE_LENGTH)
        : '';

      const safeHistory = Array.isArray(conversationHistory)
        ? conversationHistory.slice(-MAX_HISTORY_MESSAGES)
        : [];

      const safeParams = (existingParams && typeof existingParams === 'object')
        ? JSON.parse(JSON.stringify(existingParams)) // Deep copy to prevent mutation
        : {};

      // Calculate token usage
      const estimatedTokens = this._calculateConversationTokens(
        safeHistory,
        safeParams
      );

      logger.info('Token estimation', {
        estimatedTokens,
        threshold: SUMMARIZATION_THRESHOLD,
        willUseSummary: conversationSummary ? true : false,
        historyLength: safeHistory.length,
      });

      const systemPrompt = this._buildSystemPrompt();
      const userPrompt = this._buildUserPrompt(
        sanitizedMessage,
        safeHistory,
        safeParams,
        conversationSummary
      );

      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

      // Log the actual prompt being sent (truncated for readability)
      logger.info('Prompt preview', {
        userPromptStart: userPrompt.substring(0, 500),
        conversationHistoryCount: safeHistory.length,
        hasExistingParams: Object.keys(safeParams).length > 0,
      });

      const response = await this.model.invoke(fullPrompt);

      const result = this._parseResponse(response.content);
      logger.info('Intent analysis result:', result);

      return result;
    } catch (error) {
      logger.error('Error analyzing intent:', error);
      throw error;
    }
  }

  /**
   * Builds the system prompt that instructs the AI on how to perform intent analysis.
   * This prompt defines the rules, available parameters, intents, and output format.
   * @private
   * @returns {string} The system prompt string.
   */
  _buildSystemPrompt() {
    return `You are an AI assistant specialized in understanding user requests for presentation generation. Your job is to:

1. **Identify the user's intent** from these options:
   - generate: User wants to create a new presentation from scratch
   - generate_async: User wants to create a presentation asynchronously (for large/complex presentations)
   - check_status: User wants to check the status of an async generation task
   - edit: User wants to modify SPECIFIC SLIDE CONTENT in an existing presentation
   - derive: User wants to REGENERATE a presentation with different settings (add/remove slides, change tone/theme/template, etc.)
   - get_info: User wants to get information about an existing presentation
   - general_question: User is asking a general question about presentation features

**CRITICAL DISTINCTION - EDIT vs DERIVE:**

**EDIT Intent** - ONLY for changing content WITHIN existing slides:
- "Change slide 3 title to 'Introduction'"
- "Update the company name on slide 5 to 'TechCorp'"
- "Edit slide 2 body text"
- "Modify the bullet points on slide 7"
- "Make slide 1 title more catchy"
- "Update first slide content"
→ Requires: presentationId + slides array with content changes
→ Slide numbering: When user says "slide 1", "first slide", or "no 1 slide", use index: 0 (0-based indexing)
→ Example: { "presentationId": "abc-123", "slides": [{ "index": 2, "content": { "title": "New Title" } }] }

**CRITICAL FOR EDIT INTENT - Slide Index Conversion:**
- User says "slide 1" or "first slide" → use index: 0
- User says "slide 2" or "second slide" → use index: 1
- User says "slide 3" → use index: 2
- Always subtract 1 from the slide number the user mentions

**CRITICAL FOR EDIT INTENT - Content Field Generation:**
When user requests content changes, intelligently determine what fields to update:
- "change title" → { "title": "new title text" }
- "update company name" → { "companyName": "new name" } or { "company_name": "new name" }
- "modify bullets" → { "bullets": ["point 1", "point 2"] }
- "make it catchy" → Use AI creativity to generate an improved version
- "add more detail" → { "body": "enhanced detailed text" }

If user asks to "make it catchy" or "improve" without specifying exact text:
1. Look at conversation history to understand the presentation topic
2. Generate appropriate catchy/improved content based on context
3. Include the generated content in the slides array

**DERIVE Intent** - For STRUCTURAL changes or regenerating with new parameters:
- "Add 2 more slides" → Regenerate with more slides
- "Remove 3 slides" → Regenerate with fewer slides  
- "Make it 10 slides instead" → Regenerate with specific count
- "Change tone to professional" → Regenerate with new tone
- "Update theme to modern" → Regenerate with new theme
- "Make it more detailed" → Regenerate with different verbosity
→ Requires: presentationId + generation parameters (n_slides, tone, theme, etc.)

2. **Extract parameters** from the ENTIRE conversation (not just current message):
   - content: The topic/content for the presentation (REQUIRED for generate) - LOOK IN ALL MESSAGES
   - title: A short, engaging title for the presentation (REQUIRED for generate) - Generate from content if not explicitly mentioned
   - n_slides: Number of slides (1-50, default: 8)
   - language: Presentation language (default: English)
   - template: Template choice (${TEMPLATES.join(', ')})
   - theme: Theme choice (${THEMES.join(', ')})
   - tone: Tone of content (${TONES.join(', ')})
   - verbosity: Level of detail (${VERBOSITY_OPTIONS.join(', ')})
   - image_type: Type of images (${IMAGE_TYPES.join(', ')})
   - export_as: Export format (${EXPORT_FORMATS.join(', ')})
   - web_search: Enable real-time web search (true/false)
   - include_table_of_contents: Include TOC slide (true/false)
   - include_title_slide: Include title slide (true/false, default: true)
   - presentationId: ID of existing presentation (ALWAYS check "Parameters Already Collected" for this!)
   - taskId: Task ID for checking async status
   - slides: Array of slide content edits (ONLY for edit intent)
   
   **CRITICAL FOR 'content' AND 'title' PARAMETERS**: 
   If you see ANY message in the conversation history that mentions a topic (e.g., "Create a presentation about artificial intelligence", "presentation on machine learning", "topic is climate change"), 
   extract that as the content parameter AND generate a concise, engaging title from it (e.g., "Artificial Intelligence: Transforming Our World").
   Don't mark content or title as missing if content was mentioned anywhere in the conversation - just generate the title from the content.

   **CRITICAL FOR 'presentationId' PARAMETER**:
   ALWAYS check the "Parameters Already Collected" section - if presentationId exists there, include it in your extracted parameters!

3. **Identify missing required parameters** for the detected intent

4. **Generate a natural follow-up question** if parameters are missing (keep it conversational and friendly)

**IMPORTANT GUIDELINES:**
- **CRITICAL: Extract parameters from ENTIRE conversation history, not just current message**
- **CRITICAL: Check "Parameters Already Collected" for presentationId and other values**
- If content/topic was mentioned in ANY previous message in the conversation, extract it
- Be smart about inferring parameters from context across all messages
- If user mentions "professional presentation", infer professional tone and template
- If user says "quick overview", infer fewer slides and concise verbosity
- If user mentions "detailed", infer more slides and text-heavy verbosity
- Look at conversation history for context - users often provide information across multiple messages
- Merge new parameters with existing ones
- When user says "go ahead", "generate now", "I'm good", check if required params were mentioned earlier
- Only ask for truly essential missing parameters that were never mentioned in the conversation

**EXAMPLES:**

Example 1 - DERIVE Intent (Add slides):
User: "Add 2 more slides about copyright"
Parameters Already Collected: { "presentationId": "abc-123" }
Correct extraction:
{
  "intent": "derive",
  "parameters": {
    "presentationId": "abc-123",
    "content": "copyright topics"
  },
  "confidence": 0.9,
  "reasoning": "User wants to regenerate presentation with additional content"
}

Example 2 - DERIVE Intent (Change parameters):
User: "Update the presentation to have 10 slides, professional tone"
Parameters Already Collected: { "presentationId": "xyz-456" }
Correct extraction:
{
  "intent": "derive",
  "parameters": {
    "presentationId": "xyz-456",
    "n_slides": 10,
    "tone": "professional"
  },
  "confidence": 0.95,
  "reasoning": "User wants to regenerate with different n_slides and tone"
}

Example 3 - EDIT Intent (Content change):
User: "Change slide 3 title to 'Introduction'"
Parameters Already Collected: { "presentationId": "def-789" }
Correct extraction:
{
  "intent": "edit",
  "parameters": {
    "presentationId": "def-789",
    "slides": [
      { "index": 2, "content": { "title": "Introduction" } }
    ]
  },
  "confidence": 1.0,
  "reasoning": "User wants to modify slide 3 (index 2) title"
}

Example 3b - EDIT Intent (Make content catchy):
User: "Change slide 1 title to make it more catchy"
Parameters Already Collected: { "ghi-456", "content": "artificial intelligence" }
Correct extraction:
{
  "intent": "edit",
  "parameters": {
    "presentationId": "ghi-456",
    "slides": [
      { "index": 0, "content": { "title": "AI Revolution: Transforming Tomorrow Today!" } }
    ]
  },
  "confidence": 0.9,
  "reasoning": "User wants to make slide 1 (index 0) title catchier - generated catchy AI-themed title"
}

Example 3c - EDIT Intent (Natural language):
User: "Make the first slide more engaging"
Parameters Already Collected: { "jkl-789" }
Correct extraction:
{
  "intent": "edit",
  "parameters": {
    "presentationId": "jkl-789",
    "slides": [
      { "index": 0, "content": { "title": "suggested engaging title" } }
    ]
  },
  "followUpQuestion": "What specific changes would you like? Should I update the title, add more visual elements, or change the content?",
  "confidence": 0.7,
  "reasoning": "User wants to edit first slide but didn't specify what to change"
}

Example 4 - GENERATE Intent:
Conversation:
- user: "Create a presentation about artificial intelligence"
- assistant: "How many slides?"
- user: "12"
- assistant: "Any template preferences?"
- user: "No, generate now"
Correct extraction:
{
  "intent": "generate",
  "parameters": {
    "content": "artificial intelligence",
    "title": "Artificial Intelligence: The Future of Technology",
    "n_slides": 12
  },
  "missingRequired": [],
  "confidence": 1.0
}

Return your analysis as a JSON object with this structure:
{
  "intent": "generate|generate_async|check_status|edit|derive|get_info|general_question",
  "confidence": 0.0-1.0,
  "parameters": {
    "content": "extracted content",
    "n_slides": 8,
    ...
  },
  "missingRequired": ["field1", "field2"],
  "followUpQuestion": "Natural question to ask the user",
  "reasoning": "Brief explanation of your analysis"
}`;
  }

  /**
   * Builds the user-specific part of the prompt, including the conversation context and the latest message.
   * @private
   * @param {string} userMessage - The current user message.
   * @param {Array<Object>} conversationHistory - The conversation history.
   * @param {Object} existingParams - Parameters already collected.
   * @param {string|null} [conversationSummary=null] - An optional conversation summary.
   * @returns {string} The user prompt string.
   */
  _buildUserPrompt(
    userMessage,
    conversationHistory,
    existingParams,
    conversationSummary = null
  ) {
    let prompt = '';

    // Use summary if provided, otherwise use full history
    if (conversationSummary) {
      prompt += '**CONVERSATION SUMMARY:**\n';
      prompt += conversationSummary + '\n\n';

      // Add only the last 2-3 messages for immediate context
      if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        prompt += '**RECENT MESSAGES:**\n';
        conversationHistory.slice(-3).forEach((msg) => {
          if (msg && msg.role && msg.content) {
            prompt += `${msg.role}: ${msg.content}\n`;
          }
        });
        prompt += '\n';
      }
    } else {
      // Add full conversation history for context
      if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        prompt +=
          '**FULL CONVERSATION HISTORY (Extract parameters from ALL messages):**\n';
        conversationHistory.forEach((msg) => {
          if (msg && msg.role && msg.content) {
            prompt += `${msg.role}: ${msg.content}\n`;
          }
        });
        prompt += '\n';
      }
    }

    // Add existing parameters
    if (existingParams && Object.keys(existingParams).length > 0) {
      prompt += '**Parameters Already Collected:**\n';
      prompt += JSON.stringify(existingParams, null, 2) + '\n\n';
    }

    // Add current user message
    prompt += '**Current User Message:**\n';
    prompt += userMessage + '\n\n';

    prompt +=
      '**IMPORTANT**: Extract ALL parameters from the conversation context above (summary + recent messages or full history), not just the current message. If the user mentioned the topic/content earlier, include it in the parameters even if they just said "generate now" in the current message.';

    return prompt;
  }

  /**
   * Parses the AI's string response to extract a structured JSON object.
   * Handles cases where the JSON is wrapped in markdown code blocks.
   * @private
   * @param {string} content - The raw string content from the AI model's response.
   * @returns {Object} The parsed and validated analysis object.
   */
  _parseResponse(content) {
    try {
      if (typeof content !== 'string') {
        throw new Error('Response content is not a string');
      }

      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch =
        content.match(/```json\n?([\s\S]*?)\n?```/) ||
        content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        logger.warn('No JSON found in response, using defaults');
        return {
          intent: PRESENTATION_INTENTS.GENERAL_QUESTION,
          confidence: 0.5,
          parameters: {},
          missingRequired: [],
          followUpQuestion:
            "I'm not sure I understood that. Could you please clarify what you'd like to do?",
          reasoning: 'Unable to parse response',
        };
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr.trim());

      // Validate and normalize the response
      return {
        intent: parsed.intent || PRESENTATION_INTENTS.GENERAL_QUESTION,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        parameters: (parsed.parameters && typeof parsed.parameters === 'object') ? parsed.parameters : {},
        missingRequired: Array.isArray(parsed.missingRequired) ? parsed.missingRequired : [],
        followUpQuestion: typeof parsed.followUpQuestion === 'string' ? parsed.followUpQuestion : null,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      };
    } catch (error) {
      logger.error('Error parsing AI response:', error);
      return {
        intent: PRESENTATION_INTENTS.GENERAL_QUESTION,
        confidence: 0.3,
        parameters: {},
        missingRequired: [],
        followUpQuestion:
          "I'm having trouble understanding. Could you please rephrase your request?",
        reasoning: 'Parse error',
      };
    }
  }

  /**
   * Generates a helpful response for general, non-presentation-related questions.
   * @async
   * @param {string} userMessage - The user's question.
   * @param {Array<Object>} [conversationHistory=[]] - The recent conversation history for context.
   * @returns {Promise<string>} A helpful, conversational answer to the user's question.
   */
  async answerGeneralQuestion(userMessage, conversationHistory = []) {
    try {
      if (!config.gemini_secret_key) {
        throw new Error('Gemini API key is not configured.');
      }

      const systemPrompt = `You are a helpful assistant for a presentation generation API. Answer questions about:
- Available features (templates, themes, tones, verbosity, etc.)
- How to create presentations
- How to edit or modify presentations
- API capabilities and options

Be concise, friendly, and helpful. If the user seems ready to create a presentation, guide them toward it.`;

      const sanitizedMessage = typeof userMessage === 'string'
        ? userMessage.substring(0, MAX_USER_MESSAGE_LENGTH)
        : '';

      const safeHistory = Array.isArray(conversationHistory)
        ? conversationHistory.slice(-5)
        : [];

      const historyContext = safeHistory
        .filter(msg => msg && msg.role && msg.content)
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n');

      const fullPrompt = `${systemPrompt}\n\n${historyContext ? `${historyContext}\n\n` : ''}user: ${sanitizedMessage}`;

      const response = await this.model.invoke(fullPrompt);

      return response.content;
    } catch (error) {
      logger.error('Error answering general question:', error);
      return "I'm here to help you create presentations! Just tell me what topic you'd like to create a presentation about, and I'll guide you through the process.";
    }
  }
}

/**
 * A singleton instance of the ConversationAnalyzer class.
 * This instance is exported for use throughout the application.
 * @type {ConversationAnalyzer}
 */
export const conversationAnalyzer = new ConversationAnalyzer();