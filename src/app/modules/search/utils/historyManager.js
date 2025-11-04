import { HISTORY_CONFIG } from '../config/historyConfig.js';
import { llm } from '../services/geminiService.js';

/**
 * History Management Utilities
 * Intelligent conversation history management with token-aware summarization
 */

/**
 * Estimates token count for conversation history
 * Uses character-to-token ratio for fast estimation
 */
export const estimateTokenCount = (history) => {
  if (!Array.isArray(history) || history.length === 0) return 0;
  console.log(`Estimating tokens for ${history.length} messages`);

  let totalCharacters = 0;
  history.forEach(msg => {
    if (msg && msg.content) {
      totalCharacters += msg.content.length;
      // Add overhead for role and formatting
      totalCharacters += 20;
    }
  });

  // Convert characters to estimated tokens
  const estimatedTokens = Math.ceil(totalCharacters / HISTORY_CONFIG.TOKEN_ESTIMATION_RATIO);

  console.log(`📊 Token estimation: ${totalCharacters} chars ≈ ${estimatedTokens} tokens`);
  return estimatedTokens;
};

/**
 * Checks if conversation history needs management
 */
export const needsHistoryManagement = (history, existingSummary = null) => {
  if (!Array.isArray(history) || history.length === 0) return false;

  const tokenCount = estimateTokenCount(history);
  const threshold = HISTORY_CONFIG.MAX_TOKENS * 0.7; // Summarize at 70% of max tokens (2800 tokens)

  const needsManagement = tokenCount > threshold;

  console.log(`🔍 History check: ${tokenCount} tokens (threshold: ${threshold})`);
  console.log(`📝 Needs management: ${needsManagement}`);

  return needsManagement;
};

/**
 * Creates an intelligent conversation summary using Gemini
 * Targets specific token count for optimal context retention
 */
export const createIntelligentSummary = async (messagesToSummarize, targetTokens = HISTORY_CONFIG.SUMMARY_TARGET_TOKENS) => {
  try {
    if (!Array.isArray(messagesToSummarize) || messagesToSummarize.length === 0) {
      return "";
    }

    console.log(`🧠 Creating intelligent summary for ${messagesToSummarize.length} messages`);
    console.log(`🎯 Target: ${targetTokens} tokens`);

    // Format messages for summarization
    const conversationText = messagesToSummarize
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
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
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Conversation to summarize:\n\n${conversationText}`
      }
    ];

    console.log(`🔄 Generating summary with Gemini...`);
    const startTime = Date.now();

    const response = await llm.invoke(messages);
    const summary = response.content.trim();

    const duration = Date.now() - startTime;
    const summaryTokens = estimateTokenCount([{ content: summary }]);

    console.log(`✅ Summary created in ${duration}ms`);
    console.log(`📏 Summary length: ${summary.length} chars ≈ ${summaryTokens} tokens`);
    console.log(`🎯 Target efficiency: ${((summaryTokens / targetTokens) * 100).toFixed(1)}%`);

    return summary;

  } catch (error) {
    console.error("❌ Error creating intelligent summary:", error);
    // Fallback to simple summary
    return `Previous conversation covered ${messagesToSummarize.length} messages with topics including search queries and responses. Context available but couldn't be fully summarized due to technical issues.`;
  }
};

/**
 * Intelligently manages conversation history with smart summarization and trimming
 * Automatically triggers when token limits are approached
 */
