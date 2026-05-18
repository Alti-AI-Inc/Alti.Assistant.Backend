/**
 * Format deep research response for consistent API responses
 * @param {string} answer - The research answer
 * @param {string} conversationId - Conversation ID
 * @param {number} messageCount - Number of messages
 * @param {Object} additionalData - Additional response data
 * @returns {Object}
 */
export const formatDeepResearchResponse = (
  answer,
  conversationId,
  messageCount,
  additionalData = {}
) => {
  return {
    answer,
    conversationId,
    messageCount,
    ...additionalData,
  };
};

/**
 * Format deep research error response
 * @param {string} error - Error message
 * @param {string} conversationId - Conversation ID
 * @param {string} userType - User type (guest/authenticated)
 * @returns {Object}
 */
export const formatDeepResearchError = (error, conversationId, userType) => {
  return {
    error,
    conversationId,
    userType,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Format deep research statistics
 * @param {Object} stats - Raw statistics
 * @returns {Object}
 */
export const formatDeepResearchStats = (stats) => {
  return {
    totalResearches: stats.totalDeepResearchConversations || 0,
    totalMessages: stats.totalDeepResearchMessages || 0,
    averageMessagesPerResearch: stats.averageMessagesPerConversation || 0,
    lastUpdated: new Date().toISOString(),
  };
};

/**
 * Format PDF download response
 * @param {Object} pdfData - PDF data
 * @returns {Object}
 */
export const formatPDFResponse = (pdfData) => {
  return {
    filename: pdfData.filename,
    size: pdfData.size,
    downloadUrl: pdfData.downloadUrl,
    generatedAt: new Date().toISOString(),
  };
};

export const deepResearchHelpers = {
  formatDeepResearchResponse,
  formatDeepResearchError,
  formatDeepResearchStats,
  formatPDFResponse,
};
