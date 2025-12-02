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

/**
 * AI-powered conversation analyzer for presentation generation
 * Uses Gemini to understand user intent and extract parameters
 */
class ConversationAnalyzer {
  constructor() {
    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.0-flash-exp',
      apiKey: config.gemini_secret_key,
      temperature: 0.3, // Lower temperature for more consistent parameter extraction
      maxOutputTokens: 2048,
    });
  }

  /**
   * Analyze user message and extract intent + parameters
   * @param {string} userMessage - Current user message
   * @param {Array} conversationHistory - Previous conversation messages
   * @param {Object} existingParams - Parameters collected so far
   * @returns {Promise<Object>} - Analysis result with intent, parameters, missing fields, and follow-up question
   */
  async analyzeIntent(userMessage, conversationHistory = [], existingParams = {}) {
    try {
      const systemPrompt = this._buildSystemPrompt();
      const userPrompt = this._buildUserPrompt(userMessage, conversationHistory, existingParams);

      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

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

2. **Extract parameters** from the conversation:
   - content: The topic/content for the presentation (REQUIRED for generate)
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

3. **Identify missing required parameters** for the detected intent

4. **Generate a natural follow-up question** if parameters are missing (keep it conversational and friendly)

**IMPORTANT GUIDELINES:**
- Be smart about inferring parameters from context
- If user mentions "professional presentation", infer professional tone and template
- If user says "quick overview", infer fewer slides and concise verbosity
- If user mentions "detailed", infer more slides and text-heavy verbosity
- Look at conversation history for context
- Merge new parameters with existing ones
- Only ask for truly essential missing parameters

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
  _buildUserPrompt(userMessage, conversationHistory, existingParams) {
    let prompt = '';

    // Add conversation history for context
    if (conversationHistory.length > 0) {
      prompt += '**Conversation History:**\n';
      conversationHistory.slice(-5).forEach((msg) => {
        prompt += `${msg.role}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    // Add existing parameters
    if (Object.keys(existingParams).length > 0) {
      prompt += '**Parameters Already Collected:**\n';
      prompt += JSON.stringify(existingParams, null, 2) + '\n\n';
    }

    // Add current user message
    prompt += '**Current User Message:**\n';
    prompt += userMessage + '\n\n';

    prompt += 'Analyze this message and return the JSON analysis.';

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
