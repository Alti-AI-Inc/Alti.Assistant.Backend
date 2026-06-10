import ConversationSummary from './conversationSummary.model.js';
import Conversation from './conversation.model.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

/**
 * @module conversationSummaryService
 * @description Provides services for managing and generating summaries of conversations using Google Gemini.
 */

// The GoogleGenerativeAI client will be initialized asynchronously and cached.
let genAI;
// The API key will be fetched once and cached.
let geminiApiKey;

/**
 * Asynchronously retrieves the Gemini API key.
 * It prioritizes the GEMINI_SECRET_KEY environment variable for direct injection (e.g., Cloud Run, local .env).
 * If not found, it falls back to fetching the secret from GCP Secret Manager using the GEMINI_SECRET_NAME environment variable.
 * @returns {Promise<string>} The Gemini API key.
 * @throws {Error} If the API key cannot be resolved.
 */
const getGeminiApiKey = async () => {
  // Return cached key if already fetched
  if (geminiApiKey) {
    return geminiApiKey;
  }

  // 1. Prefer the directly injected environment variable (common in Cloud Run/local dev)
  if (process.env.GEMINI_SECRET_KEY) {
    geminiApiKey = process.env.GEMINI_SECRET_KEY;
    return geminiApiKey;
  }

  // 2. Fallback to GCP Secret Manager
  if (process.env.GEMINI_SECRET_NAME) {
    try {
      const client = new SecretManagerServiceClient();
      const [version] = await client.accessSecretVersion({
        name: process.env.GEMINI_SECRET_NAME,
      });
      const key = version.payload.data.toString('utf8');
      if (!key) {
        throw new Error('Fetched secret payload from Secret Manager is empty.');
      }
      geminiApiKey = key;
      return geminiApiKey;
    } catch (error) {
      console.error('Failed to fetch secret from GCP Secret Manager:', error);
      throw new Error(
        'Could not retrieve Gemini API key from Secret Manager.'
      );
    }
  }

  // 3. If neither is configured, throw a configuration error.
  throw new Error(
    'Gemini API key is not configured. Set GEMINI_SECRET_KEY or GEMINI_SECRET_NAME environment variables.'
  );
};

/**
 * Initializes and returns the Google Generative AI client.
 * Uses a singleton pattern to ensure the client is initialized only once.
 * @returns {Promise<GoogleGenerativeAI>} The initialized GoogleGenerativeAI client instance.
 */
