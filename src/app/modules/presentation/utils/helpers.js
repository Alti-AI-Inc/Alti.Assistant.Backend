/**
 * Utility functions for presentation module
 */

/**
 * Validate slide indices
 * @param {Array} slides - Array of slide edits
 * @param {number} maxSlides - Maximum number of slides
 * @returns {boolean}
 */
export const validateSlideIndices = (slides, maxSlides) => {
  if (!Array.isArray(slides)) return false;

  return slides.every((slide) => {
    return (
      typeof slide.index === 'number' &&
      slide.index >= 0 &&
      slide.index < maxSlides &&
      typeof slide.content === 'object'
    );
  });
};

/**
 * Format presentation result for user display
 * @param {Object} result - Presenton API result
 * @param {boolean} isAsync - Whether this is an async task
 * @returns {string}
 */
export const formatPresentationResult = (result, isAsync = false) => {
  if (isAsync) {
    return (
      `🚀 Presentation generation started!\n\n` +
      `Task ID: ${result.id}\n` +
      `Status: ${result.status}\n` +
      `Created: ${new Date(result.created_at).toLocaleString()}\n\n` +
      `You can check the status anytime by asking me!`
    );
  }

  return (
    `🎉 Your presentation is ready!\n\n` +
    `📊 Presentation ID: ${result.presentation_id}\n` +
    `📥 Download: ${result.path}\n` +
    `✏️ Edit online: ${result.edit_path}\n` +
    `💳 Credits consumed: ${result.credits_consumed}`
  );
};

/**
 * Format task status result
 * @param {Object} result - Task status result
 * @returns {string}
 */
export const formatTaskStatus = (result) => {
  let message = `📋 Task Status: ${result.status.toUpperCase()}\n\n`;

  switch (result.status) {
    case 'completed':
      message +=
        `🎉 Your presentation is ready!\n\n` +
        `📊 Presentation ID: ${result.data.presentation_id}\n` +
        `📥 Download: ${result.data.path}\n` +
        `✏️ Edit online: ${result.data.edit_path}\n` +
        `💳 Credits consumed: ${result.data.credits_consumed}`;
      break;

    case 'failed':
      message += `❌ Generation failed: ${result.message}`;
      break;

    case 'processing':
      message += `⏳ Still generating... Please check back in a moment.`;
      break;

    case 'pending':
      message += `📝 Task is queued and will start shortly.`;
      break;

    default:
      message += result.message || 'Status unknown';
  }

  return message;
};

/**
 * Sanitize user input to prevent injection
 * @param {string} input - User input
 * @returns {string}
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, 5000); // Max 5000 characters
};

/**
 * Extract presentation ID from various formats
 * @param {string} text - User message
 * @returns {string|null}
 */
export const extractPresentationId = (text) => {
  // Match UUID format
  const uuidRegex =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = text.match(uuidRegex);
  return match ? match[0] : null;
};

/**
 * Extract task ID from various formats
 * @param {string} text - User message
 * @returns {string|null}
 */
export const extractTaskId = (text) => {
  // Match task-xxxxx format or just the ID part
  const taskRegex = /task-([a-z0-9]+)/i;
  const match = text.match(taskRegex);
  return match ? match[0] : null;
};

/**
 * Merge parameters intelligently
 * @param {Object} existing - Existing parameters
 * @param {Object} newParams - New parameters
 * @returns {Object}
 */
export const mergeParameters = (existing, newParams) => {
  const merged = { ...existing };

  Object.keys(newParams).forEach((key) => {
    if (newParams[key] !== undefined && newParams[key] !== null) {
      merged[key] = newParams[key];
    }
  });

  return merged;
};

/**
 * Check if parameters are complete for a given intent
 * @param {string} intent - Intent type
 * @param {Object} params - Current parameters
 * @param {Object} requiredParams - Required parameters map
 * @returns {Object} - { complete: boolean, missing: Array }
 */
export const checkParametersComplete = (intent, params, requiredParams) => {
  const required = requiredParams[intent] || [];
  const missing = required.filter((param) => !params[param]);

  return {
    complete: missing.length === 0,
    missing,
  };
};
