import { HISTORY_CONFIG } from '../config/historyConfig.js';
import { llm } from '../services/geminiService.js';

/**
 * History Management Utilities
 * Intelligent conversation history management with token-aware summarization
 */

/**
 * Estimates the token count for a given conversation history.
 * This utility uses a character-to-token ratio for a fast, approximate estimation,
 * adding a small overhead per message for role and formatting.
 *
 * @param {Array<Object>} history - An array of message objects, where each object has a `content` property (e.g., `{ role: 'user', content: 'Hello' }`).
 * @returns {number} The estimated token count for the given conversation history. Returns 0 if history is empty or invalid.
 */
export const estimateTokenCount = (history) => {
  if (!Array.isArray(history) || history.length === 0) return 0;
  console.log(`Estimating tokens for ${history.length} messages`);

  let totalCharacters = 0;
  history.forEach((msg) => {
    if (msg && msg.content) {
      totalCharacters += msg.content.length;
      // Add overhead for role and formatting
      totalCharacters += 20;
    }
  });

  // Convert characters to estimated tokens
  const estimatedTokens = Math.ceil(
    totalCharacters / HISTORY_CONFIG.TOKEN_ESTIMATION_RATIO
  );

  console.log(
    `📊 Token estimation: ${totalCharacters} chars ≈ ${estimatedTokens} tokens`
  );
  return estimatedTokens;
};

/**
 * Checks if the conversation history needs management (e.g., summarization or trimming)
 * based on its estimated token count relative to a configured threshold.
 *
 * @param {Array<Object>} history - An array of message objects representing the current conversation history.
 * @param {string|null} [existingSummary=null] - An optional existing summary string. While not directly used in token estimation for this function, it's part of the overall context and included for consistency.
 * @returns {boolean} True if the history's estimated token count exceeds the configured threshold, indicating a need for management; otherwise, false.
 */
export const needsHistoryManagement = (history, existingSummary = null) => {
  if (!Array.isArray(history) || history.length === 0) return false;

  const tokenCount = estimateTokenCount(history);
  const threshold = HISTORY_CONFIG.MAX_TOKENS * 0.7; // Summarize at 70% of max tokens (2800 tokens)

  const needsManagement = tokenCount > threshold;

  console.log(
    `🔍 History check: ${tokenCount} tokens (threshold: ${threshold})`
  );
  console.log(`📝 Needs management: ${needsManagement}`);

  return needsManagement;
};

/**
 * Creates an intelligent conversation summary using the configured LLM (Gemini).
 * The summary aims to capture key context, user intent, factual data, and recent focus
 * within a target token count for optimal context retention in subsequent interactions.
 *
 * @async
 * @param {Array<Object>} messagesToSummarize - An array of message objects (e.g., `{ role: 'user', content: '...' }`) to be summarized.
 * @param {number} [targetTokens=HISTORY_CONFIG.SUMMARY_TARGET_TOKENS] - The desired approximate token count for the generated summary.
 * @returns {Promise<string>} A promise that resolves to the intelligently generated conversation summary string.
 *   Returns an empty string if no messages are provided, or a fallback summary in case of an error.
 */
export const createIntelligentSummary = async (
  messagesToSummarize,
  targetTokens = HISTORY_CONFIG.SUMMARY_TARGET_TOKENS
) => {
  try {
    if (
      !Array.isArray(messagesToSummarize) ||
      messagesToSummarize.length === 0
    ) {
      return '';
    }

    console.log(
      `🧠 Creating intelligent summary for ${messagesToSummarize.length} messages`
    );
    console.log(`🎯 Target: ${targetTokens} tokens`);

    // Format messages for summarization
    const conversationText = messagesToSummarize
      .map(
        (msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      )
      .join('\n');

    const systemPrompt = `You are an expert conversation summarizer. Create an intelligent, contextual summary of this conversation.

TARGET: Create a summary of approximately ${targetTokens} tokens (roughly ${targetTokens * 4} characters).

SUMMARIZATION STRATEGY:
1. PRESERVE KEY CONTEXT: Maintain important topics, decisions, and ongoing discussions
2. CAPTURE USER INTENT: Remember user preferences, requests, and interests  
3. RETAIN FACTUAL DATA: Keep specific information, dates, names, and numbers
4. MAINTAIN CONVERSATION FLOW: Preserve the logical progression of topics
5. INCLUDE RECENT FOCUS: Emphasize more recent topics and developments

STRUCTURE YOUR SUMMARY:
- **Main Topics Discussed**: Key subjects and themes
- **Important Facts & Data**: Specific information mentioned
- **User Preferences & Requests**: What the user is looking for or interested in
- **Recent Context**: Latest developments in the conversation
- **Action Items**: Any pending questions or follow-ups

QUALITY REQUIREMENTS:
- Be comprehensive yet concise
- Use clear, structured formatting
- Include specific details that might be referenced later
- Maintain chronological context where relevant
- Ensure the summary provides sufficient context for future responses

Create a conversation summary:`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `Conversation to summarize:\n\n${conversationText}`,
      },
    ];

    console.log(`🔄 Generating summary with Gemini...`);
    const startTime = Date.now();

    const response = await llm.invoke(messages);
    const summary = response.content.trim();

    const duration = Date.now() - startTime;
    const summaryTokens = estimateTokenCount([{ content: summary }]);

    console.log(`✅ Summary created in ${duration}ms`);
    console.log(
      `📏 Summary length: ${summary.length} chars ≈ ${summaryTokens} tokens`
    );
    console.log(
      `🎯 Target efficiency: ${((summaryTokens / targetTokens) * 100).toFixed(1)}%`
    );

    return summary;
  } catch (error) {
    console.error('❌ Error creating intelligent summary:', error);
    // Fallback to simple summary
    return `Previous conversation covered ${messagesToSummarize.length} messages with topics including search queries and responses. Context available but couldn't be fully summarized due to technical issues.`;
  }
};

