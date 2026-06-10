/**
 * @file Service for generating images using various underlying image generation models.
 * @module modules/enhanced_image/services/imageService
 */

// Node.js core modules for file system operations, path manipulation, and cryptography.
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

import { imagen3 } from '../utils/imagegen2.5.service.js';
import { imagegen_4 } from '../utils/imagegen4.service.js';
import { routeImageGenRequest } from '../utils/intentClassifier.js';

/**
 * @class
 * @classdesc Provides a unified interface for generating images by routing requests to appropriate image generation services.
 * It abstracts away the complexity of choosing between different image generation models based on the prompt.
 */
export class ImageGenerationService {
  /**
   * Creates an instance of ImageGenerationService.
   * @param {string} apiKey - The API key required for authenticating with the image generation services.
   * @param {string} imagesDir - The root directory path where generated images should be stored locally.
   */
  constructor(apiKey, imagesDir) {
    /**
     * The API key used for authenticating with external image generation services.
     * @type {string}
     */
    this.apiKey = apiKey;
    /**
     * The root local directory path where generated images will be saved, organized by tenant and user.
     * @type {string}
     */
    this.imagesDir = imagesDir;
  }

  /**
   * Generates an image based on a given prompt and saves it to a user-specific, isolated storage location.
   * It uses an intent classifier to determine the best underlying image generation service.
   * This method ensures data isolation, prevents file overwrites, and handles usage quotas gracefully.
   *
   * @async
   * @param {string} prompt - The text prompt describing the image to be generated. Must be a non-empty string.
   * @param {string} filename - The desired base filename for the generated image (e.g., 'my_image.png'). A unique prefix will be added to prevent collisions.
   * @param {object} [context] - The security, tenant, and role context.
   * @param {object} [context.user] - The user object making the request.
   * @param {string} [context.user.id] - The ID of the user.
   * @param {string} [context.user.role] - The role of the user (super_admin, admin, manager, user).
   * @param {string} [context.user.managerId] - The ID of the user's manager.
   * @param {string} [context.tenantId] - The tenant/workspace context boundary.
   * @param {object} [context.services] - Optional injected services for limits, notifications, etc.
   * @param {object} [context.services.limitChecker] - Service to check, consume, and refund usage quotas.
   * @param {object} [context.services.notificationService] - Service to send notifications.
   * @returns {Promise<object>} A promise that resolves to an object containing details about the generated image.
   * @returns {string} return.filename - The unique, final filename of the generated image.
   * @returns {string} return.url - The public URL where the generated image can be accessed.
   * @returns {string} return.service - The name of the image generation service used (e.g., 'imagen4', 'gemini2.5flash').
   * @returns {string} return.reasoning - The reasoning provided by the intent classifier for choosing the service.
   * @returns {number} return.confidence - The confidence score from the intent classifier for the chosen service.
   * @throws {Error} If validation fails, quota is exceeded, or image generation fails.
   */
  async generateImage(prompt, filename, context = {}) {
    const { user, tenantId, services = {} } = context;

    // 1. Input and Context Validation
    if (!tenantId || !user || !user.id || !user.role) {
      throw new Error('Access Denied: Tenant and user context (id, role) are required.');
    }
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Invalid Input: Prompt must be a non-empty string.');
    }
    if (typeof filename !== 'string' || filename.trim().length === 0) {
      throw new Error('Invalid Input: Filename must be a non-empty string.');
    }

    const validRoles = ['super_admin', 'admin', 'manager', 'user'];
    if (!validRoles.includes(user.role)) {
      throw new Error(`Access Denied: Invalid role '${user.role}'.`);
    }

    // 2. Usage Limits Check
    // Check and consume the quota before proceeding with the expensive generation task.
    // The 'consumed' flag helps us know whether to refund the quota if an error occurs later.
    let consumed = false;
    if (services.limitChecker) {
      const hasQuota = await services.limitChecker.checkAndConsume(tenantId, user.id, 1);
      if (!hasQuota) {
        throw new Error('Quota Exceeded: You have reached your image generation limit.');
      }
      consumed = true;
    }

    try {
      // 3. Secure File Path and Data Isolation
      // Create a user-specific directory to ensure data is isolated between users and tenants.
      const userImageDir = path.join(this.imagesDir, tenantId, user.id);

      // Sanitize the filename to prevent path traversal and invalid characters.
      const safeBasename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!safeBasename || safeBasename === '.' || safeBasename === '..') {
        throw new Error('Invalid filename provided.');
      }

      // Generate a unique filename to prevent overwrites and race conditions.
      const uniqueFilename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeBasename}`;
      const filepath = path.join(userImageDir, uniqueFilename);
      
      // Final security check: Ensure the resolved path is strictly inside the designated root images directory.
      const resolvedPath = path.resolve(filepath);
      const resolvedImagesDir = path.resolve(this.imagesDir);
      if (!resolvedPath.startsWith(resolvedImagesDir)) {
        throw new Error('Access Denied: Path traversal detected.');
      }

      // Ensure the user's personal directory exists before writing the file.
      await fs.mkdir(userImageDir, { recursive: true });

      // 4. Image Generation
      // Route the request to the appropriate model and generate the image.
      const result = await routeImageGenRequest(prompt, { apiKey: this.apiKey });
      let publicUrl;

      if (result.service === 'imagen4') {
        publicUrl = await imagegen_4(prompt, filepath);
      } else if (result.service === 'gemini2.5flash') {
        // This service might handle file saving internally or return a buffer.
        // Assuming it needs the unique filename for its own storage/reference.
        publicUrl = await imagen3(prompt, null, uniqueFilename);
      } else {
        throw new Error(`Unsupported image generation service: ${result.service}`);
      }

      // 5. Post-generation Tasks (Notifications & Logging)
      if (services.notificationService) {
        const payload = {
          message: `User ${user.id} (${user.role}) generated an image in tenant ${tenantId}.`,
          userId: user.id,
          tenantId,
          service: result.service,
          filename: uniqueFilename,
        };

        await services.notificationService.notifyHierarchy({
          tenantId,
          role: user.role,
          managerId: user.managerId,
          payload,
        });
      }

      return {
        filename: uniqueFilename,
        url: publicUrl,
        service: result.service,
        reasoning: result.reasoning,
        confidence: result.confidence,
      };
    } catch (error) {
      // 6. Error Handling and Quota Refund
      // If an error occurred after the quota was consumed, refund it to the user.
      // This provides a better user experience, as they are not charged for failed attempts.
      if (consumed && services.limitChecker && typeof services.limitChecker.refund === 'function') {
        await services.limitChecker.refund(tenantId, user.id, 1);
      }
      // Re-throw the original error to be handled by the upstream controller/middleware.
      // It's important to preserve the original error context.
      throw error;
    }
  }
}