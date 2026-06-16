import fs from 'fs';
import fsp from 'fs/promises'; // Import fs.promises for asynchronous file operations
import path from 'path';
import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import config from '../../../../config/index.js';

// --- Rate Limiting & DDOS Protection Setup ---

// Initialize Redis client for rate limiting.
// Using a persistent store like Redis is crucial for rate limiting in a distributed/multi-process environment.
// This client will attempt to connect to Redis using the REDIS_URL environment variable or default to localhost.
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('🔴 Redis Client Error for Rate Limiting:', err));

// Asynchronously connect to Redis. This IIFE (Immediately Invoked Function Expression)
// allows us to use top-level await for the connection process.
(async () => {
  try {
    await redisClient.connect();
    console.log('🟢 Redis client connected for rate limiting.');
  } catch (err) {
    console.error('🔴 Failed to connect to Redis for rate limiting. Rate limiting will not be effective.', err);
  }
})();


// Define the rate limiter middleware for the expensive audio transcription endpoint.
// This protects against API abuse, DDOS attacks, and excessive costs from Google Cloud services.
// Limits are applied per IP address. This middleware should be applied to the route that calls this service.
export const transcriptionLimiter = rateLimit({
  // Store request counts in Redis, making the limiter effective across multiple server instances or containers.
  // Falls back to in-memory store if Redis is not connected yet.
  store: (redisClient && redisClient.isOpen)
    ? new RedisStore({
        // The 'sendCommand' method is used by the Redis store to execute Redis commands.
        sendCommand: (...args) => redisClient.sendCommand(args),
      })
    : undefined,
  // The time window for which requests are checked, in milliseconds. Here, it's 15 minutes.
  windowMs: 15 * 60 * 1000,
  // The maximum number of requests allowed from a single IP within the windowMs.
  // This is a strict limit due to the high cost and processing time of transcription.
  limit: 20,
  // Use modern 'RateLimit-*' headers according to the IETF draft.
  standardHeaders: 'draft-7',
  // Do not send the legacy 'X-RateLimit-*' headers.
  legacyHeaders: false,
  // Custom message to be sent when the rate limit is exceeded.
  message: {
    status: 429,
    error: 'Too many transcription requests created from this IP. Please try again after 15 minutes.'
  },
});


const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3': return 'audio/mp3';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/m4a';
    case '.ogg': return 'audio/ogg';
    case '.webm': return 'audio/webm';
    case '.aac': return 'audio/aac';
    case '.flac': return 'audio/flac';
    default: return 'audio/mp3'; // Fallback
  }
};

// Map file extensions to RecognitionConfig parameters for Google Cloud STT v1
const getGcpSpeechConfig = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.wav':
      return {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US'
      };
    case '.flac':
      return {
        encoding: 'FLAC',
        sampleRateHertz: 16000,
        languageCode: 'en-US'
      };
    case '.mp3':
      return {
        encoding: 'MP3',
        sampleRateHertz: 16000,
        languageCode: 'en-US'
      };
    case '.webm':
      // Browsers typically record audio/webm opus at 48000 Hz or 16000 Hz
      return {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'en-US'
      };
    case '.ogg':
      return {
        encoding: 'OGG_OPUS',
        sampleRateHertz: 16000,
        languageCode: 'en-US'
      };
    default:
      return {
        encoding: 'ENCODING_UNSPECIFIED',
        sampleRateHertz: 16000,
        languageCode: 'en-US'
      };
  }
};

// Module-scoped cache for Google Cloud access token
let cachedAccessToken = null;
let tokenExpiryTime = 0; // Unix timestamp in milliseconds

