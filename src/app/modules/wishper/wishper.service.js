import fs from 'fs';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';

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

// Helper function to resolve Google Cloud credentials and get an access token
const getGcpAccessToken = async () => {
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
          return tokenResponse.token;
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
      return tokenResponse.token;
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

    const audioBuffer = fs.readFileSync(audioPath);
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
      // Use gemini-1.5-flash as the standard highly accurate multimodal transcription model
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const audioBuffer = fs.readFileSync(audioPath);
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

      // --- STEP 3: Self-Hosted open-source Whisper Fallback ---
      const selfHostedWhisperUrl = process.env.SELF_HOSTED_WHISPER_URL || config.self_hosted_whisper_url;
      if (selfHostedWhisperUrl) {
        console.log(`🔄 Attempting fallback to self-hosted Whisper at: ${selfHostedWhisperUrl}...`);
        try {
          const audioBuffer = fs.readFileSync(audioPath);
          const mimeType = getMimeType(audioPath);

          const fileBlob = new Blob([audioBuffer], { type: mimeType });
          const formData = new FormData();
          formData.append('file', fileBlob, path.basename(audioPath));
          formData.append('model', 'whisper-1');

          const response = await fetch(selfHostedWhisperUrl, {
            method: 'POST',
            body: formData,
          });

          const responseData = await response.json();
          if (response.ok && responseData.text) {
            console.log('🟢 Self-hosted Whisper transcription succeeded!');
            return responseData.text;
          } else {
            console.error('❌ Self-hosted Whisper fallback failed:', responseData.error?.message || responseData);
          }
        } catch (whisperError) {
          console.error('❌ Self-hosted Whisper fallback error:', whisperError.message);
        }
      }

      throw new Error(`All transcription services failed. Google Cloud STT: ${gcpError.message}. Google Gemini: ${geminiError.message}`);
    }
  }
};

export const whisperTranscribeService = {
  transcribeAudioToTextService,
};
