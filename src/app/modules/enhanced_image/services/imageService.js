/**
 * @file Service for generating images using various underlying image generation models.
 * @module modules/enhanced_image/services/imageService
 */

// Node.js core modules for cryptography.
import crypto from 'crypto';

// Google Cloud Storage for direct, stateless file handling.
import { Storage } from '@google-cloud/storage';

import { imagen3 } from '../utils/imagegen2.5.service.js';
import { imagegen_4 } from '../utils/imagegen4.service.js';
import { routeImageGenRequest } from '../utils/intentClassifier.js';

/**
 * @class
 * @classdesc Provides a unified interface for generating images by routing requests to appropriate image generation services.
 * It abstracts away the complexity of choosing between different image generation models based on the prompt and streams results directly to Google Cloud Storage.
 */
export class ImageGenerationService {
  /**
   * Creates an instance of ImageGenerationService.
   * @param {string} apiKey - The API key required for authenticating with the image generation services.
   * @param {string} gcsBucketName - The name of the Google Cloud Storage bucket to store generated images.
   */
  constructor(apiKey, gcsBucketName) {
    if (!gcsBucketName) {
      throw new Error('GCS bucket name is required for ImageGenerationService.');
    }
    /**
     * The API key used for authenticating with external image generation services.
     * @type {string}
     */
    this.apiKey = apiKey;
    /**
     * The Google Cloud Storage client instance.
     * @type {Storage}
     */
    this.storage = new Storage();
    /**
     * The GCS bucket where generated images will be uploaded.
     * @type {import('@google-cloud/storage').Bucket}
     */
    this.bucket = this.storage.bucket(gcsBucketName);
  }

  /**
   * Generates an image based on a given prompt and streams it directly to a user-specific, isolated path in a GCS bucket.
   * It uses an intent classifier to determine the best underlying image generation service.
   * This method ensures data isolation, prevents file overwrites, and handles usage quotas gracefully.
   * It returns a secure, time-limited signed URL for accessing the generated image.
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
   * @param {object} [context.services.rateLimiter] - Service to enforce rate limits against API abuse (e.g., using Redis).
   * @returns {Promise<object>} A promise that resolves to an object containing details about the generated image.
   * @returns {string} return.filename - The unique, final filename of the generated image in GCS.
   * @returns {string} return.url - The secure, time-limited signed URL to access the generated image.
   * @returns {string} return.service - The name of the image generation service used (e.g., 'imagen4', 'gemini2.5flash').
   * @returns {string} return.reasoning - The reasoning provided by the intent classifier for choosing the service.
   * @returns {number} return.confidence - The confidence score from the intent classifier for the chosen service.
   * @throws {Error} If validation fails, quota is exceeded, or image generation fails.
   */
  async generateImage(prompt, filename, context = {}) {
    const { user, tenantId, services = {} } = context;
    const { limitChecker, notificationService, rateLimiter } = services;

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

    // 2. Rate Limiting
    if (rateLimiter) {
      const limits = {
        user: { points: 5, duration: 60 },
        manager: { points: 10, duration: 60 },
        admin: { points: 20, duration: 60 },
        super_admin: { points: 50, duration: 60 },
      };
      const userLimit = limits[user.role] || limits.user;
      await rateLimiter.consume(`imagegen_user_${user.id}`, 1, userLimit.points, userLimit.duration);
      await rateLimiter.consume(`imagegen_tenant_${tenantId}`, 1, 100, 60);
    }

    // 3. Usage Limits Check
    let consumed = false;
    if (services.limitChecker) {
      const hasQuota = await services.limitChecker.checkAndConsume(tenantId, user.id, 1);
      if (!hasQuota) {
        throw new Error('Quota Exceeded: You have reached your image generation limit.');
      }
      consumed = true;
    }

    try {
      // 4. GCS Object Path Generation and Data Isolation
      // Sanitize the filename to prevent invalid GCS object names.
      const safeBasename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!safeBasename || safeBasename === '.' || safeBasename === '..') {
        throw new Error('Invalid filename provided.');
      }

      // Generate a unique filename to prevent overwrites.
      const uniqueFilename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeBasename}`;
      
      // Create a user-specific GCS path to ensure data is isolated between users and tenants.
      const gcsObjectPath = `${tenantId}/${user.id}/${uniqueFilename}`;

      // 5. Image Generation and Streaming Upload to GCS
      const result = await routeImageGenRequest(prompt, { apiKey: this.apiKey });
      let imageBuffer; // Assume underlying services return a Buffer

      if (result.service === 'imagen4') {
        // Assumption: imagegen_4 now returns the image data as a Buffer instead of writing to a file.
        imageBuffer = await imagegen_4(prompt);
      } else if (result.service === 'gemini2.5flash') {
        // Assumption: imagen3 now returns the image data as a Buffer.
        imageBuffer = await imagen3(prompt);
      } else {
        throw new Error(`Unsupported image generation service: ${result.service}`);
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Image generation failed: received empty image data.');
      }

      // Upload the image buffer directly to Google Cloud Storage.
      const gcsFile = this.bucket.file(gcsObjectPath);
      await gcsFile.save(imageBuffer, {
        // It's good practice to set the content type for proper handling by browsers.
        // This might need to be determined from the image generation service response.
        contentType: 'image/png', 
      });

      // 6. Generate a Signed URL for secure, temporary access
      const signedUrlOptions = {
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // URL is valid for 15 minutes
      };
      const [publicUrl] = await gcsFile.getSignedUrl(signedUrlOptions);

      // 7. Post-generation Tasks (Notifications & Logging)
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
      // 8. Error Handling and Quota Refund
      if (consumed && services.limitChecker && typeof services.limitChecker.refund === 'function') {
        await services.limitChecker.refund(tenantId, user.id, 1);
      }
      throw error;
    }
  }
}