const getGenAIClient = async () => {
  if (!genAI) {
    const apiKey = await getGeminiApiKey();
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
};

/**
 * @typedef {Object} Message
 * @property {string} role - The role of the sender (e.g., 'user', 'assistant').
 * @property {string} content - The text content of the message.
 * @property {Date} [timestamp] - The timestamp when the message was created.
 */

/**
 * @typedef {Object} ConversationSummaryMetadata
 * @property {Array<string>} keyTopics - Main topics discussed in the conversation.
 * @property {Array<string>} entities - Important names, apps, or services mentioned.
 * @property {Array<string>} detectedApps - Apps or services that were used or discussed.
 * @property {string} summaryVersion - Version of the summary generation logic.
 */

/**
 * @typedef {Object} ConversationSummaryDocument
 * @property {string} conversationId - The ID of the conversation this summary belongs to.
 * @property {string} userId - The ID of the user who owns the conversation.
 * @property {string} summary - A brief overview of the conversation.
 * @property {string} context - Key information needed to continue the conversation.
 * @property {Object} messageRange - Details about the messages covered by this summary.
 * @property {number} messageRange.startIndex - The starting index of messages included in the summary.
 * @property {number} messageRange.endIndex - The ending index of messages included in the summary.
 * @property {number} messageRange.totalMessages - The total number of messages in the conversation at the time of summary.
 * @property {number} tokenCount - The estimated total token count of the summarized messages.
 * @property {ConversationSummaryMetadata} metadata - Additional structured information about the summary.
 * @property {'active'|'superseded'|'pending'} status - The current status of the summary.
 * @property {Date} createdAt - The timestamp when the summary was created.
 * @property {Date} updatedAt - The timestamp when the summary was last updated.
 */

/**
 * Estimates the token count for a given text string.
 * This is a rough approximation, typically used for large language models where 1 token is approximately 4 characters.
 * @param {string} text - The input text string to estimate tokens for.
 * @returns {number} The estimated number of tokens.
 */
const estimateTokenCount = (text) => {
  return Math.ceil(text.length / 4);
};

/**
 * Calculates the total estimated token count for an array of conversation messages.
 * It iterates through each message and sums up the estimated tokens of its content.
 * @param {Array<Message>} messages - An array of message objects, each expected to have a 'content' property.
 * @returns {number} The total estimated token count for all messages.
 */
const calculateConversationTokens = (messages) => {
  let totalTokens = 0;
  messages.forEach((msg) => {
    if (msg.content) {
      totalTokens += estimateTokenCount(msg.content);
    }
  });
  return totalTokens;
};

/**
 * Generates a structured summary, context, key topics, entities, and detected apps for a conversation
 * using the Google Gemini API. It constructs a detailed prompt and parses the API's structured response.
 * In case of an error, it provides a simple fallback summary.
 * @param {Array<Message>} messages - An array of message objects representing the conversation.
 * @returns {Promise<Object>} A promise that resolves to an object containing the summary details.
 * @property {string} summary - A brief overview of the conversation (2-3 sentences).
 * @property {string} context - Key information needed to continue the conversation.
 * @property {Array<string>} keyTopics - Main topics discussed, as an array of strings.
 * @property {Array<string>} entities - Important names, apps, or services mentioned, as an array of strings.
 * @property {Array<string>} detectedApps - Apps/services used or discussed, as an array of strings.
 * @throws {Error} If there's an error communicating with the Gemini API or parsing its response.
 */
const generateSummaryWithGemini = async (messages) => {
  try {
    const conversationText = messages
      .map(
        (msg, idx) =>
          `[Message ${idx + 1}] ${msg.role.toUpperCase()}: ${msg.content}`
      )
      .join('\n\n');

    const prompt = `Summarize this conversation in a clear, concise manner. Include key topics, decisions, and action items.

CONVERSATION:
${conversationText}

Provide:
1. SUMMARY: A brief overview (2-3 sentences)
2. CONTEXT: Key information needed to continue the conversation
3. TOPICS: Main topics discussed (comma-separated)
4. ENTITIES: Important names, apps, or services mentioned (comma-separated)
5. APPS: Which apps/services were used or discussed (comma-separated)

Format your response as:
SUMMARY: [summary text]
CONTEXT: [context text]
TOPICS: [topic1, topic2, topic3]
ENTITIES: [entity1, entity2, entity3]
APPS: [app1, app2, app3]`;

    // Lazily initialize the Gemini client on first use.
    const genAIClient = await getGenAIClient();
    const model = genAIClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Parse the response
    const summaryMatch = response.match(/SUMMARY:\s*(.+?)(?=\nCONTEXT:|$)/s);
    const contextMatch = response.match(/CONTEXT:\s*(.+?)(?=\nTOPICS:|$)/s);
    const topicsMatch = response.match(/TOPICS:\s*(.+?)(?=\nENTITIES:|$)/s);
    const entitiesMatch = response.match(/ENTITIES:\s*(.+?)(?=\nAPPS:|$)/s);
    const appsMatch = response.match(/APPS:\s*(.+?)$/s);

    return {
      summary: summaryMatch
        ? summaryMatch[1].trim()
        : response.substring(0, 500),
      context: contextMatch ? contextMatch[1].trim() : '',
      keyTopics: topicsMatch
        ? topicsMatch[1]
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      entities: entitiesMatch
        ? entitiesMatch[1]
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean)
        : [],
      detectedApps: appsMatch
        ? appsMatch[1]
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean)
        : [],
    };
  } catch (error) {
    console.error('Error generating summary with Gemini:', error);
    // Fallback: simple summary
    return {
      summary: `Conversation with ${messages.length} messages`,
      context: messages[messages.length - 1]?.content || '',
      keyTopics: [],
      entities: [],
      detectedApps: [],
    };
  }
};