export const manageConversationHistoryIntelligent = async (history, existingSummary = null, forceManagement = false) => {
  try {
    if (!Array.isArray(history)) {
      console.log("⚠️ Invalid history format, returning empty state");
      return {
        managedHistory: [],
        conversationSummary: existingSummary,
        historyManaged: false,
        tokenCount: 0
      };
    }

    const initialTokenCount = estimateTokenCount(history);
    console.log(`🔍 Starting history management - Initial tokens: ${initialTokenCount}`);

    // Check if management is needed
    if (!forceManagement && !needsHistoryManagement(history, existingSummary)) {
      console.log("✅ History within limits, no management needed");
      return {
        managedHistory: history,
        conversationSummary: existingSummary,
        historyManaged: false,
        tokenCount: initialTokenCount
      };
    }

    console.log(`🚀 History management triggered - Processing ${history.length} messages`);

    // Determine how many recent messages to keep
    const messagesToKeep = Math.min(
      Math.max(HISTORY_CONFIG.MIN_MESSAGES_TO_KEEP,
        Math.floor(history.length * 0.3)), // Keep at least 30% of messages
      HISTORY_CONFIG.MAX_MESSAGES_TO_KEEP
    );

    const recentMessages = history.slice(-messagesToKeep);
    const messagesToSummarize = history.slice(0, -messagesToKeep);

    console.log(`📊 Management plan:`);
    console.log(`   📝 Messages to summarize: ${messagesToSummarize.length}`);
    console.log(`   🔄 Recent messages to keep: ${recentMessages.length}`);

    // Create intelligent summary if we have enough messages to summarize
    let newSummary = existingSummary;
    if (messagesToSummarize.length >= 2) { // Need at least 2 messages to summarize
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
          console.log(`📏 Combined summary too long (${combinedTokens} tokens), recreating...`);
          // Recreate summary with all messages that would be summarized
          const allMessagesToSummarize = [
            { role: 'assistant', content: `Previous summary: ${existingSummary}` },
            ...messagesToSummarize
          ];
          newSummary = await createIntelligentSummary(allMessagesToSummarize, HISTORY_CONFIG.SUMMARY_TARGET_TOKENS);
        }
      } else {
        newSummary = oldConversationSummary;
      }
    }

    const finalTokenCount = estimateTokenCount(recentMessages) + estimateTokenCount([{ content: newSummary || '' }]);
    const tokenReduction = initialTokenCount - finalTokenCount;
    const reductionPercentage = ((tokenReduction / initialTokenCount) * 100).toFixed(1);

    console.log(`✅ History management completed:`);
    console.log(`   📉 Token reduction: ${tokenReduction} (${reductionPercentage}%)`);
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
      keptMessages: recentMessages.length
    };

  } catch (error) {
    console.error("❌ Error in intelligent history management:", error);

    // Fallback: keep recent messages without summary
    const fallbackMessages = history.slice(-HISTORY_CONFIG.MIN_MESSAGES_TO_KEEP);
    return {
      managedHistory: fallbackMessages,
      conversationSummary: existingSummary,
      historyManaged: false,
      tokenCount: estimateTokenCount(fallbackMessages),
      error: "History management failed, using fallback"
    };
  }
};

/**
 * Prepares conversation context with intelligent history management
 * This is the main function to call before processing any query
 */
export const prepareConversationContext = async (history, existingSummary = null, currentQuery = '') => {
  try {
    console.log(`🔧 Preparing conversation context for query: "${currentQuery}"`);

    // First, check if history management is needed
    const managementResult = await manageConversationHistoryIntelligent(history, existingSummary);

    // Build formatted conversation context
    let conversationContext = "";

    // Add summary if available
    if (managementResult.conversationSummary) {
      conversationContext += `## Previous Conversation Summary:\n${managementResult.conversationSummary}\n\n`;
    }

    // Add recent conversation history
    if (managementResult.managedHistory && managementResult.managedHistory.length > 0) {
      conversationContext += `## Recent Conversation:\n`;
      managementResult.managedHistory.forEach(msg => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const content = msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content;
        conversationContext += `**${role}**: ${content}\n\n`;
      });
    }

    const contextTokens = estimateTokenCount([{ content: conversationContext }]);

    console.log(`✅ Context prepared - ${contextTokens} tokens`);

    return {
      ...managementResult,
      formattedContext: conversationContext,
      contextTokens: contextTokens,
      isOptimized: managementResult.historyManaged
    };

  } catch (error) {
    console.error("❌ Error preparing conversation context:", error);
    return {
      managedHistory: history?.slice(-HISTORY_CONFIG.MIN_MESSAGES_TO_KEEP) || [],
      conversationSummary: existingSummary,
      formattedContext: "",
      historyManaged: false,
      tokenCount: 0,
      contextTokens: 0,
      error: error.message
    };
  }
};
