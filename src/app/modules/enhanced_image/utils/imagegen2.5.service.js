import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs/promises'; // Use the promise-based fs API for asynchronous operations
import * as path from 'node:path';
import dotenv from 'dotenv';
import { GCPStorageService } from '../services/gcpStorageService.js';
import config from '../../../../../config/index.js';

dotenv.config();

const ai = new GoogleGenAI({
  vertexAI: {
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
  },
});

// Initialize GCP Storage
const gcpKeyPath = path.join(process.cwd(), 'alti_gcp.json');
const gcpStorage = new GCPStorageService(
  'alti_assistant_generated_photo',
  gcpKeyPath
);

export async function imagen3(prompt, referenceImages, filename = 'image.png') {
  try {
    const message = prompt
      ? prompt
      : 'Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant\'s favorite food. Show the "ingredients" (sunlight, water, CO2) and the "finished dish" (sugar/energy). The style should be like a page from a colorful kids\' cookbook, suitable for a 4th grader.';

    const content = [{ text: message }];

    if (referenceImages && referenceImages.length > 0) {
      // Optimization: Read all reference images concurrently using fs.promises.readFile
      // This avoids blocking the event loop with synchronous fs.readFileSync calls in a loop.
      const imagePromises = referenceImages.map(async (imgPath) => {
        // SECURITY: Validate imgPath to prevent path traversal (LFI).
        // If referenceImages can come from user input, robust validation is crucial.
        // This basic check prevents common path traversal attempts like '..' or absolute paths.
        const normalizedPath = path.normalize(imgPath);
        if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
          throw new Error(`Invalid reference image path: ${imgPath}. Path traversal detected.`);
        }
        // For stronger security, ensure the path resolves within a designated safe directory:
        // const safeBaseDir = path.resolve(process.cwd(), 'temp_uploads'); // Example safe directory
        // const resolvedPath = path.resolve(imgPath);
        // if (!resolvedPath.startsWith(safeBaseDir + path.sep) && resolvedPath !== safeBaseDir) {
        //   throw new Error('Access denied: Reference image path is outside allowed directory.');
        // }

        const imgBytes = await fs.readFile(imgPath); // Asynchronously read file content
        const base64Image = imgBytes.toString('base64');
        return {
          inlineData: {
            // ROBUSTNESS: Assuming all reference images are PNGs.
            // If other image types are possible, dynamic MIME type detection (e.g., using 'mime-types' library)
            // or explicit MIME type passing would be required here for accuracy.
            mimeType: 'image/png',
            data: base64Image,
          },
        };
      });
      const imageContents = await Promise.all(imagePromises); // Wait for all images to be read
      content.push(...imageContents);
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: content,
    });

    let uploadedUrl = null;

    // ROBUSTNESS: Check if response.candidates and response.candidates[0] exist before accessing.
    if (!response || !response.candidates || response.candidates.length === 0) {
      console.error('No candidates found in the AI model response.');
      return null; // Or throw a specific error
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.text) {
        console.log(part.text);
      } else if (part.inlineData) {
        const imageData = part.inlineData.data;
        // BUG FIX: Use the actual MIME type from the AI response, defaulting to 'image/png'.
        const actualMimeType = part.inlineData.mimeType || 'image/png';
        const buffer = Buffer.from(imageData, 'base64');

        // ROBUSTNESS: Determine file extension from MIME type to ensure correct filename.
        let fileExtension = '.bin'; // Fallback for unknown types
        if (actualMimeType.includes('image/png')) {
          fileExtension = '.png';
        } else if (actualMimeType.includes('image/jpeg')) {
          fileExtension = '.jpeg';
        } else if (actualMimeType.includes('image/gif')) {
          fileExtension = '.gif';
        } else if (actualMimeType.includes('image/webp')) {
          fileExtension = '.webp';
        }
        // Add more image types as needed

        // Ensure the filename has the correct extension based on the actual MIME type.
        let finalFilename = filename;
        const currentExt = path.extname(filename);
        if (currentExt) {
          // If filename already has an extension, replace it if it doesn't match the actual content type.
          if (currentExt.toLowerCase() !== fileExtension.toLowerCase()) {
            finalFilename = filename.slice(0, -currentExt.length) + fileExtension;
          }
        } else {
          // If filename has no extension, append the correct one.
          finalFilename = filename + fileExtension;
        }

        // Upload to GCP bucket
        uploadedUrl = await gcpStorage.uploadBuffer(
          buffer,
          finalFilename, // Use the potentially adjusted filename
          actualMimeType // Use the actual MIME type from the AI response
        );
        console.log(`Image uploaded to GCP: ${uploadedUrl}`);
      }
    }

    return uploadedUrl;
  } catch (error) {
    // UNHANDLED PROMISE/ERROR HANDLING: Catch and log errors for robustness.
    // This ensures that any failures during file operations, AI API calls,
    // or GCP storage uploads are caught and reported.
    console.error('Error in imagen3 function:', error);
    // Re-throw the error so the caller can handle it appropriately.
    throw error;
  }
}