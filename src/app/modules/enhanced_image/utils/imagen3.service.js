import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "url";
import { GCPStorageService } from "../services/gcpStorageService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize GCP Storage
const gcpKeyPath = path.join(process.cwd(), "alti_gcp.json");
const gcpStorage = new GCPStorageService("alti_assistant_generated_photo", gcpKeyPath);

/**
 * Edit an image using Gemini 3 Pro Image
 * @param {string} prompt - The edit instruction
 * @param {string} imageBase64 - Base64 encoded image data (with or without data URL prefix)
 * @param {string} filename - Output filename
 * @param {string} apiKey - Google API key
 * @returns {Promise<Object>} - Generated image info
 */0
export async function editImageWithImagen3(prompt, imageBase64, filename, apiKey) {
  const ai = new GoogleGenAI({ apiKey });

  // Remove data URL prefix if present (data:image/...;base64,)
  const base64Data = imageBase64.includes(',')
    ? imageBase64.split(',')[1]
    : imageBase64;

  // Create message with image and edit instruction
  const message = [
    {
      text: prompt
    },
    {
      inlineData: {
        mimeType: "image/png",
        data: base64Data,
      },
    },
  ]

  let response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: message
  })

  // Process response and upload to GCP
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");

      // Upload to GCP bucket
      const publicUrl = await gcpStorage.uploadBuffer(buffer, filename, "image/png");

      return {
        url: publicUrl,
        filename: filename,
        service: "imagen3-edit",
        reasoning: "Image edited using Gemini 3 Pro Image (Imagen 3)",
      };
    }
  }

  throw new Error("No image generated in response");
}

/**
 * Generate a new image using Gemini 3 Pro Image
 * @param {string} prompt - The generation prompt
 * @param {string} filename - Output filename
 * @param {string} apiKey - Google API key
 * @returns {Promise<Object>} - Generated image info
 */
export async function generateImageWithImagen3(prompt, filename, apiKey) {
  const ai = new GoogleGenAI({ apiKey });

  const chat = ai.chats.create({
    model: "gemini-3-pro-image-preview",
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      tools: [{ googleSearch: {} }],
    },
  });

  const response = await chat.sendMessage({ message: prompt });

  // Process response and upload to GCP
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");

      // Upload to GCP bucket
      const publicUrl = await gcpStorage.uploadBuffer(buffer, filename, "image/png");

      return {
        url: publicUrl,
        filename: filename,
        service: "imagen3-generate",
        reasoning: "Image generated using Gemini 3 Pro Image (Imagen 3)",
      };
    }
  }

  throw new Error("No image generated in response");
}

