/**
 * @file Utility functions for the presentation module, providing helpers for validation, formatting,
 * and data manipulation related to presentation generation and task management.
 * @module presentation/utils/helpers
 */

/**
 * Represents a single slide edit object.
 * @typedef {object} SlideEdit
 * @property {number} index - The 0-based index of the slide to be edited.
 * @property {object} content - The new content for the slide. The structure depends on the slide type.
 */

/**
 * Validates an array of slide edit objects to ensure their indices are within valid bounds
 * and their structure is correct. Each slide object must have a numeric `index` that is
 * non-negative and less than `maxSlides`, and its `content` must be a non-null object.
 *
 * @param {Array<SlideEdit>} slides - An array of slide edit objects, each containing an `index` and `content`.
 * @param {number} maxSlides - The maximum number of slides allowed in the presentation (exclusive upper bound for index).
 *                             INTEGRATION NOTE: The calling function is responsible for ensuring `maxSlides` is derived from the
 *                             user's current subscription plan and tenant/workspace limits.
 * @returns {boolean} - `true` if all slide indices are valid and content is an object, `false` otherwise.
 */
export const validateSlideIndices = (slides, maxSlides) => {
  if (!Array.isArray(slides)) return false;

  return slides.every((slide) => {
    return (
      typeof slide.index === 'number' &&
      slide.index >= 0 &&
      slide.index < maxSlides &&
      typeof slide.content === 'object' &&
      slide.content !== null // Ensure content is a non-null object
    );
  });
};

/**
 * Represents the result object for a synchronous presentation generation.
 * @typedef {object} SyncPresentationResult
 * @property {string} presentation_id - The unique ID of the generated presentation.
 * @property {string} path - The URL or path to download the presentation.
 * @property {string} edit_path - The URL to edit the presentation online.
 * @property {number} credits_consumed - The number of credits consumed for this generation.
 */

/**
 * Represents the result object for an asynchronous presentation generation task.
 * @typedef {object} AsyncPresentationResult
 * @property {string} id - The unique ID of the asynchronous task.
 * @property {string} status - The current status of the task (e.g., 'pending', 'processing').
 * @property {string} created_at - ISO 8601 timestamp when the task was created.
 */

/**
 * Formats the presentation generation result into a user-friendly string message.
 * This function handles both synchronous and asynchronous task results, providing
 * different messages based on the `isAsync` flag.
 *
 * @param {SyncPresentationResult | AsyncPresentationResult} result - The result object from the presentation API.
 * @param {boolean} [isAsync=false] - A flag indicating whether the result pertains to an asynchronous task.
 * @returns {string} - A formatted string message suitable for display to the user.
 *                     INTEGRATION NOTE: The calling function is responsible for persisting the `credits_consumed` value
 *                     (for synchronous results) against the user's account and workspace. It should also handle
 *                     notifying managers or administrators if usage limits are approached or exceeded.
 */
export const formatPresentationResult = (result, isAsync = false) => {
  // BUG FIX: Add a guard clause to handle cases where the result object is null or undefined, preventing TypeErrors.
  if (!result) {
    return isAsync
      ? '🚀 Presentation task started, but result details are currently unavailable.'
      : '🎉 Presentation generated, but result details are currently unavailable.';
  }

  if (isAsync) {
    // result is AsyncPresentationResult
    return (
      `🚀 Presentation generation started!\n\n` +
      `Task ID: ${result.id}\n` +
      `Status: ${result.status}\n` +
      `Created: ${new Date(result.created_at).toLocaleString()}\n\n` +
      `You can check the status anytime by asking me!`
    );
  }

  // result is SyncPresentationResult
  return (
    `🎉 Your presentation is ready!\n\n` +
    `📊 Presentation ID: ${result.presentation_id}\n` +
    `📥 Download: ${result.path}\n` +
    `✏️ Edit online: ${result.edit_path}\n` +
    `💳 Credits consumed: ${result.credits_consumed}`
  );
};

/**
 * Represents the detailed data for a completed task.
 * @typedef {object} CompletedTaskData
 * @property {string} presentation_id - The unique ID of the generated presentation.
 * @property {string} path - The URL or path to download the presentation.
 * @property {string} edit_path - The URL to edit the presentation online.
 * @property {number} credits_consumed - The number of credits consumed.
 */

/**
 * Represents the status result object for a presentation generation task.
 * @typedef {object} TaskStatusResult
 * @property {string} status - The current status of the task (e.g., 'completed', 'failed', 'processing', 'pending').
 * @property {string} [message] - An optional message providing more details about the task status, especially for 'failed' or 'unknown' statuses.
 * @property {CompletedTaskData} [data] - The data associated with the task, present only if `status` is 'completed'.
 */

/**
 * Formats the task status result into a user-friendly string message based on the task's current status.
 * It provides specific messages for 'completed', 'failed', 'processing', and 'pending' statuses.
 *
 * @param {TaskStatusResult} result - The task status result object from the API.
 * @returns {string} - A formatted string message describing the task's status and relevant details.
 *                     INTEGRATION NOTE: When a task completes successfully, the calling function is responsible for
 *                     persisting the `credits_consumed` value against the user's account and workspace. It should also
 *                     handle notifying managers or administrators if usage limits are approached or exceeded.
 */
