import { RateLimiterRedis } from 'rate-limiter-flexible';
import { GoogleGenAI } from '@google/genai';
import { RedisClient, redisClient } from '../../../../shared/redis.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';
import { GCPStorageService } from '../services/gcpStorageService.js';

// --- Rate Limiting & DDOS Guard Setup ---

// Define common Rate Limiting options.
const rateLimiterOptions = {
  storeClient: RedisClient.isEnabled ? redisClient : undefined,
  points: 10, // Default points, will be overridden.
  duration: 1, // Default duration, will be overridden.
};

// Rate Limiter for Authenticated Users (more generous).
// This protects against API abuse from authenticated users and controls costs.
// Limit: 30 image operations per hour per user ID.
const authRateLimiter = RedisClient.isEnabled
  ? new RateLimiterRedis({
      ...rateLimiterOptions,
      keyPrefix: 'rate_limit_image_auth_user',
      points: 30,
      duration: 60 * 60, // 1 hour in seconds
    })
  : null;

// Rate Limiter for Public/Unauthenticated Users (stricter).
// This protects against DDOS attempts and anonymous API abuse.
// Limit: 5 image operations per hour per IP address.
const publicRateLimiter = RedisClient.isEnabled
  ? new RateLimiterRedis({
      ...rateLimiterOptions,
      keyPrefix: 'rate_limit_image_public_ip',
      points: 5,
      duration: 60 * 60, // 1 hour in seconds
    })
  : null;

// --- End of Rate Limiting Setup ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {Object} GeneratedImageInfo
 * @property {string} url - The public URL of the generated or edited image.
 * @property {string} filename - The filename of the image as stored.
 * @property {string} service - The service used for image operation (e.g., 'imagen3-edit', 'imagen3-generate').
 * @property {string} reasoning - A brief description of the image operation.
 */

// Initialize GCP Storage
const gcpKeyPath = path.join(process.cwd(), 'alti_gcp.json');

/**
 * An instance of the GCPStorageService configured for the 'alti_assistant_generated_photo' bucket.
 * This service is used to upload generated or edited images to Google Cloud Storage.
 * @type {GCPStorageService}
 */
const gcpStorage = new GCPStorageService(
  'alti_assistant_generated_photo',
  gcpKeyPath
);

/**
 * Edits an existing image using the Gemini 3.1 Flash Image model (Imagen 3).
 * The edited image is then uploaded to Google Cloud Storage.
 * This function is rate-limited to prevent abuse and control costs.
 *
 * @param {string} prompt - The instruction for editing the image.
 * @param {string} imageBase64 - Base64 encoded image data. Can include or omit the data URL prefix (e.g., 'data:image/png;base64,').
 * @param {string} filename - The desired filename for the output image in GCP Storage (e.g., 'edited_image.png').
 * @param {string} apiKey - Your Google API key with access to Gemini models.
 * @param {string} limiterKey - The identifier for rate limiting (e.g., user ID for authenticated users, IP address for public).
 * @param {boolean} [isAuth=false] - A boolean indicating if the request is from an authenticated user.
 * @returns {Promise<GeneratedImageInfo>} A promise that resolves to an object containing the URL, filename, service, and reasoning for the generated image.
 * @throws {Error} If the rate limit is exceeded, if no image is generated, or if the AI model call fails.
 */
