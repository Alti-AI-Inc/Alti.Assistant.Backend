import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid'; // USER DATA: For generating unique, non-colliding filenames.
import dotenv from 'dotenv';
import { GCPStorageService } from '../services/gcpStorageService.js';
import config from '../../../../../config/index.js';

dotenv.config();

// CONFIGURATION: Centralize configurable values for easier management and environment-specific settings.
const MODEL_NAME = config.google.gemini_image_model || 'gemini-1.5-flash-001';
const GCP_BUCKET_NAME = config.gcp.storage_bucket_name || 'alti_assistant_generated_photo';
const GCP_KEY_PATH = config.gcp.key_file_path || path.join(process.cwd(), 'alti_gcp.json');
const MAX_REFERENCE_IMAGES = 5; // USER LIMITS: Enforce a reasonable limit on reference images to prevent abuse and manage costs.
const SAFE_UPLOADS_DIR = path.resolve(process.cwd(), 'temp_uploads'); // SECURITY: Define a sandboxed directory for user-provided files.

const ai = new GoogleGenAI({
  vertexAI: {
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
  },
});

// Initialize GCP Storage
const gcpStorage = new GCPStorageService(GCP_BUCKET_NAME, GCP_KEY_PATH);

// ROBUSTNESS: A map for MIME types to file extensions ensures correct file naming.
const mimeTypeToExtension = {
  'image/png': '.png',
  'image/jpeg': '.jpeg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/**
 * Generates an image based on a user prompt and optional reference images.
 * This function ensures user data isolation, enforces limits, and handles file operations securely.
 *
 * @param {string} userId - The unique identifier for the user to ensure data isolation and for usage tracking.
 * @param {string} prompt - The text prompt for image generation.
 * @param {Array<{path: string, mimeType: string}>} [referenceImages] - An array of objects, each with a path to a temporary reference image and its MIME type.
 * @returns {Promise<string|null>} The public URL of the generated and uploaded image, or null if no image was generated.
 * @throws {Error} Throws an error for invalid input, security violations, or failures in the generation/upload process.
 */
export async function imagen3(userId, prompt, referenceImages = []) {
  // USER EXPERIENCE/ROBUSTNESS: Validate inputs at the beginning of the function to fail fast with clear errors.
  if (!userId) {
    throw new Error('User ID is required for image generation to ensure data isolation.');
  }
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('A non-empty prompt is required for image generation.');
  }
  if (referenceImages.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`The number of reference images cannot exceed ${MAX_REFERENCE_IMAGES}.`);
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

      // DATA ISOLATION/SECURITY: Generate a unique, non-guessable filename within a user-specific folder.
      const uniqueFilename = `${uuidv4()}${fileExtension}`;
      const storagePath = `users/${userId}/generated/${uniqueFilename}`;

      // Upload the generated image buffer to cloud storage.
      const uploadedUrl = await gcpStorage.uploadBuffer(
        buffer,
        storagePath,
        mimeType
      );
      console.log(`User ${userId} image uploaded to GCP: ${uploadedUrl}`);
      return uploadedUrl;
    } else {
      // USER EXPERIENCE: Handle cases where the model returns text instead of an image (e.g., due to safety filters).
      const textResponse = response.candidates[0].content.parts.map(p => p.text).join('\n');
      console.warn(`AI model did not return an image for user ${userId}. Text response: "${textResponse}"`);
      return null; // Explicitly return null if no image was generated.
    }

  } catch (error) {
    // ERROR HANDLING: Log the detailed error with user context for debugging and re-throw to be handled by the calling service.
    console.error(`Error in imagen3 for user ${userId}:`, error);
    // Propagate the error to allow the controller to send an appropriate HTTP response to the end-user.
    throw error;
  }
}