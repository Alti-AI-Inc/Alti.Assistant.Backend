import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { conversationAnalyzer, ConversationAnalyzer } from '../conversationAnalyzer.js';
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

// Mock external dependencies
vi.mock('@langchain/google-genai', () => {
  const mockInvoke = vi.fn();
  const mockChatGoogleGenerativeAI = vi.fn(() => ({
    invoke: mockInvoke,
  }));
  return { ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI, mockInvoke };
});

vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ConversationAnalyzer', () => {
  let analyzer;
  let mockInvoke;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockInvoke = ChatGoogleGenerativeAI.mock.results[0]?.value?.invoke || vi.fn();
    ChatGoogleGenerativeAI.mockClear(); // Clear constructor calls
    ChatGoogleGenerativeAI.mockImplementation(() => ({
      invoke: mockInvoke,
    }));

    analyzer = new ConversationAnalyzer();
  });

  it('should initialize ChatGoogleGenerativeAI models with correct parameters', () => {
    expect(ChatGoogleGenerativeAI).toHaveBeenCalledTimes(2);
    expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      apiKey: 'mock-gemini-key',
      temperature: 0.3,
      maxOutputTokens: 2048,
    });
    expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      apiKey: 'mock-gemini-key',
      temperature: 0.5,
      maxOutputTokens: 1000,
    });
  });

  describe('_estimateTokens', () => {
    it('should estimate tokens correctly for a short string', () => {
      expect(analyzer._estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 -> 3
    });

    it('should estimate tokens correctly for an empty string', () => {
      expect(analyzer._estimateTokens('')).toBe(0);
    });

    it('should estimate tokens correctly for a longer string', () => {
      const longText = 'This is a somewhat longer string to test token estimation.'; // 58 chars
      expect(analyzer._estimateTokens(longText)).toBe(15); // 58 / 4 = 14.5 -> 15
    });
  });

  describe('_calculateConversationTokens', () => {
    it('should calculate tokens for empty history and params', () => {
      const history = [];
      const params = {};
      expect(analyzer._calculateConversationTokens(history, params)).toBe(800); // Only system prompt tokens
    });

    it('should calculate tokens for conversation history only', () => {
      const history = [
        { role: 'user', content: 'hello' }, // 5 chars -> 2 tokens
        { role: 'assistant', content: 'hi there' }, // 8 chars -> 2 tokens
      ];
      const params = {};
      // 2 + 2 + 800 = 804
      expect(analyzer._calculateConversationTokens(history, params)).toBe(804);
    });

    it('should calculate tokens for existing parameters only', () => {
      const history = [];
      const params = { content: 'test', n_slides: 5 }; // JSON.stringify: {"content":"test","n_slides":5} (34 chars) -> 9 tokens
      // 9 + 800 = 809
      expect(analyzer._calculateConversationTokens(history, params)).toBe(809);
    });

    it('should calculate tokens for both history and parameters', () => {
      const history = [
        { role: 'user', content: 'presentation on AI' }, // 18 chars -> 5 tokens
      ];
      const params = { theme: 'modern' }; // JSON.stringify: {"theme":"modern"} (18 chars) -> 5 tokens
      // 5 + 5 + 800 = 810
      expect(analyzer._calculateConversationTokens(history, params)).toBe(810);
    });
  });

  describe('summarizeConversation', () => {
    it('should return a summary when AI invocation is successful', async () => {
      const conversationHistory = [
        { role: 'user', content: 'I want a presentation about quantum computing.' },
        { role: 'assistant', content: 'Okay, how many slides?' },
        { role: 'user', content: 'Make it 10 slides.' },
      ];
      const existingParams = { content: 'quantum computing' };
      const mockSummary = 'User wants a 10-slide presentation on quantum computing.';

      mockInvoke.mockResolvedValueOnce({ content: mockSummary });

      const result = await analyzer.summarizeConversation(conversationHistory, existingParams);

      expect(result).toBe(mockSummary);
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Conversation summarized', expect.any(Object));
      const promptArg = mockInvoke.mock.calls[0][0];
      expect(promptArg).toContain('Summarize the following conversation about presentation generation.');
      expect(promptArg).toContain('user: I want a presentation about quantum computing.');
      expect(promptArg).toContain('Parameters collected so far:\n{\n  "content": "quantum computing"\n}');
    });

    it('should handle errors during summarization and return a fallback', async () => {
      const conversationHistory = [
        { role: 'user', content: 'I want a presentation about quantum computing.' },
      ];
      const existingParams = { content: 'quantum computing' };
      const error = new Error('AI summarization failed');

      mockInvoke.mockRejectedValueOnce(error);

      const result = await analyzer.summarizeConversation(conversationHistory, existingParams);

      expect(result).toBe(`Previous conversation about creating a presentation. Parameters: {"content":"quantum computing"}`);
      expect(logger.error).toHaveBeenCalledWith('Error summarizing conversation:', error);
    });
  });

  describe('_buildSystemPrompt', () => {
    it('should contain all required intents and parameter descriptions', () => {
      const prompt = analyzer._buildSystemPrompt();

      expect(prompt).toContain('generate|generate_async|check_status|edit|derive|get_info|general_question');
      expect(prompt).toContain(`template: Template choice (${TEMPLATES.join(', ')})`);
      expect(prompt).toContain(`theme: Theme choice (${THEMES.join(', ')})`);
      expect(prompt).toContain(`tone: Tone of content (${TONES.join(', ')})`);
      expect(prompt).toContain(`verbosity: Level of detail (${VERBOSITY_OPTIONS.join(', ')})`);
      expect(prompt).toContain(`image_type: Type of images (${IMAGE_TYPES.join(', ')})`);
      expect(prompt).toContain(`export_as: Export format (${EXPORT_FORMATS.join(', ')})`);
      expect(prompt).toContain('CRITICAL DISTINCTION - EDIT vs DERIVE:');
      expect(prompt).toContain('CRITICAL FOR EDIT INTENT - Slide Index Conversion:');
      expect(prompt).toContain('CRITICAL FOR EDIT INTENT - Content Field Generation:');
      expect(prompt).toContain('CRITICAL FOR \'content\' AND \'title\' PARAMETERS');
      expect(prompt).toContain('CRITICAL FOR \'presentationId\' PARAMETER');
    });

    it('should correctly list slide index conversion examples', () => {
      const prompt = analyzer._buildSystemPrompt();
      expect(prompt).toContain('User says "slide 1" or "first slide" → use index: 0');
      expect(prompt).toContain('User says "slide 2" or "second slide" → use index: 1');
      expect(prompt).toContain('User says "slide 3" → use index: 2');
    });
  });

  describe('_buildUserPrompt', () => {
    it('should include full conversation history when no summary is provided', () => {
      const userMessage = 'Current message';
      const conversationHistory = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Second message' },
      ];
      const existingParams = { param1: 'value1' };

      const prompt = analyzer._buildUserPrompt(userMessage, conversationHistory, existingParams, null);

      expect(prompt).toContain('**FULL CONVERSATION HISTORY (Extract parameters from ALL messages):**');
      expect(prompt).toContain('user: First message');
      expect(prompt).toContain('assistant: Second message');
      expect(prompt).toContain('**Parameters Already Collected:**');
      expect(prompt).toContain(JSON.stringify(existingParams, null, 2));
      expect(prompt).toContain('**Current User Message:**');
      expect(prompt).toContain(userMessage);
      expect(prompt).not.toContain('**CONVERSATION SUMMARY:**');
    });

    it('should include conversation summary and recent messages when summary is provided', () => {
      const userMessage = 'Current message';
      const conversationHistory = [
        { role: 'user', content: 'Old message 1' },
        { role: 'assistant', content: 'Old message 2' },
        { role: 'user', content: 'Recent message 1' },
        { role: 'assistant', content: 'Recent message 2' },
      ];
      const existingParams = { param1: 'value1' };
      const conversationSummary = 'Summary of the conversation.';

      const prompt = analyzer._buildUserPrompt(userMessage, conversationHistory, existingParams, conversationSummary);

      expect(prompt).toContain('**CONVERSATION SUMMARY:**');
      expect(prompt).toContain(conversationSummary);
      expect(prompt).toContain('**RECENT MESSAGES:**');
      expect(prompt).toContain('user: Recent message 1');
      expect(prompt).toContain('assistant: Recent message 2');
      expect(prompt).not.toContain('user: Old message 1'); // Only recent messages
      expect(prompt).toContain('**Parameters Already Collected:**');
      expect(prompt).toContain(JSON.stringify(existingParams, null, 2));
      expect(prompt).toContain('**Current User Message:**');
      expect(prompt).toContain(userMessage);
      expect(prompt).not.toContain('**FULL CONVERSATION HISTORY');
    });

    it('should handle empty conversation history and params gracefully', () => {
      const userMessage = 'Hello';
      const conversationHistory = [];
      const existingParams = {};

      const prompt = analyzer._buildUserPrompt(userMessage, conversationHistory, existingParams, null);

      expect(prompt).not.toContain('**FULL CONVERSATION HISTORY');
      expect(prompt).not.toContain('**Parameters Already Collected:**');
      expect(prompt).toContain('**Current User Message:**');
      expect(prompt).toContain(userMessage);
    });
  });

  describe('_parseResponse', () => {
    it('should parse a valid JSON string from AI response', () => {
      const aiResponse = `
        \`\`\`json
        {
          "intent": "generate",
          "confidence": 0.9,
          "parameters": {
            "content": "AI",
            "n_slides": 10
          },
          "missingRequired": [],
          "followUpQuestion": null,
          "reasoning": "User wants to generate a presentation on AI with 10 slides."
        }
        \`\`\`
      `;
      const result = analyzer._parseResponse(aiResponse);
      expect(result).toEqual({
        intent: 'generate',
        confidence: 0.9,
        parameters: { content: 'AI', n_slides: 10 },
        missingRequired: [],
        followUpQuestion: null,
        reasoning: 'User wants to generate a presentation on AI with 10 slides.',
      });
    });

    it('should parse JSON without markdown block', () => {
      const aiResponse = `{
        "intent": "edit",
        "confidence": 0.8,
        "parameters": {
          "presentationId": "123",
          "slides": [{"index": 0, "content": {"title": "New Title"}}]
        },
        "missingRequired": [],
        "followUpQuestion": null,
        "reasoning": "Edit slide 1 title."
      }`;
      const result = analyzer._parseResponse(aiResponse);
      expect(result).toEqual({
        intent: 'edit',
        confidence: 0.8,
        parameters: { presentationId: '123', slides: [{ index: 0, content: { title: 'New Title' } }] },
        missingRequired: [],
        followUpQuestion: null,
        reasoning: 'Edit slide 1 title.',
      });
    });

    it('should return default values and log warning for unparseable response', () => {
      const aiResponse = 'This is not a JSON string.';
      const result = analyzer._parseResponse(aiResponse);
      expect(result).toEqual({
        intent: PRESENTATION_INTENTS.GENERAL_QUESTION,
        confidence: 0.5,
        parameters: {},
        missingRequired: [],
        followUpQuestion: "I'm not sure I understood that. Could you please clarify what you'd like to do?",
        reasoning: 'Unable to parse response',
      });
      expect(logger.warn).toHaveBeenCalledWith('No JSON found in response, using defaults');
    });

    it('should handle malformed JSON and return defaults with error logging', () => {
      const aiResponse = '{ "intent": "generate", "parameters": { "content": "AI" '; // Malformed
      const result = analyzer._parseResponse(aiResponse);
      expect(result).toEqual({
        intent: PRESENTATION_INTENTS.GENERAL_QUESTION,
        confidence: 0.3,
        parameters: {},
        missingRequired: [],
        followUpQuestion: "I'm having trouble understanding. Could you please rephrase your request?",
        reasoning: 'Parse error',
      });
      expect(logger.error).toHaveBeenCalledWith('Error parsing AI response:', expect.any(Error));
    });

    it('should provide default values for missing fields in valid JSON', () => {
      const aiResponse = `{"intent": "generate", "parameters": {"content": "AI"}}`;
      const result = analyzer._parseResponse(aiResponse);
      expect(result).toEqual({
        intent: 'generate',
        confidence: 0.5, // Default confidence
        parameters: { content: 'AI' },
        missingRequired: [], // Default empty array
        followUpQuestion: null, // Default null
        reasoning: '', // Default empty string
      });
    });
  });

  describe('analyzeIntent', () => {
    it('should successfully analyze intent and extract parameters for generate intent', async () => {
      const userMessage = 'Create a presentation about climate change with 15 slides.';
      const conversationHistory = [];
      const existingParams = {};
      const mockAiResponse = {
        content: `\`\`\`json
{
  "intent": "generate",
  "confidence": 0.98,
  "parameters": {
    "content": "climate change",
    "title": "Climate Change: A Global Challenge",
    "n_slides": 15
  },
  "missingRequired": [],
  "followUpQuestion": null,
  "reasoning": "User wants to generate a presentation on climate change with 15 slides."
}
\`\`\``,
      };

      mockInvoke.mockResolvedValueOnce(mockAiResponse);

      const result = await analyzer.analyzeIntent(userMessage, conversationHistory, existingParams);

      expect(result).toEqual({
        intent: 'generate',
        confidence: 0.98,
        parameters: {
          content: 'climate change',
          title: 'Climate Change: A Global Challenge',
          n_slides: 15,
        },
        missingRequired: [],
        followUpQuestion: null,
        reasoning: 'User wants to generate a presentation on climate change with 15 slides.',
      });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Intent analysis result:', expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith('Token estimation', expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith('Prompt preview', expect.any(Object));
    });

    it('should extract parameters from conversation history and existingParams', async () => {
      const userMessage = 'Generate it now.';
      const conversationHistory = [
        { role: 'user', content: 'I need a presentation on artificial intelligence.' },
        { role: 'assistant', content: 'How many slides?' },
        { role: 'user', content: '10 slides.' },
      ];
      const existingParams = { theme: 'modern' };
      const mockAiResponse = {
        content: `\`\`\`json
{
  "intent": "generate",
  "confidence": 1.0,
  "parameters": {
    "content": "artificial intelligence",
    "title": "Artificial Intelligence: The Future",
    "n_slides": 10,
    "theme": "modern"
  },
  "missingRequired": [],
  "followUpQuestion": null,
  "reasoning": "User confirmed generation, parameters extracted from history and existing."
}
\`\`\``,
      };

      mockInvoke.mockResolvedValueOnce(mockAiResponse);

      const result = await analyzer.analyzeIntent(userMessage, conversationHistory, existingParams);

      expect(result.intent).toBe('generate');
      expect(result.parameters).toEqual({
        content: 'artificial intelligence',
        title: 'Artificial Intelligence: The Future',
        n_slides: 10,
        theme: 'modern',
      });
      const promptArg = mockInvoke.mock.calls[0][0];
      expect(promptArg).toContain('user: I need a presentation on artificial intelligence.');
      expect(promptArg).toContain('user: 10 slides.');
      expect(promptArg).toContain(JSON.stringify(existingParams, null, 2));
    });

    it('should handle edit intent with slide index conversion', async () => {
      const userMessage = 'Change slide 3 title to "Introduction".';
      const conversationHistory = [];
      const existingParams = { presentationId: 'abc-123' };
      const mockAiResponse = {
        content: `\`\`\`json
{
  "intent": "edit",
  "confidence": 1.0,
  "parameters": {
    "presentationId": "abc-123",
    "slides": [
      { "index": 2, "content": { "title": "Introduction" } }
    ]
  },
  "missingRequired": [],
  "followUpQuestion": null,
  "reasoning": "User wants to modify slide 3 (index 2) title."
}
\`\`\``,
      };

      mockInvoke.mockResolvedValueOnce(mockAiResponse);

      const result = await analyzer.analyzeIntent(userMessage, conversationHistory, existingParams);

      expect(result.intent).toBe('edit');
      expect(result.parameters).toEqual({
        presentationId: 'abc-123',
        slides: [{ index: 2, content: { title: 'Introduction' } }],
      });
    });

    it('should handle edit intent with AI-generated content for "make it catchy"', async () => {
      const userMessage = 'Make the first slide title more catchy.';
      const conversationHistory = [];
      const existingParams = { presentationId: 'ghi-456', content: 'artificial intelligence' };
      const mockAiResponse = {
        content: `\`\`\`json
{
  "intent": "edit",
  "confidence": 0.9,
  "parameters": {
    "presentationId": "ghi-456",
    "slides": [
      { "index": 0, "content": { "title": "AI Revolution: Transforming Tomorrow Today!" } }
    ]
  },
  "missingRequired": [],
  "followUpQuestion": null,
  "reasoning": "User wants to make slide 1 (index 0) title catchier - generated catchy AI-themed title"
}
\`\`\``,
      };

      mockInvoke.mockResolvedValueOnce(mockAiResponse);

      const result = await analyzer.analyzeIntent(userMessage, conversationHistory, existingParams);

      expect(result.intent).toBe('edit');
      expect(result.parameters.slides[0].index).toBe(0);
      expect(result.parameters.slides[0].content.title).toBe('AI Revolution: Transforming Tomorrow Today!');
    });

    it('should handle derive intent for changing parameters', async () => {
      const userMessage = 'Make it 10 slides instead and professional tone.';
      const conversationHistory = [];
      const existingParams = { presentationId: 'xyz-456' };
      const mockAiResponse = {
        content: `\`\`\`json
{
  "intent": "derive",
  "confidence": 0.95,
  "parameters": {
    "presentationId": "xyz-456",
    "n_slides": 10,
    "tone": "professional"
  },
  "missingRequired": [],
  "followUpQuestion": null,
  "reasoning": "User wants to regenerate with different n_slides and tone"
}
\`\`\``,
      };

      mockInvoke.mockResolvedValueOnce(mockAiResponse);

      const result = await analyzer.analyzeIntent(userMessage, conversationHistory, existingParams);

      expect(result.intent).toBe('derive');
      expect(result.parameters).toEqual({
        presentationId: 'xyz-456',
        n_slides: 10,
        tone: 'professional',
      });
    });

    it('should return a follow-up question if parameters are missing', async () => {
      const userMessage = 'I want a presentation.';
      const conversationHistory = [];
      const existingParams = {};
      const mockAiResponse = {
        content: `\`\`\`json
{
  "intent": "generate",
  "confidence": 0.8,
  "parameters": {},
  "missingRequired": ["content", "title"],
  "followUpQuestion": "What topic would you like your presentation to be about?",
  "reasoning": "User wants to generate but missing content and title."
}
\`\`\``,
      };

      mockInvoke.mockResolvedValueOnce(mockAiResponse);

      const result = await analyzer.analyzeIntent(userMessage, conversationHistory, existingParams);

      expect(result.intent).toBe('generate');
      expect(result.missingRequired).toEqual(['content', 'title']);
      expect(result.followUpQuestion).toBe('What topic would you like your presentation to be about?');
    });

    it('should use conversation summary if provided', async () => {
      const userMessage = 'Generate it now.';
      const conversationHistory = [
        { role: 'user', content: 'Old message 1' },
        { role: 'assistant', content: 'Old message 2' },
        { role: 'user', content: 'Recent message 1' },
      ];
      const existingParams = { content: 'summary topic', n_slides: 5 };
      const conversationSummary = 'User wants a 5-slide presentation on summary topic.';
      const mockAiResponse = {
        content: `\`\`\`json
{
  "intent": "generate",
  "confidence": 1.0,
  "parameters": {
    "content": "summary topic",
    "title": "Summary Topic Overview",
    "n_slides": 5
  },
  "missingRequired": [],
  "followUpQuestion": null,
  "reasoning": "User confirmed generation based on summary."
}
\`\`\``,
      };

      mockInvoke.mockResolvedValueOnce(mockAiResponse);

      await analyzer.analyzeIntent(userMessage, conversationHistory, existingParams, conversationSummary);

      const promptArg = mockInvoke.mock.calls[0][0];
      expect(promptArg).toContain('**CONVERSATION SUMMARY:**');
      expect(promptArg).toContain(conversationSummary);
      expect(promptArg).toContain('**RECENT MESSAGES:**');
      expect(promptArg).toContain('user: Recent message 1');
      expect(promptArg).not.toContain('user: Old message 1'); // Should only include recent
    });

    it('should throw an error if AI invocation fails', async () => {
      const userMessage = 'test';
      const error = new Error('AI service unavailable');
      mockInvoke.mockRejectedValueOnce(error);

      await expect(analyzer.analyzeIntent(userMessage)).rejects.toThrow('AI service unavailable');
      expect(logger.error).toHaveBeenCalledWith('Error analyzing intent:', error);
    });
  });

  describe('answerGeneralQuestion', () => {
    it('should return an AI-generated answer for a general question', async () => {
      const userMessage = 'What features do you have?';
      const mockAiResponse = { content: 'I can help you create presentations with various templates, themes, and tones.' };

      mockInvoke.mockResolvedValueOnce(mockAiResponse);

      const result = await analyzer.answerGeneralQuestion(userMessage);

      expect(result).toBe('I can help you create presentations with various templates, themes, and tones.');
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const promptArg = mockInvoke.mock.calls[0][0];
      expect(promptArg).toContain('You are a helpful assistant for a presentation generation API.');
      expect(promptArg).toContain('user: What features do you have?');
    });

    it('should include recent conversation history in the prompt for general questions', async () => {
      const userMessage = 'How about themes?';
      const conversationHistory = [
        { role: 'user', content: 'What can you do?' },
        { role: 'assistant', content: 'I create presentations.' },
        { role: 'user', content: 'Okay, how about themes?' },
      ];
      const mockAiResponse = { content: 'We have modern, classic, and minimalist themes.' };

      mockInvoke.mockResolvedValueOnce(mockAiResponse);

      await analyzer.answerGeneralQuestion(userMessage, conversationHistory);

      const promptArg = mockInvoke.mock.calls[0][0];
      expect(promptArg).toContain('user: What can you do?');
      expect(promptArg).toContain('assistant: I create presentations.');
      expect(promptArg).toContain('user: Okay, how about themes?');
    });

    it('should return a fallback message if AI invocation fails for general questions', async () => {
      const userMessage = 'How does this work?';
      const error = new Error('AI general question failed');
      mockInvoke.mockRejectedValueOnce(error);

      const result = await analyzer.answerGeneralQuestion(userMessage);

      expect(result).toBe("I'm here to help you create presentations! Just tell me what topic you'd like to create a presentation about, and I'll guide you through the process.");
      expect(logger.error).toHaveBeenCalledWith('Error answering general question:', error);
    });
  });

  it('should export an instance of ConversationAnalyzer', () => {
    expect(conversationAnalyzer).toBeInstanceOf(ConversationAnalyzer);
  });
});