export async function editImageWithImagen3(
  prompt,
  imageBase64,
  filename,
  apiKey,
  limiterKey,
  isAuth = false
) {
  // Apply rate limiting before calling the expensive AI service.
  const limiter = isAuth ? authRateLimiter : publicRateLimiter;
  if (limiter && RedisClient.isReady) {
    try {
      await limiter.consume(limiterKey);
    } catch (rateLimiterRes) {
      if (rateLimiterRes instanceof Error) {
        console.error('Rate limiter Redis error in editImageWithImagen3:', rateLimiterRes);
      } else {
        // The rate-limiter-flexible library throws a rejection when the limit is exceeded.
        // This error should be caught by the controller to send a 429 Too Many Requests response.
        throw new Error(`Rate limit exceeded. Please try again later.`);
      }
    }
  }

  const ai = new GoogleGenAI({ apiKey });

  // Remove data URL prefix if present (data:image/...;base64,)
  const base64Data = imageBase64.includes(',')
    ? imageBase64.split(',')[1]
    : imageBase64;

  // Create message with image and edit instruction
  const message = [
    {
      text: prompt,
    },
    {
      inlineData: {
        mimeType: 'image/png', // Assuming input is PNG, but model output mimeType will be used for upload
        data: base64Data,
      },
    },
  ];

  try {
    let response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: message,
    });

    // Validate the AI model's response structure
    if (
      !response ||
      !response.candidates ||
      response.candidates.length === 0 ||
      !response.candidates[0].content ||
      !response.candidates[0].content.parts
    ) {
      throw new Error(
        'Invalid or empty response from AI model: No candidates or content found.'
      );
    }

    // Process response and upload to GCP
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const imageData = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png'; // Use actual mimeType from response, fallback to png
        const buffer = Buffer.from(imageData, 'base64');

        // Upload to GCP bucket
        const publicUrl = await gcpStorage.uploadBuffer(
          buffer,
          filename,
          mimeType // Use the MIME type provided by the AI model
        );

        return {
          url: publicUrl,
          filename: filename,
          service: 'imagen3-edit',
          reasoning: 'Image edited using Gemini 3.1 Flash Image (Imagen 3)',
        };
      }
    }

    throw new Error('No image data (inlineData) found in AI model response.');
  } catch (error) {
    console.error('Error during image editing with Imagen 3:', error);
    // Re-throw a more informative error for upstream handling
    throw new Error(`Failed to edit image with Imagen 3: ${error.message}`);
  }
}

/**
 * Generates a new image from a text prompt using the Imagen 3.0 Generate 002 model.
 * The generated image is then uploaded to Google Cloud Storage.
 * This function is rate-limited to prevent abuse and control costs.
 *
 * @param {string} prompt - The text prompt describing the image to generate.
 * @param {string} filename - The desired filename for the output image in GCP Storage (e.g., 'generated_art.png').
 * @param {string} apiKey - Your Google API key with access to Imagen models.
 * @param {string} limiterKey - The identifier for rate limiting (e.g., user ID for authenticated users, IP address for public).
 * @param {boolean} [isAuth=false] - A boolean indicating if the request is from an authenticated user.
 * @returns {Promise<GeneratedImageInfo>} A promise that resolves to an object containing the URL, filename, service, and reasoning for the generated image.
 * @throws {Error} If the rate limit is exceeded, if no image is generated, or if the AI model call fails.
 */
export async function generateImageWithImagen3(
  prompt,
  filename,
  apiKey,
  limiterKey,
  isAuth = false
) {
  // Apply rate limiting before calling the expensive AI service.
  const limiter = isAuth ? authRateLimiter : publicRateLimiter;
  if (limiter && RedisClient.isReady) {
    try {
      await limiter.consume(limiterKey);
    } catch (rateLimiterRes) {
      if (rateLimiterRes instanceof Error) {
        console.error('Rate limiter Redis error in generateImageWithImagen3:', rateLimiterRes);
      } else {
        // The rate-limiter-flexible library throws a rejection when the limit is exceeded.
        // This error should be caught by the controller to send a 429 Too Many Requests response.
        throw new Error(`Rate limit exceeded. Please try again later.`);
      }
    }
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Correctly interact with imagen-4.0-generate-002 using generateContent for image generation.
    // The chat API is generally for conversational models, not direct image generation.
    const response = await ai.models.generateContent({
      model: 'imagen-4.0-generate-002',
      contents: [{ text: prompt }], // Pass the prompt as text content
      // Configuration like responseModalities and tools are not typically used
      // for direct image generation models via generateContent and can be omitted.
    });

    // Validate the AI model's response structure
    if (
      !response ||
      !response.candidates ||
      response.candidates.length === 0 ||
      !response.candidates[0].content ||
      !response.candidates[0].content.parts
    ) {
      throw new Error(
        'Invalid or empty response from AI model: No candidates or content found.'
      );
    }

    // Process response and upload to GCP
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const imageData = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png'; // Use actual mimeType from response, fallback to png
        const buffer = Buffer.from(imageData, 'base64');

        // Upload to GCP bucket
        const publicUrl = await gcpStorage.uploadBuffer(
          buffer,
          filename,
          mimeType // Use the MIME type provided by the AI model
        );

        return {
          url: publicUrl,
          filename: filename,
          service: 'imagen3-generate',
          reasoning: 'Image generated using Imagen 3.0 Generate 002',
        };
      }
    }

    throw new Error('No image data (inlineData) found in AI model response.');
  } catch (error) {
    console.error('Error during image generation with Imagen 3:', error);
    // Re-throw a more informative error for upstream handling
    throw new Error(
      `Failed to generate image with Imagen 3: ${error.message}`
    );
  }
}