import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import dotenv from 'dotenv';
import { GCPStorageService } from '../services/gcpStorageService.js';
import config from '../../../../../config/index.js';

dotenv.config();

// Initialize GCP Storage
const gcpKeyPath = path.join(process.cwd(), 'alti_gcp.json');
const gcpStorage = new GCPStorageService(
  'alti_assistant_generated_photo',
  gcpKeyPath
);

/**
 * Generates an image using Google GenAI (Imagen 4.0) and uploads it to GCP Storage.
 *
 * @param {string} prompt - The text prompt for image generation.
 * @param {string} [outputFilename] - Optional. The desired filename for the uploaded image in GCP Storage.
 *                                    If a path is provided (e.g., '/tmp/my_image.png'), only the basename ('my_image.png') will be used.
 *                                    If not provided, a default filename like 'imagen-1.png' will be generated.
 * @returns {Promise<string|null>} The URL of the uploaded image, or null if an error occurs.
 * @throws {Error} If image generation or upload fails.
 */
export async function imagegen_4(prompt, outputFilename) {
  try {
    const ai = new GoogleGenAI({
      vertexAI: {
        project: config.google.gcp_project_id,
        location: config.google.vertex_ai_region || 'us-central1',
      },
    });

    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1, // Currently configured to generate a single image.
        personGeneration: 'allow_all',
        imageSize: '1K',
      },
    });

    let idx = 1;
    let uploadedUrl = null;

    // Iterate through generated images. With numberOfImages: 1, this loop runs exactly once.
    for (const generatedImage of response.generatedImages) {
      const imgBytes = generatedImage.image.imageBytes;
      const buffer = Buffer.from(imgBytes, 'base64');

      // Determine the filename for the uploaded image in GCP Storage.
      // If outputFilename is provided, use its basename. Otherwise, generate a default.
      const filename = outputFilename
        ? path.basename(outputFilename)
        : `imagen-${idx}.png`;

      // Upload the image buffer to the GCP bucket.
      uploadedUrl = await gcpStorage.uploadBuffer(buffer, filename, 'image/png');
      idx++; // Increment for potential future multiple images, though currently only 1.
    }

    return uploadedUrl;
  } catch (error) {
    // Log the error for debugging purposes.
    console.error('Error during image generation or upload:', error);
    // Re-throw a more descriptive error to the caller, ensuring unhandled promise rejections are avoided.
    throw new Error(`Failed to generate or upload image: ${error.message}`);
  }
}