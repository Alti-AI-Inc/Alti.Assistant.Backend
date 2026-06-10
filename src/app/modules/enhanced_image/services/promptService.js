/**
 * @file This module provides the PromptService class for interacting with prompt evaluation and enhancement utilities.
 * @module modules/enhanced_image/services/promptService
 */

import {
  evaluatePromptQuality,
  buildEnhancedPrompt,
} from '../utils/promptEvaluator.js';

/**
 * @class PromptService
 * @description A service class responsible for orchestrating prompt evaluation and enhancement operations.
 *              It leverages external utilities to assess prompt quality and generate improved prompts based on conversation history.
 */
export class PromptService {
  /**
   * @constructor
   * @param {string} apiKey - The API key required for authenticating with external prompt evaluation/enhancement services.
   */
  constructor(apiKey) {
    /**
     * @private
     * @type {string}
     * @description The API key used for authenticating with external services.
     */
    this.apiKey = apiKey;
  }

  /**
   * @async
   * @method evaluatePrompt
   * @description Evaluates the quality of a given prompt using an external utility.
   * @param {string} prompt - The prompt string to be evaluated.
   * @param {Array<Object>} history - An array of historical messages or interactions relevant to the prompt.
   * @param {string} history[].role - The role of the speaker (e.g., 'user', 'assistant').
   * @param {string} history[].content - The content of the message.
   * @returns {Promise<Object>} A promise that resolves to an object containing the evaluation results.
   * @throws {Error} If the underlying prompt evaluation utility encounters an error.
   */
  async evaluatePrompt(prompt, history) {
    return await evaluatePromptQuality(prompt, history, {
      apiKey: this.apiKey,
    });
  }

  /**
   * @async
   * @method buildEnhancedPrompt
   * @description Builds an enhanced prompt based on the provided conversation history using an external utility.
   * @param {Array<Object>} conversationHistory - An array of historical messages or interactions to inform the enhanced prompt.
   * @param {string} conversationHistory[].role - The role of the speaker (e.g., 'user', 'assistant').
   * @param {string} conversationHistory[].content - The content of the message.
   * @returns {Promise<string>} A promise that resolves to the enhanced prompt string.
   * @throws {Error} If the underlying prompt enhancement utility encounters an error.
   */
  async buildEnhancedPrompt(conversationHistory) {
    return await buildEnhancedPrompt(conversationHistory, {
      apiKey: this.apiKey,
    });
  }
}