/**
 * Intelligently manages conversation history by summarizing older messages and trimming
 * the history to keep only the most recent and relevant parts. This process is
 * automatically triggered when token limits are approached or can be forced.
 *
 * @async
 * @param {Array<Object>} history - The full array of conversation message objects.
 * @param {string|null} [existingSummary=null] - An optional existing summary string from previous management cycles.
 * @param {boolean} [forceManagement=false] - If true, history management will be performed regardless of whether token limits are exceeded.
 * @returns {Promise<Object>} A promise that resolves to an object containing the managed history, new summary, and management details.
 * @property {Array<Object>} managedHistory - The trimmed array of recent conversation messages.
 * @property {string|null} conversationSummary - The updated or newly created conversation summary.
 * @property {boolean} historyManaged - True if history management (summarization/trimming) was performed.
 * @property {number} tokenCount - The estimated token count of the `managedHistory` plus the `conversationSummary`.
 * @property {number} [tokenReduction] - The number of tokens reduced from the initial history.
 * @property {number} [reductionPercentage] - The percentage of tokens reduced.
 * @property {number} [summarizedMessages] - The number of messages that were summarized.
 * @property {number} [keptMessages] - The number of recent messages kept.
 * @property {string} [error] - An error message if history management failed, indicating a fallback was used.
 */
export const manageConversationHistoryIntelligent = async (
  history,
  existingSummary = null,
  forceManagement = false
) => {
  try {
    if (!Array.isArray(history)) {
      console.log('⚠️ Invalid history format, returning empty state');
      return {
        managedHistory: [],
        conversationSummary: existingSummary,
        historyManaged: false,
        tokenCount: 0,
      };
    }

    const initialTokenCount = estimateTokenCount(history);
    console.log(
      `🔍 Starting history management - Initial tokens: ${initialTokenCount}`
    );

    // Check if management is needed
    if (!forceManagement && !needsHistoryManagement(history, existingSummary)) {
      console.log('✅ History within limits, no management needed');
      return {
        managedHistory: history,
        conversationSummary: existingSummary,
        historyManaged: false,
        tokenCount: initialTokenCount,
      };
    }

    console.log(
      `🚀 History management triggered - Processing ${history.length} messages`
    );

    // Determine how many recent messages to keep
    const messagesToKeep = Math.min(
      Math.max(
        HISTORY_CONFIG.MIN_MESSAGES_TO_KEEP,
        Math.floor(history.length * 0.3)
      ), // Keep at least 30% of messages
      HISTORY_CONFIG.MAX_MESSAGES_TO_KEEP
    );

    const recentMessages = history.slice(-messagesToKeep);
    const messagesToSummarize = history.slice(0, -messagesToKeep);

    console.log(`📊 Management plan:`);
    console.log(`   📝 Messages to summarize: ${messagesToSummarize.length}`);
    console.log(`   🔄 Recent messages to keep: ${recentMessages.length}`);

    // Create intelligent summary if we have enough messages to summarize
    let newSummary = existingSummary;
    if (messagesToSummarize.length >= 2) {
      // Need at least 2 messages to summarize
      const oldConversationSummary = await createIntelligentSummary(
        messagesToSummarize,
        HISTORY_CONFIG.SUMMARY_TARGET_TOKENS
      );

      // Combine with existing summary if present
      if (existingSummary && existingSummary.trim()) {
        newSummary = `## Previous Context:\n${existingSummary}\n\n## Recent Developments:\n${oldConversationSummary}`;

        // If combined summary is too long, recreate with both parts
        const combinedTokens = estimateTokenCount([{ content: newSummary }]);
        if (combinedTokens > HISTORY_CONFIG.SUMMARY_TARGET_TOKENS * 1.2) {
          console.log(
            `📏 Combined summary too long (${combinedTokens} tokens), recreating...`
          );
          // Recreate summary with all messages that would be summarized
          const allMessagesToSummarize = [
            {
              role: 'assistant',
              content: `Previous summary: ${existingSummary}`,
            },
            ...messagesToSummarize,
          ];
          newSummary = await createIntelligentSummary(
            allMessagesToSummarize,
            HISTORY_CONFIG.SUMMARY_TARGET_TOKENS
          );
        }
      } else {
        newSummary = oldConversationSummary;
      }
    }

    const finalTokenCount =
      estimateTokenCount(recentMessages) +
      estimateTokenCount([{ content: newSummary || '' }]);
    const tokenReduction = initialTokenCount - finalTokenCount;
    const reductionPercentage = (
      (tokenReduction / initialTokenCount) *
      100
    ).toFixed(1);

    console.log(`✅ History management completed:`);
    console.log(
      `   📉 Token reduction: ${tokenReduction} (${reductionPercentage}%)`
    );
    console.log(`   📊 Final token count: ${finalTokenCount}`);
    console.log(`   📝 Has summary: ${!!newSummary}`);
    console.log(`   🔄 Recent messages: ${recentMessages.length}`);

    return {
      managedHistory: recentMessages,
      conversationSummary: newSummary,
      historyManaged: true,
      tokenCount: finalTokenCount,
      tokenReduction: tokenReduction,
      reductionPercentage: parseFloat(reductionPercentage),
      summarizedMessages: messagesToSummarize.length,
      keptMessages: recentMessages.length,
    };
  } catch (error) {
    console.error('❌ Error in intelligent history management:', error);

    // Fallback: keep recent messages without summary
    const fallbackMessages = history.slice(
      -HISTORY_CONFIG.MIN_MESSAGES_TO_KEEP
    );
    return {
      managedHistory: fallbackMessages,
      conversationSummary: existingSummary,
      historyManaged: false,
      tokenCount: estimateTokenCount(fallbackMessages),
      error: 'History management failed, using fallback',
    };
  }
};

