import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import dotenv from 'dotenv';
import { GCPStorageService } from '../services/gcpStorageService.js';
import config from '../../../../../config/index.js';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: config.gemini_secret_key,
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
    for (const imgPath of referenceImages) {
      const imgBytes = fs.readFileSync(imgPath);
      const base64Image = imgBytes.toString('base64');
      content.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64Image,
        },
      });
    }
  }

  let response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
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
