import ConversationSummary from './conversationSummary.model.js';
import Conversation from './conversation.model.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Estimate token count for text (rough approximation: 1 token ≈ 4 characters)
 */
const estimateTokenCount = (text) => {
  return Math.ceil(text.length / 4);
};

/**
 * Calculate total token count for conversation messages
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
 * Generate summary using Gemini
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

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
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
 * Check if conversation needs summarization (>4000 tokens)
 */
export const checkAndSummarizeIfNeeded = async (conversationId, userId) => {
  try {
    const conversation = await Conversation.findByConversationId(
      conversationId,
      userId
    );
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

    // Check if summarization is needed
    if (totalTokens <= 12000) {
      return null; // No summarization needed
    }

    // Check if we already have an active summary
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
 * Get conversation context (summary + recent messages)
 */
export const getConversationContext = async (
  conversationId,
  userId,
  recentMessageLimit = 5
) => {
  try {
    // Get active summary
    const summary = await ConversationSummary.findActiveForConversation(
      conversationId,
      userId
    );

    // Get recent messages
    const conversation = await Conversation.findByConversationId(
      conversationId,
      userId
    );
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
 * Get formatted context for LLM prompts
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

export const conversationSummaryService = {
  checkAndSummarizeIfNeeded,
  getConversationContext,
  getFormattedContextForLLM,
  estimateTokenCount,
  calculateConversationTokens,
};
