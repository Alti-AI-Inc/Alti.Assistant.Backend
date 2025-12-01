import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";
import { GCPStorageService } from "../services/gcpStorageService.js";
import config from "../../../../../config/index.js";

dotenv.config();

// Initialize GCP Storage
const gcpKeyPath = path.join(process.cwd(), "alti_gcp.json");
const gcpStorage = new GCPStorageService("alti_generated_photo", gcpKeyPath);

export async function imagegen_4(prompt, download_path) {

  const ai = new GoogleGenAI({
    apiKey: config.gemini_secret_key,
  });

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: prompt,
    config: {
      numberOfImages: 1,
      personGeneration: 'allow_all',
      imageSize: '1K',
    },
  });

  let idx = 1;
  let uploadedUrl = null;

  for (const generatedImage of response.generatedImages) {
    let imgBytes = generatedImage.image.imageBytes;
    const buffer = Buffer.from(imgBytes, "base64");

    // Extract filename from download_path
    const filename = download_path ? path.basename(download_path) : `imagen-${idx}.png`;

    // Upload to GCP bucket
    uploadedUrl = await gcpStorage.uploadBuffer(buffer, filename, "image/png");
    idx++;
  }

  return uploadedUrl;
}