/**
 * Checks if a conversation exceeds a predefined token limit (currently 12000 tokens)
 * and, if so, generates and saves a new summary using Gemini.
 * If an existing active summary is found and is up-to-date, it returns that summary.
 * If a new summary is generated, any old active summaries for the conversation are marked as 'superseded'.
 * @param {string} conversationId - The ID of the conversation to check and summarize.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @returns {Promise<ConversationSummaryDocument|null>} A promise that resolves to the newly created or existing active ConversationSummary document if a summary was generated or found, otherwise `null`.
 */
export const checkAndSummarizeIfNeeded = async (conversationId, userId) => {
  try {
    // Optimization: Add .lean() as the conversation document is only read from here.
    // Indexing Recommendation: Ensure 'conversationId' and 'userId' are indexed on the Conversation model for efficient lookups.
    const conversation = await Conversation.findByConversationId(
      conversationId,
      userId
    ).lean();
    if (
      !conversation ||
      !conversation.messages ||
      conversation.messages.length === 0
    ) {
      return null;
    }

    // Calculate total tokens
    const totalTokens = calculateConversationTokens(conversation.messages);

    console.log(`Conversation ${conversationId} has ${totalTokens} tokens`);

    // Check if summarization is needed (e.g., if tokens exceed a threshold)
    if (totalTokens <= 12000) {
      return null; // No summarization needed
    }

    // Check if we already have an active summary that covers all current messages
    // Note: .lean() is not used here because existingSummary might be updated and saved later.
    // Indexing Recommendation: Ensure 'conversationId', 'userId', and 'status' are indexed on the ConversationSummary model for efficient lookups.
    const existingSummary = await ConversationSummary.findActiveForConversation(
      conversationId,
      userId
    );
    if (
      existingSummary &&
      existingSummary.messageRange.endIndex === conversation.messages.length
    ) {
      console.log('Summary already up to date');
      return existingSummary;
    }

    console.log(
      '📝 Generating summary for conversation (exceeds 12000 tokens)...'
    );

    // Generate summary
    const { summary, context, keyTopics, entities, detectedApps } =
      await generateSummaryWithGemini(conversation.messages);

    // Mark old summaries as superseded
    if (existingSummary) {
      existingSummary.status = 'superseded';
      await existingSummary.save();
    }

    // Create new summary
    const newSummary = new ConversationSummary({
      conversationId,
      userId,
      summary,
      context,
      messageRange: {
        startIndex: 0,
        endIndex: conversation.messages.length,
        totalMessages: conversation.messages.length,
      },
      tokenCount: totalTokens,
      metadata: {
        keyTopics,
        entities,
        detectedApps,
        summaryVersion: '1.0',
      },
      status: 'active',
    });

    await newSummary.save();
    console.log('✅ Summary created and saved');

    return newSummary;
  } catch (error) {
    console.error('Error in checkAndSummarizeIfNeeded:', error);
    return null;
  }
};

/**
 * Retrieves the active conversation summary and a specified number of recent messages for a given conversation.
 * This provides a comprehensive context for further processing or display.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {number} [recentMessageLimit=5] - The maximum number of recent messages to retrieve. Defaults to 5.
 * @returns {Promise<Object>} A promise that resolves to an object containing the summary details and recent messages.
 * @property {boolean} hasSummary - True if an active summary exists, false otherwise.
 * @property {string|null} summary - The main summary text, or null if no summary.
 * @property {string|null} context - The context text from the summary, or null.
 * @property {Array<string>} keyTopics - An array of key topics from the summary.
 * @property {Array<string>} entities - An array of entities from the summary.
 * @property {Array<string>} detectedApps - An array of detected apps from the summary.
 * @property {Array<Object>} recentMessages - An array of recent message objects, each with role, content, and timestamp.
 * @property {number} totalTokens - The total token count of the conversation as per the summary, or 0 if no summary.
 */