// Helper function to resolve Google Cloud credentials and get an access token
const getGcpAccessToken = async () => {
  // Check if the cached token is still valid (refresh 1 minute before actual expiry)
  if (cachedAccessToken && tokenExpiryTime > Date.now() + 60 * 1000) {
    console.log('🟢 Using cached Google Cloud access token.');
    return cachedAccessToken;
  }

  const possiblePaths = [
    path.join(process.cwd(), 'alti_gcp.json'),
    path.join(process.cwd(), '../gcp-sa-key.json'),
    path.join(process.cwd(), 'gcp-sa-key.json'),
  ];

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const envPath = path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS
      : path.join(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
    possiblePaths.unshift(envPath);
  }

  for (const keyPath of possiblePaths) {
    if (fs.existsSync(keyPath)) {
      try {
        const auth = new GoogleAuth({
          keyFilename: keyPath,
          scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        if (tokenResponse.token) {
          console.log(`🟢 Successfully authenticated using key: ${keyPath}`);
          // Cache the token and its expiry time
          cachedAccessToken = tokenResponse.token;
          // GoogleAuth client.getAccessToken() returns { token, res } where res.expires_in is seconds
          tokenExpiryTime = Date.now() + (tokenResponse.res.expires_in * 1000);
          return cachedAccessToken;
        }
      } catch (authError) {
        console.warn(`⚠️ Authentication failed using key ${keyPath}: ${authError.message}`);
      }
    }
  }

  // Fallback to ADC
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (tokenResponse.token) {
      console.log('🟢 Successfully authenticated using Application Default Credentials (ADC)');
      // Cache the token and its expiry time
      cachedAccessToken = tokenResponse.token;
      tokenExpiryTime = Date.now() + (tokenResponse.res.expires_in * 1000);
      return cachedAccessToken;
    }
  } catch (error) {
    console.warn('⚠️ Application Default Credentials authentication failed');
  }

  return null;
};

const transcribeAudioToTextService = async (audioPath) => {
  // --- STEP 1: Try Google Cloud Speech-to-Text API ---
  try {
    console.log('🎙️ Attempting Google Cloud Speech-to-Text API transcription...');
    const accessToken = await getGcpAccessToken();

    if (!accessToken) {
      throw new Error('No valid Google Cloud Service Account key or credentials found');
    }

    // Use fs.promises.readFile for asynchronous file reading to prevent blocking the event loop
    const audioBuffer = await fsp.readFile(audioPath);
    const gcpConfig = getGcpSpeechConfig(audioPath);

    const requestBody = {
      config: gcpConfig,
      audio: {
        content: audioBuffer.toString('base64')
      }
    };

    const response = await fetch('https://speech.googleapis.com/v1/speech:recognize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(responseData.error?.message || `HTTP ${response.status} from Google Speech-to-Text API`);
    }

    if (responseData.results && responseData.results.length > 0) {
      const transcription = responseData.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      console.log('🟢 Google Cloud Speech-to-Text API transcription succeeded!');
      return transcription;
    } else {
      console.warn('⚠️ Google Cloud Speech-to-Text returned no results. Checking fallback...');
      throw new Error('GCP STT returned empty recognition results');
    }
  } catch (gcpError) {
    console.error('❌ Google Cloud Speech-to-Text API failed:', gcpError.message);

    // --- STEP 2: Google Gemini (Generative AI) Fallback (also Google Cloud) ---
    console.log('🔄 Falling back to Google Gemini Generative AI transcription (Google Cloud)...');
    try {
      const apiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key is not configured');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      // Use gemini-2.5-flash as the standard highly accurate multimodal transcription model
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // Use fs.promises.readFile for asynchronous file reading
      const audioBuffer = await fsp.readFile(audioPath);
      const mimeType = getMimeType(audioPath);

      const audioPart = {
        inlineData: {
          data: audioBuffer.toString('base64'),
          mimeType: mimeType
        }
      };

      const prompt = 'Please transcribe this audio into plain, accurate text. Output ONLY the transcription, with no conversational additions or filler.';

      const result = await model.generateContent([prompt, audioPart]);
      const text = result?.response?.text();
      if (text) {
        console.log('🟢 Google Gemini transcription succeeded!');
        return text;
      }
      throw new Error('Gemini returned an empty transcription');
    } catch (geminiError) {
      console.error('❌ Google Gemini transcription fallback failed:', geminiError.message);

      throw new Error(`All transcription services failed. Google Cloud STT: ${gcpError.message}. Google Gemini: ${geminiError.message}`);
    }
  }
};

export const whisperTranscribeService = {
  transcribeAudioToTextService,
};

// --- Graceful Shutdown for Cloud Run ---

// Cloud Run sends a SIGTERM signal to the container to signal that it's going to be shut down.
// We listen for this signal to gracefully close connections managed by this module.
process.on('SIGTERM', async () => {
  console.log('👋 SIGTERM signal received: closing Redis connection for rate limiting.');

  try {
    // The 'quit' command gracefully closes the connection to the Redis server.
    // It waits for all pending replies to be received before closing.
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log('🟢 Redis client for rate limiting disconnected successfully.');
    } else {
      console.log('🟡 Redis client for rate limiting was already disconnected.');
    }
  } catch (err) {
    console.error('🔴 Error during Redis client disconnection:', err);
  }

  // Note: The main server file (e.g., app.js or server.js) is responsible for
  // adding health check probes (/healthz, /readyz), binding to process.env.PORT,
  // and for gracefully stopping the HTTP server to allow in-flight requests to complete.
});