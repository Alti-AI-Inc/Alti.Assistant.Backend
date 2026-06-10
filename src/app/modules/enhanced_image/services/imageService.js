/**
 * @file Service for generating images using various underlying image generation models.
 * @module modules/enhanced_image/services/imageService
 */

import { imagen3 } from '../utils/imagegen2.5.service.js';
import { imagegen_4 } from '../utils/imagegen4.service.js';
import { routeImageGenRequest } from '../utils/intentClassifier.js';
import path from 'path';

/**
 * @class
 * @classdesc Provides a unified interface for generating images by routing requests to appropriate image generation services.
 * It abstracts away the complexity of choosing between different image generation models based on the prompt.
 */
export class ImageGenerationService {
  /**
   * Creates an instance of ImageGenerationService.
   * @param {string} apiKey - The API key required for authenticating with the image generation services.
   * @param {string} imagesDir - The directory path where generated images should be stored locally.
   */
  constructor(apiKey, imagesDir) {
    /**
     * The API key used for authenticating with external image generation services.
     * @type {string}
     */
    this.apiKey = apiKey;
    /**
     * The local directory path where generated images will be saved.
     * @type {string}
     */
    this.imagesDir = imagesDir;
  }

  /**
   * Generates an image based on a given prompt and saves it with a specified filename.
   * It uses an intent classifier to determine which underlying image generation service (e.g., imagen4, gemini2.5flash)
   * is best suited for the prompt.
   *
   * @async
   * @param {string} prompt - The text prompt describing the image to be generated.
   * @param {string} filename - The desired filename for the generated image (e.g., 'my_image.png').
   * @returns {Promise<object>} A promise that resolves to an object containing details about the generated image.
   * @returns {string} return.filename - The filename of the generated image.
   * @returns {string} return.url - The public URL where the generated image can be accessed.
   * @returns {string} return.service - The name of the image generation service used (e.g., 'imagen4', 'gemini2.5flash').
   * @returns {string} return.reasoning - The reasoning provided by the intent classifier for choosing the service.
   * @returns {number} return.confidence - The confidence score from the intent classifier for the chosen service.
   * @throws {Error} If an unsupported service is returned by the intent classifier or if image generation fails.
   */
  async generateImage(prompt, filename) {
    const result = await routeImageGenRequest(prompt, { apiKey: this.apiKey });

    const filepath = path.join(this.imagesDir, filename);
    let publicUrl;

    if (result.service === 'imagen4') {
      publicUrl = await imagegen_4(prompt, filepath);
    } else if (result.service === 'gemini2.5flash') {
      publicUrl = await imagen3(prompt, null, filename);
    } else {
      // Potentially throw an error or handle unsupported service gracefully
      throw new Error(`Unsupported image generation service: ${result.service}`);
    }

    return {
      filename,
      url: publicUrl,
      service: result.service,
      reasoning: result.reasoning,
      confidence: result.confidence,
    };
  }
}