import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Redis } from 'ioredis';
import { GoogleGenAI } from '@google/genai';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';

// --- DDOS & API Abuse Protection ---
// Initialize Redis client for rate limiting.
// Connection details should be stored in environment variables and accessed via the config object.
const redisClient = new Redis(config.redis.url);

if (redisClient) {
  redisClient.on('error', err => console.error('Redis Client Error for Rate Limiter', err));
}

// Create a rate limiter for the expensive Google AI search endpoint.
// This helps prevent DDOS attacks, API abuse, and excessive costs.
// It limits each IP address to 10 requests per minute.
const serperApiLimiter = rateLimit({
	store: (redisClient && typeof redisClient.call === 'function') ? new RedisStore({
		sendCommand: (...args) => redisClient.call(...args),
	}) : undefined,
	windowMs: 1 * 60 * 1000, // 1 minute
	max: 10, // Limit each IP to 10 requests per window (per minute)
	message: {
		status: 429,
		message: 'Too many requests. Please try again after a minute.',
	},
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});


const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

const SerperAiGetResponseHandler = catchAsync(async (req, res) => {
  try {
    const prompt = req.body?.prompt;

    // Use Gemini with Google Search Grounding — replaces Serper API
    const result = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Search the web for: ${prompt}`,
      config: {
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
      },
    });

    const candidate = result.candidates?.[0];
    const answer = candidate?.content?.parts
      ?.filter((part) => part.text && !part.thought)
      ?.map((part) => part.text)
      ?.join('') || '';

    // Parse grounding metadata for structured search results
    const groundingMetadata = candidate?.groundingMetadata || {};
    const groundingChunks = groundingMetadata.groundingChunks || [];

    const searchSummary = answer;
    const formattedSearchResults = groundingChunks.slice(0, 3).map((chunk, index) => ({
      title: chunk.web?.title || `Result ${index + 1}`,
      link: chunk.web?.uri || '',
      snippet: answer.substring(0, 200),
      position: index + 1,
    }));

    return { searchSummary, formattedSearchResults };
  } catch (error) {
    console.error('Error fetching Google Search Grounding results:', error);
    return { searchSummary: '', formattedSearchResults: [] };
  }
});

export const SerperAiController = {
  // Apply the rate limiter as middleware before the controller handler.
  SerperAiGetResponse: [serperApiLimiter, SerperAiGetResponseHandler],
};