/**
 * Prepares the conversation context for an LLM by intelligently managing history.
 * This function orchestrates the summarization and trimming of past messages,
 * then formats the summary and recent messages into a single string suitable for LLM input.
 *
 * @async
 * @param {Array<Object>} history - The full array of conversation message objects.
 * @param {string|null} [existingSummary=null] - An optional existing summary string.
 * @param {string} [currentQuery=''] - The current user query for which the context is being prepared. Used for logging/contextual awareness.
 * @returns {Promise<Object>} A promise that resolves to an object containing the formatted conversation context and management details.
 * @property {Array<Object>} managedHistory - The trimmed array of recent conversation messages after management.
 * @property {string|null} conversationSummary - The updated or newly created conversation summary.
 * @property {string} formattedContext - The combined, formatted string of the summary and recent messages, ready for LLM input.
 * @property {boolean} historyManaged - True if history management (summarization/trimming) was performed.
 * @property {number} tokenCount - The estimated token count of the `managedHistory` plus the `conversationSummary`.
 * @property {number} contextTokens - The estimated token count of the `formattedContext` string.
 * @property {boolean} isOptimized - Alias for `historyManaged`, indicating if the context was optimized.
 * @property {string} [error] - An error message if context preparation failed.
 */
export const prepareConversationContext = async (
  history,
  existingSummary = null,
  currentQuery = ''
) => {
  try {
    console.log(
      `🔧 Preparing conversation context for query: "${currentQuery}"`
    );

    // First, check if history management is needed
    const managementResult = await manageConversationHistoryIntelligent(
      history,
      existingSummary
    );

    // Build formatted conversation context
    let conversationContext = '';

    // Add summary if available
    if (managementResult.conversationSummary) {
      conversationContext += `## Previous Conversation Summary:\n${managementResult.conversationSummary}\n\n`;
    }

    // Add recent conversation history
    if (
      managementResult.managedHistory &&
      managementResult.managedHistory.length > 0
    ) {
      conversationContext += `## Recent Conversation:\n`;
      managementResult.managedHistory.forEach((msg) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        // BUG FIX: Removed arbitrary truncation of recent messages.
        // The `manageConversationHistoryIntelligent` function is responsible
        // for determining which messages to keep in full. Truncating them
        // here would lead to loss of context for the LLM.
        const content = msg.content;
        conversationContext += `**${role}**: ${content}\n\n`;
      });
    }

    const contextTokens = estimateTokenCount([
      { content: conversationContext },
    ]);

    console.log(`✅ Context prepared - ${contextTokens} tokens`);

    return {
      ...managementResult,
      formattedContext: conversationContext,
      contextTokens: contextTokens,
      isOptimized: managementResult.historyManaged,
    };
  } catch (error) {
    console.error('❌ Error preparing conversation context:', error);
    return {
      managedHistory:
        history?.slice(-HISTORY_CONFIG.MIN_MESSAGES_TO_KEEP) || [],
      conversationSummary: existingSummary,
      formattedContext: '',
      historyManaged: false,
      tokenCount: 0,
      contextTokens: 0,
      error: error.message,
    };
  }
};