export const formatTaskStatus = (result) => {
  // BUG FIX: Add a guard clause to handle cases where the result object is null or lacks a status, preventing TypeErrors.
  if (!result || !result.status) {
    return '📋 Task Status: UNKNOWN\n\nCould not retrieve task status details.';
  }

  let message = `📋 Task Status: ${result.status.toUpperCase()}\n\n`;

  switch (result.status) {
    case 'completed':
      // This check correctly prevents a TypeError if data is missing on a completed task.
      if (result.data) {
        message +=
          `🎉 Your presentation is ready!\n\n` +
          `📊 Presentation ID: ${result.data.presentation_id}\n` +
          `📥 Download: ${result.data.path}\n` +
          `✏️ Edit online: ${result.data.edit_path}\n` +
          `💳 Credits consumed: ${result.data.credits_consumed}`;
      } else {
        message += `✅ Task completed, but presentation details are unavailable. Please check your dashboard.`;
      }
      break;

    case 'failed':
      // BUG FIX: Provide a fallback message if `result.message` is not available.
      message += `❌ Generation failed: ${result.message || 'No specific reason provided.'}`;
      break;

    case 'processing':
      message += `⏳ Still generating... Please check back in a moment.`;
      break;

    case 'pending':
      message += `📝 Task is queued and will start shortly.`;
      break;

    default:
      message += result.message || 'Status unknown. Please contact support if this persists.';
  }

  return message;
};

/**
 * Sanitizes user input by trimming leading/trailing whitespace and truncating it to a maximum length of 5000 characters.
 * This helps prevent overly long inputs and basic injection attempts.
 *
 * @param {string} input - The raw user input string.
 * @returns {string} - The sanitized string, trimmed and truncated.
 *                     Returns an empty string if the input is not a string.
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, 5000); // Max 5000 characters
};

/**
 * Extracts a presentation ID (expected to be in UUID format) from a given text string.
 * It uses a regular expression to find the first occurrence of a UUID pattern.
 *
 * @param {string} text - The user message or text potentially containing a presentation ID.
 * @returns {string|null} - The extracted presentation ID (UUID string) if found, otherwise `null`.
 *                          SECURITY WARNING: The returned ID is not validated for ownership. The calling
 *                          function MUST verify that the current user (and their tenant/workspace) has
 *                          explicit permission to access the resource with this ID to prevent Insecure
 *                          Direct Object Reference (IDOR) vulnerabilities. This check must be performed
 *                          for all roles (user, manager, admin, super_admin).
 */
export const extractPresentationId = (text) => {
  if (typeof text !== 'string') return null;
  // Match UUID format: 8-4-4-4-12 hexadecimal characters
  const uuidRegex =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = text.match(uuidRegex);
  return match ? match[0] : null;
};

/**
 * Extracts a task ID from a given text string. Task IDs are expected to be in the format `task-xxxxx`,
 * where `xxxxx` is an alphanumeric string. It returns the full `task-xxxxx` string.
 *
 * @param {string} text - The user message or text potentially containing a task ID.
 * @returns {string|null} - The extracted task ID (e.g., "task-abc123") if found, otherwise `null`.
 *                          SECURITY WARNING: The returned ID is not validated for ownership. The calling
 *                          function MUST verify that the current user (and their tenant/workspace) has
 *                          explicit permission to access the resource with this ID to prevent Insecure
 *                          Direct Object Reference (IDOR) vulnerabilities. This check must be performed
 *                          for all roles (user, manager, admin, super_admin).
 */
export const extractTaskId = (text) => {
  if (typeof text !== 'string') return null;
  // Match task-xxxxx format
  const taskRegex = /task-([a-z0-9-]+)/i; // Allow hyphens in the task ID part for more flexibility
  const match = text.match(taskRegex);
  // Return the full match, e.g., "task-abc123"
  return match ? match[0] : null;
};

/**
 * Merges new parameters into an existing parameters object.
 * New parameters will override existing ones only if their values are not `undefined` or `null`.
 * This allows for intelligent merging where only explicitly provided new values update the existing ones.
 *
 * @param {Record<string, any>} existing - The existing parameters object.
 * @param {Record<string, any>} newParams - The new parameters object to merge.
 * @returns {Record<string, any>} - A new object containing the merged parameters.
 */
export const mergeParameters = (existing, newParams) => {
  const merged = { ...existing };

  // BUG FIX: Ensure newParams is a non-null object before attempting to iterate over its keys.
  if (typeof newParams === 'object' && newParams !== null) {
    Object.keys(newParams).forEach((key) => {
      if (newParams[key] !== undefined && newParams[key] !== null) {
        merged[key] = newParams[key];
      }
    });
  }

  return merged;
};

/**
 * Represents the structure of the return object from `checkParametersComplete`.
 * @typedef {object} ParameterCompletionStatus
 * @property {boolean} complete - `true` if all required parameters for the intent are present, `false` otherwise.
 * @property {Array<string>} missing - An array of strings, where each string is the name of a missing required parameter.
 */

/**
 * Checks if all required parameters for a specific intent are present in the current parameters object.
 * It compares the `params` against a predefined list of `requiredParams` for the given `intent`.
 *
 * @param {string} intent - The name of the intent (e.g., 'create_presentation', 'edit_slide').
 * @param {Record<string, any>} params - The current parameters object collected so far.
 * @param {Record<string, Array<string>>} requiredParams - A map where keys are intent names and values are arrays of required parameter names for that intent.
 * @returns {ParameterCompletionStatus} - An object indicating whether parameters are complete and listing any missing ones.
 */
export const checkParametersComplete = (intent, params, requiredParams) => {
  const required = (requiredParams && requiredParams[intent]) || [];
  // BUG FIX: Changed check from `!params[param]` to `!Object.prototype.hasOwnProperty.call(params, param)`.
  // The original check would incorrectly flag valid "falsy" values (like 0, false, or an empty string) as missing.
  // This new check correctly verifies the presence of the parameter key itself, which is more robust.
  const missing = required.filter(
    (param) => !params || !Object.prototype.hasOwnProperty.call(params, param)
  );

  return {
    complete: missing.length === 0,
    missing,
  };
};