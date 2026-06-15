import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid'; // USER DATA: For generating unique, non-colliding filenames.
import dotenv from 'dotenv';
import { GCPStorageService } from '../services/gcpStorageService.js';
import config from '../../../../../config/index.js';
import redisClient from '../../../../shared/redis.js'; // DDOS GUARD: Import shared Redis client for rate limiting.
// INTEGRATION: Import services for usage tracking and limit enforcement across the tenant hierarchy.
// This is an assumed service that encapsulates the business logic for checking and recording usage.
import { checkImageGenerationLimit, recordImageGeneration } from '../../usage/usage.service.js';

dotenv.config();

// DDOS GUARD/COST CONTROL: Define rate limits for the expensive image generation API.
// These limits are applied on a per-user basis to prevent abuse from a single authenticated user.

/**
 * @constant {number} RATE_LIMIT_PER_MINUTE
 * @description The maximum number of image generation requests a single user can make per minute.
 * This helps prevent abuse and controls costs associated with the generation API.
 */
const RATE_LIMIT_PER_MINUTE = 5; // Max 5 image generations per user per minute.

/**
 * @constant {number} RATE_LIMIT_PER_HOUR
 * @description The maximum number of image generation requests a single user can make per hour.
 * This provides a longer-term throttle on user activity.
 */
const RATE_LIMIT_PER_HOUR = 50; // Max 50 image generations per user per hour.

/**
 * @constant {number} RATE_LIMIT_WINDOW_MINUTE_SECONDS
 * @description The time-to-live in seconds for the per-minute rate limit key in Redis.
 */
const RATE_LIMIT_WINDOW_MINUTE_SECONDS = 60;

/**
 * @constant {number} RATE_LIMIT_WINDOW_HOUR_SECONDS
 * @description The time-to-live in seconds for the per-hour rate limit key in Redis.
 */
const RATE_LIMIT_WINDOW_HOUR_SECONDS = 3600;

// CONFIGURATION: Centralize configurable values for easier management and environment-specific settings.

/**
 * @constant {string} MODEL_NAME
 * @description The specific Google Gemini model to be used for image generation.
 * Pulled from application configuration.
 */
const MODEL_NAME = config.google.gemini_image_model || 'gemini-1.5-flash-001';

/**
 * @constant {string} GCP_BUCKET_NAME
 * @description The name of the Google Cloud Storage bucket where generated images will be stored.
 * Pulled from application configuration.
 */
const GCP_BUCKET_NAME = config.gcp.storage_bucket_name || 'alti_assistant_generated_photo';

/**
 * @constant {string} GCP_KEY_PATH
 * @description The local file system path to the GCP service account key file for authentication.
 * Pulled from application configuration.
 */
const GCP_KEY_PATH = config.gcp.key_file_path || path.join(process.cwd(), 'alti_gcp.json');

/**
 * @constant {number} MAX_REFERENCE_IMAGES
 * @description USER LIMITS: The maximum number of reference images a user can provide in a single request.
 * This helps prevent abuse and manage API costs.
 */
const MAX_REFERENCE_IMAGES = 5;

/**
 * @constant {string} SAFE_UPLOADS_DIR
 * @description SECURITY: The absolute path to a sandboxed directory for temporarily storing user-provided files.
 * This is used to prevent path traversal attacks.
 */
const SAFE_UPLOADS_DIR = path.resolve(process.cwd(), 'temp_uploads');

/**
 * @type {GoogleGenAI}
 * @description An instance of the Google Generative AI client, configured for Vertex AI.
 */
const ai = new GoogleGenAI({
  vertexAI: {
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
  },
});

/**
 * @type {GCPStorageService}
 * @description An instance of the GCP Storage service client for file uploads.
 */
const gcpStorage = new GCPStorageService(GCP_BUCKET_NAME, GCP_KEY_PATH);

/**
 * @constant {Object<string, string>}
 * @description ROBUSTNESS: A map to convert MIME types from the AI model's response to the correct file extensions.
 * This ensures generated files are saved with the appropriate extension.
 */