export const getConversationContext = async (
  conversationId,
  userId,
  recentMessageLimit = 5
) => {
  try {
    // Optimization: Add .lean() as the summary document is only read from here.
    // Indexing Recommendation: Ensure 'conversationId', 'userId', and 'status' are indexed on the ConversationSummary model for efficient lookups.
    const summary = await ConversationSummary.findActiveForConversation(
      conversationId,
      userId
    ).lean();

    // Optimization: Add .lean() as the conversation document is only read from here.
    // Indexing Recommendation: Ensure 'conversationId' and 'userId' are indexed on the Conversation model for efficient lookups.
    const conversation = await Conversation.findByConversationId(
      conversationId,
      userId
    ).lean();
    const recentMessages =
      conversation?.messages?.slice(-recentMessageLimit) || [];

    return {
      hasSummary: !!summary,
      summary: summary?.summary || null,
      context: summary?.context || null,
      keyTopics: summary?.metadata?.keyTopics || [],
      entities: summary?.metadata?.entities || [],
      detectedApps: summary?.metadata?.detectedApps || [],
      recentMessages: recentMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      })),
      totalTokens: summary?.tokenCount || 0,
    };
  } catch (error) {
    console.error('Error getting conversation context:', error);
    return {
      hasSummary: false,
      summary: null,
      context: null,
      keyTopics: [],
      entities: [],
      detectedApps: [],
      recentMessages: [],
      totalTokens: 0,
    };
  }
};

/**
 * Retrieves the conversation context and formats it into a string suitable for inclusion in LLM prompts.
 * This formatted string includes the summary, context, topics, and detected apps, if available.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @returns {Promise<string>} A promise that resolves to a formatted string of the conversation summary and context, or an empty string if no summary exists.
 */
export const getFormattedContextForLLM = async (conversationId, userId) => {
  const context = await getConversationContext(conversationId, userId);

  if (!context.hasSummary) {
    return '';
  }

  let formatted = `\n=== CONVERSATION SUMMARY ===\n`;
  formatted += `Summary: ${context.summary}\n`;

  if (context.context) {
    formatted += `Context: ${context.context}\n`;
  }

  if (context.keyTopics.length > 0) {
    formatted += `Topics: ${context.keyTopics.join(', ')}\n`;
  }

  if (context.detectedApps.length > 0) {
    formatted += `Apps Used: ${context.detectedApps.join(', ')}\n`;
  }

  formatted += `===========================\n`;

  return formatted;
};

/**
 * An object containing all exported functions related to conversation summarization and context retrieval.
 * This serves as the public interface for the conversation summary service.
 * @type {Object}
 * @property {function(string, string): Promise<ConversationSummaryDocument|null>} checkAndSummarizeIfNeeded - Function to check and summarize a conversation if needed.
 * @property {function(string, string, number): Promise<Object>} getConversationContext - Function to retrieve conversation summary and recent messages.
 * @property {function(string, string): Promise<string>} getFormattedContextForLLM - Function to get formatted context for LLM prompts.
 * @property {function(string): number} estimateTokenCount - Utility function to estimate token count for a string.
 * @property {function(Array<Message>): number} calculateConversationTokens - Utility function to calculate total tokens for an array of messages.
 */
export const conversationSummaryService = {
  checkAndSummarizeIfNeeded,
  getConversationContext,
  getFormattedContextForLLM,
  estimateTokenCount,
  calculateConversationTokens,
};