/**
 * Configuration for intelligent conversation history management
 */
export const HISTORY_CONFIG = {
  MAX_TOKENS: 4000,           // Maximum tokens before triggering summarization
  SUMMARY_TARGET_TOKENS: 2500, // Target token count for summary
  MIN_MESSAGES_TO_KEEP: 4,    // Minimum recent messages to always keep
  MAX_MESSAGES_TO_KEEP: 8,    // Maximum recent messages to keep after summarization
  TOKEN_ESTIMATION_RATIO: 4,  // Rough estimation: 1 token ≈ 4 characters
  SUMMARIZATION_THRESHOLD: 0.6 // Start summarization when 60% of max tokens reached
};