const mimeTypeToExtension = {
  'image/png': '.png',
  'image/jpeg': '.jpeg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/**
 * Generates an image based on a user prompt and optional reference images.
 * This function orchestrates the entire image generation process, including:
 * - Per-user rate limiting to prevent abuse.
 * - Workspace-level usage limit checks to enforce subscription plans.
 * - Secure handling of user-provided reference images.
 * - Interaction with the Google Vertex AI image generation model.
 * - Uploading the final image to Google Cloud Storage.
 * - Recording the generation event for usage tracking.
 *
 * @multi-tenant This service is multi-tenant aware. It uses the `workspaceId` from the
 * `userContext` to enforce usage limits and to store generated images in a tenant-specific
 * path within the cloud storage bucket, ensuring data isolation.
 *
 * @permission Role-based access control is applied. While all authenticated users can
 * access this function, `super_admin` users are exempt from workspace-level usage limits,
 * allowing them to perform administrative or testing tasks without restriction.
 *
 * @param {object} userContext - The context of the user making the request.
 * @param {string} userContext.id - The unique identifier for the user.
 * @param {string} userContext.workspaceId - The identifier for the user's workspace to enforce tenant boundaries and limits.
 * @param {string} userContext.role - The user's role (e.g., 'user', 'admin', 'super_admin') for applying role-based logic.
 * @param {string} prompt - The text prompt for image generation.
 * @param {Array<{path: string, mimeType: string}>} [referenceImages=[]] - An array of objects, each with a path to a temporary reference image and its MIME type.
 * @returns {Promise<string|null>} A promise that resolves to the public URL of the generated and uploaded image, or null if the AI model did not return an image.
 * @throws {Error} Throws an error for various failure conditions:
 * - If the `userContext` is invalid.
 * - If the `prompt` is empty.
 * - If the number of `referenceImages` exceeds the configured maximum.
 * - If the user exceeds their per-minute or per-hour rate limit (with `status: 429`).
 * - If the workspace has reached its image generation limit (with `status: 402`).
 * - If a reference image path is outside the secure temporary directory.
 * - If the AI model or cloud storage service fails during processing.
 */
export async function imagen3(userContext, prompt, referenceImages = []) {
  // USER EXPERIENCE/ROBUSTNESS: Validate inputs at the beginning of the function to fail fast with clear errors.
  if (!userContext || !userContext.id || !userContext.workspaceId || !userContext.role) {
    throw new Error('User context including ID, workspace ID, and role is required for image generation.');
  }
  const { id: userId, workspaceId, role } = userContext;

  // DDOS GUARD/COST CONTROL: Apply per-user rate limiting before processing the request.
  try {
    const keyMinute = `rate-limit:imagegen:${userId}:minute`;
    const keyHour = `rate-limit:imagegen:${userId}:hour`;

    // Atomically increment counters for both time windows using a Redis transaction.
    // This is crucial to prevent race conditions under high load.
    const results = await redisClient
      .multi()
      .incr(keyMinute)
      .incr(keyHour)
      .exec();

    // The result format for ioredis is an array of [error, value] tuples.
    const minuteResult = results[0];
    const hourResult = results[1];

    // If the transaction failed or any command within it failed, log and fail open.
    if (!minuteResult || minuteResult[0] || !hourResult || hourResult[0]) {
      console.error(`Redis rate-limiting command failed for user ${userId}. Allowing request to proceed as a fail-safe.`, { results });
    } else {
      const minuteCount = minuteResult[1];
      const hourCount = hourResult[1];

      // Set expiration only on the first request in each window to be efficient.
      if (minuteCount === 1) {
        await redisClient.expire(keyMinute, RATE_LIMIT_WINDOW_MINUTE_SECONDS);
      }
      if (hourCount === 1) {
        await redisClient.expire(keyHour, RATE_LIMIT_WINDOW_HOUR_SECONDS);
      }

      // Check if either limit is exceeded.
      if (minuteCount > RATE_LIMIT_PER_MINUTE || hourCount > RATE_LIMIT_PER_HOUR) {
        console.warn(`Rate limit exceeded for user ${userId}. Minute count: ${minuteCount}/${RATE_LIMIT_PER_MINUTE}, Hour count: ${hourCount}/${RATE_LIMIT_PER_HOUR}`);
        const error = new Error('Too many image generation requests. Please try again later.');
        error.status = 429; // HTTP 429 Too Many Requests
        throw error;
      }
    }
  } catch (redisError) {
      // FAIL-SAFE: If the Redis client throws an exception (e.g., connection error), log it.
      // We are choosing to "fail open" (allow the request) to maintain service availability,
      // but this risks cost overruns if Redis is down for an extended period.
      // A monitoring/alerting system for Redis health is critical.
      console.error(`Redis connection error during rate limiting for user ${userId}. Allowing request.`, redisError);
  }

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('A non-empty prompt is required for image generation.');
  }
  if (referenceImages.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`The number of reference images cannot exceed ${MAX_REFERENCE_IMAGES}.`);
  }

  // HIERARCHY/LIMITS: Before incurring costs, check if the user's workspace has exceeded its generation limits.
  // Super admins may be exempt from these limits for administrative purposes.
  if (role !== 'super_admin') {
      const canGenerate = await checkImageGenerationLimit(workspaceId);
      if (!canGenerate) {
          const error = new Error('Workspace image generation limit reached. Please upgrade your plan or contact your administrator.');
          error.status = 402; // HTTP 402 Payment Required is appropriate here.
          throw error;
      }
  }

  try {
    const content = [{ text: prompt }];

    if (referenceImages.length > 0) {
      // OPTIMIZATION/SECURITY: Process all reference images concurrently with security checks.
      const imagePromises = referenceImages.map(async (image) => {
        if (!image || !image.path || !image.mimeType) {
          throw new Error('Invalid reference image object. Both path and mimeType are required.');
        }

        // SECURITY (Path Traversal): Ensure the image path resolves within the designated safe directory.
        const resolvedPath = path.resolve(image.path);
        if (!resolvedPath.startsWith(SAFE_UPLOADS_DIR + path.sep) && resolvedPath !== SAFE_UPLOADS_DIR) {
          console.error(`Security violation: User ${userId} attempted to access path '${resolvedPath}' outside of the safe directory '${SAFE_UPLOADS_DIR}'.`);
          throw new Error('Access denied: Reference image path is outside the allowed directory.');
        }

        const imgBytes = await fs.readFile(resolvedPath);
        return {
          inlineData: {
            mimeType: image.mimeType,
            data: imgBytes.toString('base64'),
          },
        };
      });
      const imageContents = await Promise.all(imagePromises);
      content.push(...imageContents);
    }

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: content,
    });

    // ROBUSTNESS: Validate the AI model's response structure before processing.
    if (!response?.candidates?.[0]?.content?.parts) {
      console.error('Invalid or empty response from the AI model:', JSON.stringify(response, null, 2));
      throw new Error('Failed to generate image. The AI model returned an unexpected response.');
    }

    // Find the first image part in the response, as we typically expect one generated image.
    const imagePart = response.candidates[0].content.parts.find(part => part.inlineData);

    if (imagePart) {
      const { mimeType, data } = imagePart.inlineData;
      const buffer = Buffer.from(data, 'base64');

      // ROBUSTNESS: Determine file extension from the actual MIME type returned by the model.
      const fileExtension = mimeTypeToExtension[mimeType] || '.bin'; // Fallback for unknown types.

      // DATA ISOLATION/SECURITY: Generate a unique, non-guessable filename within a workspace-and-user-specific folder.
      const uniqueFilename = `${uuidv4()}${fileExtension}`;
      const storagePath = `workspaces/${workspaceId}/users/${userId}/generated/${uniqueFilename}`;

      // Upload the generated image buffer to cloud storage.
      const uploadedUrl = await gcpStorage.uploadBuffer(
        buffer,
        storagePath,
        mimeType
      );
      console.log(`User ${userId} in workspace ${workspaceId} image uploaded to GCP: ${uploadedUrl}`);

      // HIERARCHY/USAGE: Record the successful generation event. This service is responsible for
      // decrementing quotas and propagating usage data up to managers and workspace administrators.
      try {
          await recordImageGeneration(userId, workspaceId);
      } catch (usageError) {
          // FAIL-SAFE: If usage recording fails, log it critically but do not fail the user's request,
          // as the image has already been generated and stored. This prevents a poor user experience.
          // An external monitoring/reconciliation process should track these failures.
          console.error(`CRITICAL: Failed to record image generation usage for user ${userId} in workspace ${workspaceId}.`, usageError);
      }

      return uploadedUrl;
    } else {
      // USER EXPERIENCE: Handle cases where the model returns text instead of an image (e.g., due to safety filters).
      const textResponse = response.candidates[0].content.parts.map(p => p.text).join('\n');
      console.warn(`AI model did not return an image for user ${userId}. Text response: "${textResponse}"`);
      return null; // Explicitly return null if no image was generated.
    }

  } catch (error) {
    // ERROR HANDLING: Log the detailed error with user context for debugging and re-throw to be handled by the calling service.
    console.error(`Error in imagen3 for user ${userId} in workspace ${workspaceId}:`, error);
    // Propagate the error to allow the controller to send an appropriate HTTP response to the end-user.
    throw error;
  }
}