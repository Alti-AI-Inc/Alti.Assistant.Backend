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
   * @param {object} [context] - The security, tenant, and role context.
   * @param {object} [context.user] - The user object making the request.
   * @param {string} [context.user.id] - The ID of the user.
   * @param {string} [context.user.role] - The role of the user (super_admin, admin, manager, user).
   * @param {string} [context.user.managerId] - The ID of the user's manager.
   * @param {string} [context.tenantId] - The tenant/workspace context boundary.
   * @param {object} [context.services] - Optional injected services for limits, notifications, etc.
   * @returns {Promise<object>} A promise that resolves to an object containing details about the generated image.
   * @returns {string} return.filename - The filename of the generated image.
   * @returns {string} return.url - The public URL where the generated image can be accessed.
   * @returns {string} return.service - The name of the image generation service used (e.g., 'imagen4', 'gemini2.5flash').
   * @returns {string} return.reasoning - The reasoning provided by the intent classifier for choosing the service.
   * @returns {number} return.confidence - The confidence score from the intent classifier for the chosen service.
   * @throws {Error} If an unsupported service is returned by the intent classifier, if validation fails, or if image generation fails.
   */
  async generateImage(prompt, filename, context = {}) {
    const { user, tenantId, services = {} } = context;

    // 1. Tenant Context Validation
    if (!tenantId) {
      throw new Error('Access Denied: Tenant context boundary is missing.');
    }

    // 2. Role Validation
    if (!user || !user.role) {
      throw new Error('Access Denied: User context and role are required.');
    }

    const validRoles = ['super_admin', 'admin', 'manager', 'user'];
    if (!validRoles.includes(user.role)) {
      throw new Error(`Access Denied: Invalid role '${user.role}'.`);
    }

    // 3. Usage Limits & Propagation
    if (services.limitChecker) {
      const hasQuota = await services.limitChecker.checkAndConsume(tenantId, user.id, 1);
      if (!hasQuota) {
        throw new Error('Quota Exceeded: Tenant or user has reached their image generation limit.');
      }
    }

    // 4. Path Traversal Prevention
    const safeFilename = path.basename(filename);
    if (!safeFilename || safeFilename === '.' || safeFilename === '..') {
      throw new Error('Invalid filename provided.');
    }
    const filepath = path.join(this.imagesDir, safeFilename);
    
    // Ensure the resolved path is strictly inside the designated images directory
    const resolvedPath = path.resolve(filepath);
    const resolvedImagesDir = path.resolve(this.imagesDir);
    if (!resolvedPath.startsWith(resolvedImagesDir)) {
      throw new Error('Access Denied: Path traversal detected.');
    }

    const result = await routeImageGenRequest(prompt, { apiKey: this.apiKey });
    let publicUrl;

    if (result.service === 'imagen4') {
      publicUrl = await imagegen_4(prompt, filepath);
    } else if (result.service === 'gemini2.5flash') {
      publicUrl = await imagen3(prompt, null, safeFilename);
    } else {
      throw new Error(`Unsupported image generation service: ${result.service}`);
    }

    // 5. Propagate usage details and notifications up the hierarchy
    if (services.notificationService) {
      const payload = {
        message: `User ${user.id} (${user.role}) generated an image in tenant ${tenantId}.`,
        userId: user.id,
        tenantId,
        service: result.service,
      };

      await services.notificationService.notifyHierarchy({
        tenantId,
        role: user.role,
        managerId: user.managerId,
        payload,
      });
    }

    return {
      filename: safeFilename,
      url: publicUrl,
      service: result.service,
      reasoning: result.reasoning,
      confidence: result.confidence,
    };
  }
}