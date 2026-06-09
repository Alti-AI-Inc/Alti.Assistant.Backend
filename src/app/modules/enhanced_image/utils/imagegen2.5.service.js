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
  const message = prompt
    ? prompt
    : 'Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant\'s favorite food. Show the "ingredients" (sunlight, water, CO2) and the "finished dish" (sugar/energy). The style should be like a page from a colorful kids\' cookbook, suitable for a 4th grader.';

  const content = [{ text: message }];

  if (referenceImages && referenceImages.length > 0) {
    // Optimization: Read all reference images concurrently using fs.promises.readFile
    // This avoids blocking the event loop with synchronous fs.readFileSync calls in a loop.
    const imagePromises = referenceImages.map(async (imgPath) => {
      const imgBytes = await fs.readFile(imgPath); // Asynchronously read file content
      const base64Image = imgBytes.toString('base64');
      return {
        inlineData: {
          mimeType: 'image/png', // Assuming all reference images are PNGs, adjust if dynamic mime types are needed
          data: base64Image,
        },
      };
    });
    const imageContents = await Promise.all(imagePromises); // Wait for all images to be read
    content.push(...imageContents);
  }

  let response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image',
    contents: content,
  });

  let uploadedUrl = null;

  for (const part of response.candidates[0].content.parts) {
    if (part.text) {
      console.log(part.text);
    } else if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, 'base64');

      // Upload to GCP bucket
      uploadedUrl = await gcpStorage.uploadBuffer(
        buffer,
        filename,
        'image/png'
      );
      console.log(`Image uploaded to GCP: ${uploadedUrl}`);
    }
  }

  return uploadedUrl;
}