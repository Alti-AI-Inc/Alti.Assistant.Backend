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
const MAX_TOKENS_FOR_CONTEXT = 6000; // Conservative limit for context (Gemini 2.0 Flash supports ~1M tokens)
const SUMMARIZATION_THRESHOLD = 5000; // Trigger summarization at this token count

/**
 * AI-powered conversation analyzer for presentation generation
 * Uses Gemini to understand user intent and extract parameters
 */
class ConversationAnalyzer {
  constructor() {
    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: config.gemini_secret_key,
      temperature: 0.3, // Lower temperature for more consistent parameter extraction
      maxOutputTokens: 2048,
    });

    this.summarizerModel = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: config.gemini_secret_key,
      temperature: 0.5,
      maxOutputTokens: 1000,
    });
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   * @param {string} text - Text to estimate tokens for
   * @returns {number} - Estimated token count
   */
  _estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate total tokens for conversation history
   * @param {Array} conversationHistory - Array of messages
   * @param {Object} existingParams - Existing parameters
   * @returns {number} - Total estimated tokens
   */
  _calculateConversationTokens(conversationHistory, existingParams) {
    let totalTokens = 0;

    // Estimate tokens for conversation history
    conversationHistory.forEach(msg => {
      totalTokens += this._estimateTokens(msg.content);
    });

    // Estimate tokens for parameters
    totalTokens += this._estimateTokens(JSON.stringify(existingParams));

    // Add system prompt tokens (approximately 800 tokens)
    totalTokens += 800;

    return totalTokens;
  }

  /**
   * Summarize conversation history to reduce token usage
   * @param {Array} conversationHistory - Full conversation history
   * @param {Object} existingParams - Parameters collected so far
   * @returns {Promise<string>} - Summarized conversation
   */
  async summarizeConversation(conversationHistory, existingParams) {
    try {
      const conversationText = conversationHistory
        .map(msg => `${msg.role}: ${msg.content}`)
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
${JSON.stringify(existingParams, null, 2)}

Provide a brief summary (max 200 words):`;

      const response = await this.summarizerModel.invoke(prompt);
      const summary = response.content.trim();

      logger.info('Conversation summarized', {
        originalMessages: conversationHistory.length,
        summaryLength: summary.length,
        estimatedTokens: this._estimateTokens(summary)
      });

      return summary;
    } catch (error) {
      logger.error('Error summarizing conversation:', error);
      // Fallback: return a basic summary
      return `Previous conversation about creating a presentation. Parameters: ${JSON.stringify(existingParams)}`;
    }
  }

  /**
   * Analyze user message and extract intent + parameters
   * @param {string} userMessage - Current user message
   * @param {Array} conversationHistory - Previous conversation messages
   * @param {Object} existingParams - Parameters collected so far
   * @param {string} conversationSummary - Optional pre-computed summary
   * @returns {Promise<Object>} - Analysis result with intent, parameters, missing fields, and follow-up question
   */
  async analyzeIntent(userMessage, conversationHistory = [], existingParams = {}, conversationSummary = null) {
    try {
      // Calculate token usage
      const estimatedTokens = this._calculateConversationTokens(conversationHistory, existingParams);

      logger.info('Token estimation', {
        estimatedTokens,
        threshold: SUMMARIZATION_THRESHOLD,
        willUseSummary: conversationSummary ? true : false,
        historyLength: conversationHistory.length,
      });

      const systemPrompt = this._buildSystemPrompt();
      const userPrompt = this._buildUserPrompt(
        userMessage,
        conversationHistory,
        existingParams,
        conversationSummary
      );

      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

      // Log the actual prompt being sent (truncated for readability)
      logger.info('Prompt preview', {
        userPromptStart: userPrompt.substring(0, 500),
        conversationHistoryCount: conversationHistory.length,
        hasExistingParams: Object.keys(existingParams).length > 0,
      });

      const response = await this.model.invoke(fullPrompt);

      const result = this._parseResponse(response.content);
      logger.info('Intent analysis result:', result);

      return result;
    } catch (error) {
      logger.error('Error analyzing intent:', error);
      throw error;
    }
  }  /**
   * Build system prompt for intent analysis
   */
  _buildSystemPrompt() {
    return `You are an AI assistant specialized in understanding user requests for presentation generation. Your job is to:

1. **Identify the user's intent** from these options:
   - generate: User wants to create a new presentation
   - generate_async: User wants to create a presentation asynchronously (for large/complex presentations)
   - check_status: User wants to check the status of an async generation task
   - edit: User wants to modify an existing presentation
   - derive: User wants to create a new presentation based on an existing one
   - get_info: User wants to get information about an existing presentation
   - general_question: User is asking a general question about presentation features

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
   - presentationId: ID of existing presentation (for edit/derive/get_info)
   - taskId: Task ID for checking async status
   - slides: Array of slide edits (for edit/derive)
   
   **CRITICAL FOR 'content' AND 'title' PARAMETERS**: 
   If you see ANY message in the conversation history that mentions a topic (e.g., "Create a presentation about artificial intelligence", "presentation on machine learning", "topic is climate change"), 
   extract that as the content parameter AND generate a concise, engaging title from it (e.g., "Artificial Intelligence: Transforming Our World").
   Don't mark content or title as missing if content was mentioned anywhere in the conversation - just generate the title from the content.

3. **Identify missing required parameters** for the detected intent

4. **Generate a natural follow-up question** if parameters are missing (keep it conversational and friendly)

**IMPORTANT GUIDELINES:**
- **CRITICAL: Extract parameters from ENTIRE conversation history, not just current message**
- If content/topic was mentioned in ANY previous message in the conversation, extract it
- Be smart about inferring parameters from context across all messages
- If user mentions "professional presentation", infer professional tone and template
- If user says "quick overview", infer fewer slides and concise verbosity
- If user mentions "detailed", infer more slides and text-heavy verbosity
- Look at conversation history for context - users often provide information across multiple messages
- Merge new parameters with existing ones
- When user says "go ahead", "generate now", "I'm good", check if required params were mentioned earlier
- Only ask for truly essential missing parameters that were never mentioned in the conversation

**EXAMPLE - Extracting content from earlier messages:**
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
    "content": "artificial intelligence",  // ✓ Extracted from FIRST message
    "title": "Artificial Intelligence: The Future of Technology",  // ✓ Generated from content
    "n_slides": 12
  },
  "missingRequired": [],  // ✓ Content and title NOT missing!
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
   * Build user prompt with context
   */
  _buildUserPrompt(userMessage, conversationHistory, existingParams, conversationSummary = null) {
    let prompt = '';

    // Use summary if provided, otherwise use full history
    if (conversationSummary) {
      prompt += '**CONVERSATION SUMMARY:**\n';
      prompt += conversationSummary + '\n\n';

      // Add only the last 2-3 messages for immediate context
      if (conversationHistory.length > 0) {
        prompt += '**RECENT MESSAGES:**\n';
        conversationHistory.slice(-3).forEach((msg) => {
          prompt += `${msg.role}: ${msg.content}\n`;
        });
        prompt += '\n';
      }
    } else {
      // Add full conversation history for context
      if (conversationHistory.length > 0) {
        prompt += '**FULL CONVERSATION HISTORY (Extract parameters from ALL messages):**\n';
        conversationHistory.forEach((msg) => {
          prompt += `${msg.role}: ${msg.content}\n`;
        });
        prompt += '\n';
      }
    }

    // Add existing parameters
    if (Object.keys(existingParams).length > 0) {
      prompt += '**Parameters Already Collected:**\n';
      prompt += JSON.stringify(existingParams, null, 2) + '\n\n';
    }

    // Add current user message
    prompt += '**Current User Message:**\n';
    prompt += userMessage + '\n\n';

    prompt += '**IMPORTANT**: Extract ALL parameters from the conversation context above (summary + recent messages or full history), not just the current message. If the user mentioned the topic/content earlier, include it in the parameters even if they just said "generate now" in the current message.';

    return prompt;
  }

  /**
   * Parse AI response and extract structured data
   */
  _parseResponse(content) {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        logger.warn('No JSON found in response, using defaults');
        return {
          intent: PRESENTATION_INTENTS.GENERAL_QUESTION,
          confidence: 0.5,
          parameters: {},
          missingRequired: [],
          followUpQuestion: "I'm not sure I understood that. Could you please clarify what you'd like to do?",
          reasoning: 'Unable to parse response',
        };
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      // Validate and normalize the response
      return {
        intent: parsed.intent || PRESENTATION_INTENTS.GENERAL_QUESTION,
        confidence: parsed.confidence || 0.5,
        parameters: parsed.parameters || {},
        missingRequired: parsed.missingRequired || [],
        followUpQuestion: parsed.followUpQuestion || null,
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      logger.error('Error parsing AI response:', error);
      return {
        intent: PRESENTATION_INTENTS.GENERAL_QUESTION,
        confidence: 0.3,
        parameters: {},
        missingRequired: [],
        followUpQuestion: "I'm having trouble understanding. Could you please rephrase your request?",
        reasoning: 'Parse error',
      };
    }
  }

  /**
   * Generate a helpful response for general questions
   */
  async answerGeneralQuestion(userMessage, conversationHistory = []) {
    try {
      const systemPrompt = `You are a helpful assistant for a presentation generation API. Answer questions about:
- Available features (templates, themes, tones, verbosity, etc.)
- How to create presentations
- How to edit or modify presentations
- API capabilities and options

Be concise, friendly, and helpful. If the user seems ready to create a presentation, guide them toward it.`;

      const historyContext = conversationHistory
        .slice(-5)
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n');

      const fullPrompt = `${systemPrompt}\n\n${historyContext ? `${historyContext}\n\n` : ''}user: ${userMessage}`;

      const response = await this.model.invoke(fullPrompt);

      return response.content;
    } catch (error) {
      logger.error('Error answering general question:', error);
      return "I'm here to help you create presentations! Just tell me what topic you'd like to create a presentation about, and I'll guide you through the process.";
    }
  }
}

export const conversationAnalyzer = new ConversationAnalyzer();
