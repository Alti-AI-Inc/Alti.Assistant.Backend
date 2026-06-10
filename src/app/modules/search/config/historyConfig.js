/**
 * @typedef {object} HistoryConfig
 * @property {number} MAX_TOKENS - Maximum number of tokens allowed in the conversation history before summarization is triggered.
 * @property {number} SUMMARY_TARGET_TOKENS - The desired token count for the conversation history after summarization.
 * @property {number} MIN_MESSAGES_TO_KEEP - The minimum number of recent messages to always retain, even after summarization.
 * @property {number} MAX_MESSAGES_TO_KEEP - The maximum number of recent messages to keep after a summarization process.
 * @property {number} TOKEN_ESTIMATION_RATIO - A rough estimation ratio for converting character count to token count (e.g., 1 token ≈ 4 characters).
 * @property {number} SUMMARIZATION_THRESHOLD - The percentage of `MAX_TOKENS` at which summarization should begin (e.g., 0.6 means 60% of max tokens).
 */

/**
 * Configuration for intelligent conversation history management within the AI assistant.
 * These settings control when and how conversation history is summarized to manage token limits
 * and maintain conversational context efficiently.
 * @type {HistoryConfig}
 */
export const HISTORY_CONFIG = {
  MAX_TOKENS: 4000, // Maximum tokens before triggering summarization
  SUMMARY_TARGET_TOKENS: 2500, // Target token count for summary
  MIN_MESSAGES_TO_KEEP: 4, // Minimum recent messages to always keep
  MAX_MESSAGES_TO_KEEP: 8, // Maximum recent messages to keep after summarization
  TOKEN_ESTIMATION_RATIO: 4, // Rough estimation: 1 token ≈ 4 characters
  SUMMARIZATION_THRESHOLD: 0.6, // Start summarization when 60% of max tokens reached
};